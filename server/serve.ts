import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, normalize } from "node:path";
import process from "node:process";

/* ═══════════════════════════════════════════════════════════════════════════
   Production server (self-host, Bun). Serves the Vite build:
     • dist/client/*  — static assets, served directly (asset-first)
     • everything else — the TanStack Start SSR handler (dist/server/server.js)
   Run with:  bun run build && bun run start
   ═══════════════════════════════════════════════════════════════════════════ */

const CLIENT_DIR = fileURLToPath(new URL("../dist/client", import.meta.url));
const SERVER_ENTRY = new URL("../dist/server/server.js", import.meta.url).href;
const PORT = Number(process.env.PORT || 3000);

const mod = (await import(SERVER_ENTRY)) as {
  default?: { fetch: FetchHandler };
  fetch?: FetchHandler;
};
type FetchHandler = (req: Request, env: unknown, ctx: unknown) => Response | Promise<Response>;
const ssr: FetchHandler = (mod.default?.fetch ?? mod.fetch)!;

/** Resolve a request path to a real file inside dist/client, or null. */
function staticFileFor(pathname: string): string | null {
  if (pathname === "/" || pathname.endsWith("/")) return null;
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\]|\.\.[/\\])+/, "");
  const abs = join(CLIENT_DIR, rel);
  if (abs !== CLIENT_DIR && !abs.startsWith(CLIENT_DIR + "/")) return null; // traversal guard
  try {
    return statSync(abs).isFile() ? abs : null;
  } catch {
    return null;
  }
}

Bun.serve({
  port: PORT,
  idleTimeout: 60,
  async fetch(req) {
    const url = new URL(req.url);
    const filePath = staticFileFor(url.pathname);
    if (filePath) {
      const immutable =
        url.pathname.startsWith("/assets/") || /\.[0-9a-f]{8,}\./.test(url.pathname);
      return new Response(Bun.file(filePath), {
        headers: {
          "cache-control": immutable
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        },
      });
    }
    return ssr(req, {}, {});
  },
});

console.log(`▶ TA Service Guide running on http://localhost:${PORT}`);
