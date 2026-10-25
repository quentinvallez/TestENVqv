import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * OAuth and WhatsApp tokens are stored encrypted (AES-256-GCM) with a key from
 * CALENDAR_TOKEN_KEY. Changing the key makes existing tokens unreadable, which
 * disconnects every calendar and mailbox.
 */

function key() {
  const secret = process.env.CALENDAR_TOKEN_KEY;
  if (!secret || secret.length < 32) throw new Error("CALENDAR_TOKEN_KEY must be set to 32+ characters to store tokens");
  return createHash("sha256").update(secret).digest();
}

export function canEncrypt() {
  return (process.env.CALENDAR_TOKEN_KEY?.length ?? 0) >= 32;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decrypt(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unknown token format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
