"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { deriveKeyFromNFC, encryptPayload, decryptPayload } from "../../lib/crypto";

type Step = "NEED_2_NFC" | "CAMERA" | "PREVIEW_FORM" | "SAVED";

type PairRow = {
  id: string;
  token_a: string | null;
  token_b: string | null;
  is_complete: boolean | null;
};

type MemoryRow = {
  id: string;
  pair_id: string;
  encrypted_payload: string | null;
  photo_url: string | null;
  quote: string | null;
};

function nowISO() {
  return new Date().toISOString();
}

export default function MPage() {
  const sp = useSearchParams();
  const token = (sp.get("k") || "").trim(); // artık gerçek token gelecek

  const [step, setStep] = useState<Step>("NEED_2_NFC");
  const [error, setError] = useState<string>("");

  const [pairId, setPairId] = useState<string>("");
  const [tokenA, setTokenA] = useState<string>("");
  const [tokenB, setTokenB] = useState<string>("");
  const [progress, setProgress] = useState<"0/2" | "1/2" | "2/2">("0/2");

  // Kamera
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string>("");

  // Söz
  const [quote, setQuote] = useState<string>("");

  // Kayıt sonucu
  const [savedId, setSavedId] = useState<string>("");

  // -----------------------------
  // Helpers: Pair bul/oluştur/tamamla
  // -----------------------------

  async function findPairByToken(t: string): Promise<PairRow | null> {
    // token_a = t
    const a = await supabase
      .from("pairs")
      .select("id, token_a, token_b, is_complete")
      .eq("token_a", t)
      .maybeSingle();

    if (a.data) return a.data as PairRow;

    // token_b = t
    const b = await supabase
      .from("pairs")
      .select("id, token_a, token_b, is_complete")
      .eq("token_b", t)
      .maybeSingle();

    if (b.data) return b.data as PairRow;

    return null;
  }

  async function findOpenPairToComplete(excludeToken: string): Promise<PairRow | null> {
    // token_b boş olan (henüz tamamlanmamış) bir pair bulalım
    // en yenisini almak için created_at yoksa id ile zor, ama şimdilik "limit 1" yeter
    const { data, error } = await supabase
      .from("pairs")
      .select("id, token_a, token_b, is_complete")
      .is("token_b", null)
      .neq("token_a", excludeToken)
      .limit(1);

    if (error) return null;
    if (!data || data.length === 0) return null;
    return data[0] as PairRow;
  }

  async function createPair(t: string): Promise<PairRow> {
    const { data, error } = await supabase
      .from("pairs")
      .insert({
        token_a: t,
        token_b: null,
        is_complete: false,
      })
      .select("id, token_a, token_b, is_complete")
      .single();

    if (error) throw error;
    return data as PairRow;
  }

  async function completePair(pair: PairRow, secondToken: string): Promise<PairRow> {
    const { data, error } = await supabase
      .from("pairs")
      .update({
        token_b: secondToken,
        is_complete: true,
      })
      .eq("id", pair.id)
      .select("id, token_a, token_b, is_complete")
      .single();

    if (error) throw error;
    return data as PairRow;
  }

  // -----------------------------
  // 1) Token geldiğinde pair akışını çalıştır
  // -----------------------------
  useEffect(() => {
    setError("");
    setSavedId("");
    setPhotoDataUrl("");
    setQuote("");

    if (!token) {
      setProgress("0/2");
      setStep("NEED_2_NFC");
      return;
    }

    (async () => {
      try {
        // 1) Bu token zaten bir pair içinde mi?
        let pair = await findPairByToken(token);

        if (!pair) {
          // 2) Değilse: tamamlanmayı bekleyen açık pair var mı?
          const open = await findOpenPairToComplete(token);

          if (open && open.token_a) {
            // Bu token ikinci NFC olarak geldi, open pair'i tamamla
            pair = await completePair(open, token);
          } else {
            // 3) Hiç open yoksa yeni pair başlat (ilk NFC)
            pair = await createPair(token);
          }
        }

        setPairId(pair.id);
        setTokenA(pair.token_a || "");
        setTokenB(pair.token_b || "");

        if (pair.token_a && pair.token_b) {
          setProgress("2/2");
          setStep("CAMERA");
        } else {
          setProgress("1/2");
          setStep("NEED_2_NFC");
        }
      } catch (e: any) {
        setError("Pair işlemi hata: " + (e?.message || "Bilinmiyor"));
        setProgress("0/2");
        setStep("NEED_2_NFC");
      }
    })();
  }, [token]);

  // -----------------------------
  // 2) 2/2 olunca: mevcut memory var mı çek + decrypt et
  // -----------------------------
  useEffect(() => {
    if (progress !== "2/2") return;
    if (!pairId) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("memories")
          .select("id, pair_id, encrypted_payload, photo_url, quote")
          .eq("pair_id", pairId)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) return;
        if (!data || data.length === 0) return;

        const row = data[0] as MemoryRow;

        // Öncelik: encrypted_payload varsa onu çöz
        if (row.encrypted_payload && tokenA && tokenB) {
          const key = await deriveKeyFromNFC(tokenA, tokenB);
          const payload = await decryptPayload(key, row.encrypted_payload);

          setPhotoDataUrl(payload.photoDataUrl || "");
          setQuote(payload.quote || "");
        } else {
          // şifre yoksa düz alanlardan göster
          setPhotoDataUrl(row.photo_url || "");
          setQuote(row.quote || "");
        }

        setSavedId(row.id);
        setStep("PREVIEW_FORM");

        // Kamera açıksa kapat
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      } catch {
        // sessiz geç
      }
    })();
  }, [progress, pairId, tokenA, tokenB]);

  // -----------------------------
  // 3) Kamera başlat
  // -----------------------------
  useEffect(() => {
    if (step !== "CAMERA") return;
    if (progress !== "2/2") return;

    (async () => {
      try {
        setError("");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e: any) {
        setError("Kamera açılamadı: " + (e?.message || "Bilinmiyor"));
      }
    })();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [step, progress]);

  const canCapture = useMemo(() => step === "CAMERA" && progress === "2/2", [step, progress]);

  function capturePhoto() {
    setError("");
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setPhotoDataUrl(dataUrl);
    setStep("PREVIEW_FORM");
  }

  function resetUIOnly() {
    // DB'yi silmiyoruz; sadece ekranda sıfırlarız
    setPhotoDataUrl("");
    setQuote("");
    setSavedId("");
    if (progress === "2/2") setStep("CAMERA");
    else setStep("NEED_2_NFC");
    setError("");
  }

  // -----------------------------
  // 4) Kaydet: pair_id ile memories’e yaz
  // -----------------------------
  async function save() {
    try {
      setError("");

      if (progress !== "2/2" || !pairId || !tokenA || !tokenB) {
        setError("2 NFC tamamlanmadan kaydedilemez.");
        return;
      }
      if (!photoDataUrl) {
        setError("Önce foto çek.");
        return;
      }
      if (!quote.trim()) {
        setError("Söz boş olamaz.");
        return;
      }

      const payload = {
        v: "v1",
        quote: quote.trim(),
        createdAt: nowISO(),
        photoDataUrl,
      };

      const key = await deriveKeyFromNFC(tokenA, tokenB);
      const encrypted = await encryptPayload(key, payload);

      const { data, error } = await supabase
        .from("memories")
        .insert({
          pair_id: pairId,
          encrypted_payload: encrypted,
          payload_version: "v1",
          is_locked: false,
          is_test: false,
          // photo_url / quote düz de basmak istersen:
          photo_url: null,
          quote: null,
        })
        .select("id")
        .single();

      if (error) throw error;

      setSavedId(data.id);
      setStep("SAVED");
    } catch (e: any) {
      setError("Kaydedilemedi: " + (e?.message || "Bilinmiyor"));
    }
  }

  return (
    <main style={{ padding: 18, maxWidth: 680, margin: "0 auto", fontFamily: "system-ui, Arial" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>/m — NFC Anı</h1>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div>
          <b>İlerleme:</b> {progress}
        </div>
        <button onClick={resetUIOnly} style={{ marginLeft: "auto" }}>
          Ekranı Sıfırla
        </button>
      </div>

      <div style={{ opacity: 0.85, marginBottom: 12 }}>
        <div>
          <b>Token:</b> <code>{token || "(yok)"}</code>
        </div>
        <div>
          <b>pair_id:</b> <code>{pairId || "(yok)"}</code>
        </div>
      </div>

      {error && (
        <div style={{ background: "#2a0000", color: "#ffd0d0", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {step === "NEED_2_NFC" && (
        <div style={{ background: "#111", padding: 14, borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>2 NFC birlikte okutulmadan hiçbir şey açılmaz.</p>
          <p style={{ marginBottom: 0 }}>
            Şu an <b>1/2</b> isen, ikinci etiketi okutunca otomatik tamamlanır.
          </p>
        </div>
      )}

      {step === "CAMERA" && (
        <div style={{ background: "#111", padding: 14, borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>
            ✅ 2/2 oldu. Şimdi <b>kamera</b> açık.
          </p>

          <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 10, background: "#000" }} />

          <button
            onClick={capturePhoto}
            disabled={!canCapture}
            style={{ marginTop: 12, width: "100%", padding: 12, fontSize: 16 }}
          >
            Foto Çek
          </button>
        </div>
      )}

      {step === "PREVIEW_FORM" && (
        <div style={{ background: "#111", padding: 14, borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>
            Foto hazır. Şimdi sözünü yaz ve <b>Kaydet</b>.
          </p>

          {photoDataUrl ? (
            <img src={photoDataUrl} alt="Foto" style={{ width: "100%", borderRadius: 10, marginBottom: 12 }} />
          ) : (
            <div style={{ opacity: 0.85, marginBottom: 12 }}>Foto yok.</div>
          )}

          <label style={{ display: "block", marginBottom: 6 }}>Özel söz</label>
          <textarea
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            rows={4}
            placeholder="Buraya özel söz..."
            style={{ width: "100%", padding: 10, borderRadius: 8 }}
          />

          <div style={{ marginTop: 10, opacity: 0.85 }}>
            <b>Tarih/Saat:</b> {new Date().toLocaleString()}
          </div>

          <button onClick={save} style={{ marginTop: 12, width: "100%", padding: 12, fontSize: 16 }}>
            Kaydet
          </button>

          <button
            onClick={() => {
              setPhotoDataUrl("");
              setStep("CAMERA");
            }}
            style={{ marginTop: 10, width: "100%", padding: 10 }}
          >
            Yeniden Çek
          </button>
        </div>
      )}

      {step === "SAVED" && (
        <div style={{ background: "#0b1b0b", padding: 14, borderRadius: 10 }}>
          <h2 style={{ marginTop: 0 }}>✅ Kayıt alındı</h2>
          <p style={{ marginBottom: 6 }}>Supabase kaydı (id):</p>
          <code style={{ display: "block", padding: 10, background: "#061006", borderRadius: 8 }}>{savedId}</code>

          <p style={{ opacity: 0.85 }}>
            Aynı iki NFC tekrar okutulunca (tokenA+tokenB tamamlanınca) bu pair’ın kaydı çekilip gösterilir.
          </p>

          <button onClick={resetUIOnly} style={{ marginTop: 10, width: "100%", padding: 12 }}>
            Devam
          </button>
        </div>
      )}
    </main>
  );
}
