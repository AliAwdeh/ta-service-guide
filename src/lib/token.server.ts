const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"; // base62

/**
 * Short, URL-safe, random public code for a generated guide (default 6 base62
 * chars ≈ 56.8 billion combinations — effectively unguessable at our volume).
 * This is what appears in /v/<code>; the real CLIENT_ID never leaves the DB.
 * Uniqueness against existing guides is enforced by newUniqueToken() in
 * db.server.ts. Old 22-char tokens keep working — lookup is by the stored
 * string, independent of length.
 */
export function randomCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % 62];
  return out;
}
