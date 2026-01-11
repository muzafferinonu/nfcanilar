// AES-GCM + PBKDF2 (WebCrypto). Foto + metin tek payload olarak şifrelenir.

function b64FromBytes(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function deriveKey(secret1: string, secret2: string, salt: Uint8Array) {
  // sırayı sabitle: secret1 + "|" + secret2 (t1 ve t2 diye ayırıyoruz)
  const pass = new TextEncoder().encode(`${secret1}|${secret2}`);
  const baseKey = await crypto.subtle.importKey("raw", pass, "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 250_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export type EncryptedPackage = {
  cipher: Uint8Array;
  salt_base64: string;
  iv_base64: string;
  version: number;
  algo: "AES-GCM";
};

export async function encryptPayload(secret1: string, secret2: string, payloadJson: string): Promise<EncryptedPackage> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret1, secret2, salt);

  const plain = new TextEncoder().encode(payloadJson);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const cipher = new Uint8Array(cipherBuf);

  return {
    cipher,
    salt_base64: b64FromBytes(salt),
    iv_base64: b64FromBytes(iv),
    version: 1,
    algo: "AES-GCM",
  };
}

export async function decryptPayload(secret1: string, secret2: string, pkg: { cipher: Uint8Array; salt_base64: string; iv_base64: string }): Promise<string> {
  const salt = bytesFromB64(pkg.salt_base64);
  const iv = bytesFromB64(pkg.iv_base64);
  const key = await deriveKey(secret1, secret2, salt);

  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, pkg.cipher);
  return new TextDecoder().decode(plainBuf);
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  return b64FromBytes(bytes);
}

export function base64ToBlob(b64: string, mime: string): Blob {
  const bytes = bytesFromB64(b64);
  return new Blob([bytes], { type: mime });
}
