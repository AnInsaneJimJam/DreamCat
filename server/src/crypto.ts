import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 12;

function deriveKey(secret: string): Buffer {
  const buf = Buffer.alloc(KEY_LEN);
  Buffer.from(secret, "utf8").copy(buf);
  return buf;
}

export function encryptKey(plainHex: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainHex, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${encrypted.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptKey(encrypted: string, secret: string): string {
  const [ivB64, cipherB64, tagB64] = encrypted.split(".");
  const key = deriveKey(secret);
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return decipher.update(Buffer.from(cipherB64, "base64"), undefined, "utf8") + decipher.final("utf8");
}
