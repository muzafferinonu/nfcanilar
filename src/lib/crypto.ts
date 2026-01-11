// src/lib/crypto.ts

export async function deriveKeyFromNFC(nfc1: string, nfc2: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = encoder.encode(`${nfc1}::${nfc2}`);

  const hash = await crypto.subtle.digest("SHA-256", material);

  return crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptPayload(key: CryptoKey, payload: any): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload));

  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bytesToBase64(combined);
}

export async function decryptPayload(key: CryptoKey, encryptedB64: string): Promise<any> {
  const combined = base64ToBytes(encryptedB64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}
