import { createFileRoute } from "@tanstack/react-router";

import { recordVisit } from "../../lib/db.server";
import { json } from "../../lib/http";
import { clientIp, country, dubaiTime, parseUserAgent } from "../../lib/visit-meta.server";

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/visits — analytics beacon (open, same-origin).
   ─────────────────────────────────────────────────────────────────────────
   Called by the client beacon on /Views pages (initial hit, heartbeats, and a
   final sendBeacon on unload). No bearer: guide viewers are clients who don't
   hold the token. IP / User-Agent / device / Dubai time are derived server-side
   here — never trusted from the body. Upserts one row per session_id.
   ═══════════════════════════════════════════════════════════════════════════ */

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function str(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v);
  return s ? s.slice(0, max) : null;
}

export const Route = createFileRoute("/api/visits")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // sendBeacon may arrive as text; accept either.
        let body: Record<string, unknown>;
        try {
          const raw = await request.text();
          body = raw ? JSON.parse(raw) : {};
        } catch {
          return json({ ok: false, error: "invalid JSON" }, 400);
        }

        const sessionId = str(body.sessionId, 128);
        if (!sessionId) return json({ ok: false, error: "missing sessionId" }, 400);

        const now = new Date();
        const ua = request.headers.get("user-agent");
        const device = parseUserAgent(ua);

        try {
          await recordVisit({
            sessionId,
            guideToken: str(body.guideToken, 64),
            path: str(body.path, 256),
            ip: clientIp(request),
            userAgent: ua ? ua.slice(0, 512) : null,
            device: device.device,
            os: device.os,
            browser: device.browser,
            referrer: str(body.referrer, 512),
            language: str(body.language, 64),
            screen: str(body.screen, 32),
            timezone: str(body.timezone, 64),
            startedAtUtc: now.toISOString(),
            startedAtDubai: dubaiTime(now),
            lastSeenUtc: now.toISOString(),
            dwellMs: clampInt(body.dwellMs, 0, 1000 * 60 * 60 * 24),
            maxScrollPct: clampInt(body.maxScrollPct, 0, 100),
            sectionsViewed: Array.isArray(body.sectionsViewed)
              ? body.sectionsViewed.map((s) => String(s).slice(0, 40)).slice(0, 20)
              : [],
            country: country(request),
            visitorId: str(body.visitorId, 64),
          });
        } catch (e) {
          return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
        }

        return json({ ok: true }, 200);
      },
    },
  },
});
