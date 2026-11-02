import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE = "repopilot_github_session";
export const OAUTH_STATE_COOKIE = "repopilot_oauth_state";

function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be configured with at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

export function sealSession(value: { accessToken: string; login: string; name?: string | null; avatarUrl?: string | null }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function openSession(value?: string) {
  if (!value) return null;
  try {
    const [iv, tag, encrypted] = value.split(".");
    if (!iv || !tag || !encrypted) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8"));
    if (typeof data.accessToken !== "string" || typeof data.login !== "string") return null;
    return data as { accessToken: string; login: string; name?: string | null; avatarUrl?: string | null };
  } catch {
    return null;
  }
}
