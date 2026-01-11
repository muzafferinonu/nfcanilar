export default function Home() {
  return (
    <main style={styles.main}>
      <h1 style={styles.h1}>🔐 NFC Ani Kilitleme</h1>
      <p style={styles.p}>Bu sayfa kilitli. Açmak için iki NFC’yi okut.</p>
      <p style={styles.p2}>NFC okutunca otomatik ilerler.</p>
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
  h1: { fontSize: 36, margin: 0 },
  p: { marginTop: 10, fontSize: 16, opacity: 0.9 },
  p2: { marginTop: 6, fontSize: 13, opacity: 0.7 },
};
