"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export default function SupabaseTestPage() {
  const [status, setStatus] = useState("Test ediliyor...");

  useEffect(() => {
    (async () => {
      try {
        // Tablo kurmadan da çalışır: session endpointine istek atıyoruz
        const { error } = await supabase.auth.getSession();
        if (error) throw error;

        setStatus("✅ Supabase bağlantısı OK");
      } catch (e: any) {
        setStatus("❌ Hata: " + (e?.message || "Bilinmiyor"));
      }
    })();
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1>Supabase Test</h1>
      <p>{status}</p>
    </main>
  );
}
