import { describe, expect, it } from "vitest";
import { decrypt, encrypt, importKey } from "../convex/lib/crypto";

const keyB64 = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

describe("crypto", () => {
  it("round-trips a secret", async () => {
    const key = await importKey(keyB64);
    const ct = await encrypt(key, "AIza-secret");
    expect(ct).not.toContain("AIza");
    expect(await decrypt(key, ct)).toBe("AIza-secret");
  });

  it("uses a fresh IV each time", async () => {
    const key = await importKey(keyB64);
    expect(await encrypt(key, "x")).not.toBe(await encrypt(key, "x"));
  });

  it("rejects a different key", async () => {
    const other = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
    const ct = await encrypt(await importKey(keyB64), "x");
    await expect(decrypt(await importKey(other), ct)).rejects.toThrow();
  });

  it("rejects missing or short keys", async () => {
    await expect(importKey(undefined)).rejects.toThrow(/not set/);
    await expect(importKey(btoa("short"))).rejects.toThrow(/32 bytes/);
  });
});
