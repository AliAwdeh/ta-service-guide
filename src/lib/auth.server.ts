import process from "node:process";

/* Server-only auth for the API + the token-gated /debug and /admin pages.
   A single shared bearer token (env API_TOKEN) is the gate. Read env inside the
   function (not module scope) per the app convention in config.server.ts. */

export type AuthFailure = { ok: false; step: "auth" | "origin"; message: string };
export type AuthOk = { ok: true };

const DEFAULT_ALLOWED = "https://maidscc.app,http://localhost:5173";

function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function bearerFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Verify the Authorization: Bearer <token> header against API_TOKEN. */
export function requireBearer(request: Request): AuthOk | AuthFailure {
  const expected = process.env.API_TOKEN;
  if (!expected) {
    return { ok: false, step: "auth", message: "server is missing API_TOKEN" };
  }
  const provided = bearerFromRequest(request);
  if (!provided) {
    return { ok: false, step: "auth", message: "missing Authorization: Bearer token" };
  }
  if (!constantTimeEqual(provided, expected)) {
    return { ok: false, step: "auth", message: "invalid token" };
  }
  return { ok: true };
}

/**
 * Allowed-origin check for browser callers. Server-to-server calls (curl, the
 * maids.cc backend) send no Origin header and are allowed — the bearer token is
 * the real gate. Only cross-origin browser requests are restricted to the
 * ALLOWED_ORIGINS allowlist (maidscc.app + localhost by default).
 */
export function requireAllowedOrigin(request: Request): AuthOk | AuthFailure {
  const origin = request.headers.get("origin");
  if (!origin) return { ok: true };
  const allowed = (process.env.ALLOWED_ORIGINS || DEFAULT_ALLOWED)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return { ok: false, step: "origin", message: `bad Origin header: ${origin}` };
  }
  /* Same-origin is always allowed: the internal /debug and /admin pages call
     this API from the very host that served them, so hard-coding that host in
     ALLOWED_ORIGINS must not be a prerequisite for the tooling to work (it
     would silently break on any new host, port, or preview domain). This is
     not a loophole — a cross-site page cannot forge its Origin header. */
  try {
    if (new URL(request.url).host === originHost) return { ok: true };
  } catch {
    /* unparseable request URL — fall through to the allowlist */
  }
  const ok = allowed.some((a) => {
    try {
      return new URL(a).host === originHost;
    } catch {
      return a === origin;
    }
  });
  return ok
    ? { ok: true }
    : { ok: false, step: "origin", message: `origin not allowed: ${origin}` };
}
