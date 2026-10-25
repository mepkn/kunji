/**
 * AES-256-GCM via Web Crypto, for secrets at rest (AI keys, app secrets).
 * Ciphertext format: "v1.<base64 iv>.<base64 ciphertext+tag>", a fresh 12-byte
 * IV per value. The key is 32 bytes, base64 (env var ENCRYPTION_KEY).
 */
const VERSION = "v1";

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function importKey(base64Key: string | undefined): Promise<CryptoKey> {
  if (!base64Key) throw new Error("ENCRYPTION_KEY is not set on this deployment.");
  const raw = fromBase64(base64Key);
  if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return `${VERSION}.${toBase64(iv)}.${toBase64(ct)}`;
}

export async function decrypt(key: CryptoKey, ciphertext: string): Promise<string> {
  const [version, iv, ct] = ciphertext.split(".");
  if (version !== VERSION || !iv || !ct) throw new Error("Unrecognized ciphertext format.");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(ct));
  return new TextDecoder().decode(pt);
}
