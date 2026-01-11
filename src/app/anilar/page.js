'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const STORAGE_KEY = 'nfc_keys_v1';

export default function AnilarPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let keys = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      keys = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(keys)) keys = [];
    } catch {
      keys = [];
    }

    const uniqueCount = new Set(keys).size;

    if (uniqueCount >= 2) {
      setOk(true);
    } else {
      router.replace('/');
    }
  }, [router]);

  if (!ok) return null;

  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>📸 Anılar Sayfası</h1>
      <p style={styles.p}>✅ Kilit açıldı. Buraya anıları koyacağız.</p>
      <p style={styles.p2}>Şimdilik test ekranı. İstersen buraya foto/video koyarız.</p>
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100vh',
    padding: 24,
    background: '#0b0b0f',
    color: '#fff',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
  },
  h1: { fontSize: 40, margin: 0 },
  p: { marginTop: 10, fontSize: 18, opacity: 0.95 },
  p2: { marginTop: 6, fontSize: 14, opacity: 0.7 },
};
