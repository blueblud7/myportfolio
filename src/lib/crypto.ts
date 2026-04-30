import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const KEY_HEX = process.env.ENCRYPTION_KEY;
let KEY: Buffer | null = null;

function getKey(): Buffer {
  if (KEY) return KEY;
  if (!KEY_HEX) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(KEY_HEX)) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  KEY = Buffer.from(KEY_HEX, "hex");
  return KEY;
}

/**
 * Encrypts a string with AES-256-GCM.
 * Returns base64(iv || ciphertext || tag).
 * IV is 12 bytes (GCM standard), tag is 16 bytes.
 */
export function encrypt(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString("base64");
}

/**
 * Decrypts a base64-encoded ciphertext from encrypt().
 * Returns the original plaintext, or null if input is null.
 * Throws if ciphertext is malformed or tampered with (GCM auth fail).
 */
export function decrypt(encoded: string | null | undefined): string | null {
  if (encoded === null || encoded === undefined) return null;
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < 12 + 16) throw new Error("ciphertext too short");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/**
 * Encrypts a number by converting to string first.
 * Returns null if input is null/undefined.
 */
export function encryptNum(value: number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return encrypt(String(value));
}

/**
 * Decrypts a base64 ciphertext to a number.
 * Returns null if input is null. Returns NaN if decryption succeeds but value is not numeric.
 */
export function decryptNum(encoded: string | null | undefined): number | null {
  const s = decrypt(encoded);
  if (s === null) return null;
  const n = Number(s);
  return n;
}

/**
 * Safe decrypt — returns null instead of throwing on auth failure.
 * Useful when reading legacy/corrupted rows during migration.
 */
export function tryDecrypt(encoded: string | null | undefined): string | null {
  try {
    return decrypt(encoded);
  } catch {
    return null;
  }
}
