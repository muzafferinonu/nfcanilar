"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type ScanState = {
  pairId?: string;
  a: boolean;
  b: boolean;
  complete: boolean;
  error?: string;
};

export default function MPage() {
  const sp = useSearchParams();
  const token = useMemo(() => sp.get("t") || "", [sp]);

  const [state, setState] = useState<ScanState>({
    a: false,
    b: false,
    complete: false,
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    (async () => {
      setLoading(true);
      setState((s) => ({ ...s, error: undefined }));

      try {
        const res = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          setState({
            a: false,
            b: false,
            complete: false,
            error: data?.error || "Hata oluştu",
          });
          return;
        }

        setState({
          pairId: data.pairId,
          a: !!data.a,
          b: !!data.b,
          complete: !!data.complete,
        });

        // Kilit açıldıysa istersen otomatik anılara gönder:
        // if (data.complete) {
        //   window.location.href = `/anilar?pair=${data.pairId}`;
        // }
      } catch (e: any) {
        setState({
          a: false,
          b: false,
          complete: false,
          error: e?.message || "Bilinmeyen hata",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 40, margin: 0 }}>📷 Anılar Sayfası</h1>
      <p style={{ opacity: 0.8, marginTop: 10 }}>
        Bu sayfa NFC ile açılmak için hazır. İki NFC okutulduğunda anılar açılacak.
      </p>

      <hr style={{ margin: "16px 0", opacity: 0.2 }} />

      {!token && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            border: "1px solid #333",
            borderRadius: 14,
          }}
        >
          <b>Token yok.</b>
          <div style={{ marginTop: 8, opacity: 0.85 }}>
            URL şu formatta olmalı: <code>/m?t=TOKEN</code>
          </div>
        </div>
      )}

      {token && (
        <div style={{ marginTop: 8 }}>
          {loading && (
            <div style={{ marginTop: 10, opacity: 0.85 }}>Kontrol ediliyor...</div>
          )}

          {state.error ? (
            <div
              style={{
                marginTop: 16,
                padding: 14,
                border: "1px solid #a00",
                borderRadius: 14,
              }}
            >
              ❌ {state.error}
            </div>
          ) : (
            <>
              <div style={{ marginTop: 14, fontSize: 18, lineHeight: 1.9 }}>
                <div>
                  1. NFC:{" "}
                  <b>{state.a ? "✅ OKUNDU (1/2)" : "⬜ Bekleniyor (0/2)"}</b>
                </div>
                <div>
                  2. NFC: <b>{state.b ? "✅ OKUNDU (2/2)" : "⬜ Bekleniyor"}</b>
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  padding: 16,
                  border: "1px solid #333",
                  borderRadius: 16,
                }}
              >
                {state.complete ? (
                  <>
                    <div style={{ fontSize: 20 }}>
                      🎉 <b>Kilit Açıldı</b>
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.85 }}>
                      Buraya anıları (foto/video/metin) koyacağız.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 20 }}>
                      🔒 <b>Kilitli</b>
                    </div>
                    <div style={{ marginTop: 6, opacity: 0.85 }}>
                      İkinci NFC de okutulunca açılacak.
                    </div>
                  </>
                )}
              </div>

              {/* İstersen debug amaçlı pairId göster */}
              {state.pairId && (
                <div style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>
                  pairId: <code>{state.pairId}</code>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
