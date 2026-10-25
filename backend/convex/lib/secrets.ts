import { decrypt, encrypt, importKey } from "./crypto";

// Only actions call these: queries never see plaintext secrets.
export async function encryptSecret(plaintext: string): Promise<string> {
  return await encrypt(await importKey(process.env.ENCRYPTION_KEY), plaintext);
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  return await decrypt(await importKey(process.env.ENCRYPTION_KEY), ciphertext);
}

/** SHA-256 hex, for app secrets: looked up by hash, never stored in the clear. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A new app secret: "kjs_" + 32 random bytes, base64url. */
export function newAppSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return `kjs_${btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
