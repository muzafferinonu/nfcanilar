"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { encryptPayload, decryptPayload, fileToBase64, base64ToBlob } from "@/lib/cryptoVault";

type Step = "scan" | "create" | "locked" | "open";

type LocalPairState = {
  t1?: string; // secret for tag1
  t2?: string; // secret for tag2
};

function lsKey(pairId: string) {
  return `pair:${pairId}`;
}

function readLocalPair(pairId: string): LocalPairState {
  try {
    const raw = localStorage.getItem(lsKey(pairId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalPair(pairId: string, v: LocalPairState) {
  localStorage.setItem(lsKey(pairId), JSON.stringify(v));
}

function nowLocalDateTime() {
  const d = new Date();
  // yyyy-mm-ddThh:mm for input[type=datetime-local]
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PageM() {
  const sp = useSearchParams();

  const pairId = sp.get("p") || "";
  const tag = sp.get("t") || ""; // "1" or "2"
  const secret = sp.get("s") || ""; // long random

  const [localState, setLocalState] = useState<LocalPairState>({});
  const [step, setStep] = useState<Step>("scan");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  // create form
  const [message, setMessage] = useState("");
  const [dateTime, setDateTime] = useState(nowLocalDateTime());
  const [file, setFile] = useState<File | null>(null);

  // open view
  const [openMessage, setOpenMessage] = useState("");
  const [openDateTime, setOpenDateTime] = useState("");
  const [openImageUrl, setOpenImageUrl] = useState<string>("");

  const progressText = useMemo(() => {
    const ok1 = !!localState.t1;
    const ok2 = !!localState.t2;
    if (ok1 && ok2) return "2/2 NFC okundu ✅";
    if (ok1 || ok2) return "1/2 NFC okundu…";
    return "0/2 NFC okundu";
  }, [localState]);

  useEffect(() => {
    if (!pairId) {
      setErr("Eksik link: p (pair id) yok.");
      return;
    }

    // load local secrets for that pair
    const current = readLocalPair(pairId);

    // if this visit has a tag+secret, store it
    let changed = false;
    if (tag === "1" && secret) {
      current.t1 = secret;
      changed = true;
    }
    if (tag === "2" && secret) {
      current.t2 = secret;
      changed = true;
    }
    if (changed) writeLocalPair(pairId, current);

    setLocalState(current);
  }, [pairId, tag, secret]);

  useEffect(() => {
    // decide view: if entry exists -> locked/open; else -> create when 2/2 scanned
    const run = async () => {
      if (!pairId) return;
      setErr("");
      setLoading(true);
      try {
        const { data, error } = await supabase.from("entries").select("*").eq("pair_id", pairId).maybeSingle();
        if (error) throw error;

        const hasBoth = !!localState.t1 && !!localState.t2;

        if (!data) {
          // no entry yet
          setStep(hasBoth ? "create" : "scan");
        } else {
          // entry exists
          setStep(hasBoth ? "open" : "locked");
        }
      } catch (e: any) {
        setErr(e?.message || "Bir hata oldu.");
      } finally {
        setLoading(false);
      }
    };

    run();
    // only when localState changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairId, localState.t1, localState.t2]);

  async function onLock() {
    if (!pairId) return;
    if (!localState.t1 || !localState.t2) {
      setErr("Kilitlemek için 2 NFC de okutulmalı.");
      return;
    }
    if (!file) {
      setErr("Lütfen fotoğraf seç.");
      return;
    }

    setErr("");
    setLoading(true);
    try {
      // 1) payload oluştur
      const imgB64 = await fileToBase64(file);
      const payload = {
        message,
        dateTime,
        image: { b64: imgB64, mime: file.type || "image/jpeg" },
      };

      // 2) tarayıcıda şifrele
      const pkg = await encryptPayload(localState.t1, localState.t2, JSON.stringify(payload));

      // 3) encrypted binary'yi storage'a yükle
      const filePath = `pairs/${pairId}/vault.bin`;

      const { error: upErr } = await supabase.storage.from("vault").upload(filePath, pkg.cipher, {
        upsert: true,
        contentType: "application/octet-stream",
      });
      if (upErr) throw upErr;

      // 4) DB’ye metadata yaz
      const { error: dbErr } = await supabase.from("entries").upsert({
        pair_id: pairId,
        file_path: filePath,
        locked: true,
        salt_base64: pkg.salt_base64,
        iv_base64: pkg.iv_base64,
        algo: pkg.algo,
        version: pkg.version,
      });
      if (dbErr) throw dbErr;

      setStep("locked");
    } catch (e: any) {
      setErr(e?.message || "Kilitleme sırasında hata oldu.");
    } finally {
      setLoading(false);
    }
  }

  async function onOpen() {
    if (!pairId) return;
    if (!localState.t1 || !localState.t2) {
      setErr("Açmak için iki NFC de okutulmalı.");
      return;
    }

    setErr("");
    setLoading(true);
    try {
      const { data, error } = await supabase.from("entries").select("*").eq("pair_id", pairId).single();
      if (error) throw error;

      // storage’dan şifreli dosyayı indir
      const { data: dl, error: dlErr } = await supabase.storage.from("vault").download(data.file_path);
      if (dlErr) throw dlErr;

      const cipherBuf = new Uint8Array(await dl.arrayBuffer());

      // çöz
      const plainJson = await decryptPayload(localState.t1, localState.t2, {
        cipher: cipherBuf,
        salt_base64: data.salt_base64,
        iv_base64: data.iv_base64,
      });

      const payload = JSON.parse(plainJson);
      setOpenMessage(payload.message || "");
      setOpenDateTime(payload.dateTime || "");
      const mime = payload?.image?.mime || "image/jpeg";
      const b64 = payload?.image?.b64 || "";
      const blob = base64ToBlob(b64, mime);

      // blob url
      if (openImageUrl) URL.revokeObjectURL(openImageUrl);
      const url = URL.createObjectURL(blob);
      setOpenImageUrl(url);

      setStep("open");
    } catch (e: any) {
      setErr(
        (e?.message || "Açma sırasında hata oldu.") +
          "\n\nNot: NFC secret yanlışsa veya bir NFC kayıpsa çözme imkansız."
      );
    } finally {
      setLoading(false);
    }
  }

  function resetLocal() {
    if (!pairId) return;
    localStorage.removeItem(lsKey(pairId));
    setLocalState({});
    setStep("scan");
    setErr("");
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h2 style={{ marginBottom: 8 }}>NFC Anı Kasası</h2>

      <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10, marginBottom: 12 }}>
        <div><b>Pair:</b> {pairId || "-"}</div>
        <div><b>Durum:</b> {progressText}</div>
        {loading ? <div style={{ marginTop: 8 }}>Yükleniyor…</div> : null}
      </div>

      {err ? (
        <div style={{ whiteSpace: "pre-wrap", padding: 12, border: "1px solid #f99", borderRadius: 10, marginBottom: 12 }}>
          <b>Hata / Uyarı:</b> {err}
        </div>
      ) : null}

      {step === "scan" && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <p>
            Önce iki NFC’yi de okut. İkisi de okununca otomatik form açılacak.
          </p>
          <button onClick={resetLocal} style={{ padding: "10px 12px", borderRadius: 10 }}>
            Bu cihazda sıfırla
          </button>
        </div>
      )}

      {step === "create" && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Anıyı Kaydet</h3>

          <label style={{ display: "block", marginBottom: 6 }}>Fotoğraf</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={{ marginBottom: 12 }}
          />

          <label style={{ display: "block", marginBottom: 6 }}>Söz / Not</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10 }}
          />

          <label style={{ display: "block", marginBottom: 6 }}>Tarih / Saat</label>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            style={{ width: "100%", marginBottom: 12, padding: 10, borderRadius: 10 }}
          />

          <button
            onClick={onLock}
            style={{ padding: "12px 14px", borderRadius: 10, width: "100%", fontWeight: 700 }}
          >
            KİLİTLE 🔒
          </button>

          <p style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>
            Not: Kilitleyince içerik şifreli gider. NFC kaybolursa geri dönüş yok.
          </p>
        </div>
      )}

      {step === "locked" && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Kilitli 🔒</h3>
          <p>
            Açmak için iki NFC’yi tekrar okut. Sonra aşağıdan <b>AÇ</b> butonuna bas.
          </p>
          <button onClick={onOpen} style={{ padding: "12px 14px", borderRadius: 10, width: "100%", fontWeight: 700 }}>
            AÇ 🔓
          </button>
          <div style={{ marginTop: 10 }}>
            <button onClick={resetLocal} style={{ padding: "10px 12px", borderRadius: 10 }}>
              Bu cihazda sıfırla
            </button>
          </div>
        </div>
      )}

      {step === "open" && (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          <h3 style={{ marginTop: 0 }}>Açıldı ✅</h3>
          {openDateTime ? <div style={{ marginBottom: 10 }}><b>Tarih/Saat:</b> {openDateTime}</div> : null}
          {openImageUrl ? (
            <img src={openImageUrl} alt="anı" style={{ width: "100%", borderRadius: 12, marginBottom: 12 }} />
          ) : null}
          <div style={{ whiteSpace: "pre-wrap" }}>{openMessage}</div>

          <div style={{ marginTop: 12 }}>
            <button onClick={resetLocal} style={{ padding: "10px 12px", borderRadius: 10 }}>
              Bu cihazda sıfırla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
