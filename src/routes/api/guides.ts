import { createFileRoute } from "@tanstack/react-router";
import process from "node:process";

import { requireAllowedOrigin, requireBearer } from "../../lib/auth.server";
import {
  getGuideData,
  getGuideRow,
  insertGuide,
  newUniqueToken,
  updateGuide,
} from "../../lib/db.server";
import {
  GuideInputSchema,
  GuideUpdateSchema,
  guideDataFromInput,
  guidePatchFromInput,
  missingDiscriminators,
  parseGuideToken,
  reresolveServiceGuide,
} from "../../lib/guide-config";
import { contentFor } from "../../lib/guide-content";
import { fail, json } from "../../lib/http";

/* ═══════════════════════════════════════════════════════════════════════════
   /api/guides — create, read and correct a client's service guide.
   ─────────────────────────────────────────────────────────────────────────
   Bearer-authenticated (env API_TOKEN). Each POST mints a NEW token (history is
   kept). On failure the response names the exact step that failed:
     auth → origin → parse → validate → compute → persist
   ═══════════════════════════════════════════════════════════════════════════ */

/** The public host for generated links: PUBLIC_APP_HOST, else the request origin. */
function publicHost(request: Request): string {
  return (process.env.PUBLIC_APP_HOST || new URL(request.url).origin).replace(/\/+$/, "");
}

export const Route = createFileRoute("/api/guides")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. auth
        const auth = requireBearer(request);
        if (!auth.ok) return fail(auth.step, auth.message, 401);

        // 2. origin (browser callers only; server-to-server has no Origin)
        const origin = requireAllowedOrigin(request);
        if (!origin.ok) return fail(origin.step, origin.message, 403);

        // 3. parse
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return fail("parse", "request body is not valid JSON", 400);
        }

        // 4. validate
        const parsed = GuideInputSchema.safeParse(body);
        if (!parsed.success) {
          return fail("validate", "one or more fields are invalid", 422, parsed.error.issues);
        }

        // 5. compute — resolve which of the 14 guides this client gets
        let data;
        try {
          data = guideDataFromInput(parsed.data);
        } catch (e) {
          return fail("compute", e instanceof Error ? e.message : String(e), 500);
        }

        // 6. persist (mint a short, unique /v/ token)
        const explicitGuide = parsed.data.SERVICE_GUIDE ?? null;
        let token: string;
        try {
          token = await newUniqueToken();
          await insertGuide(token, parsed.data.CLIENT_ID, data, explicitGuide);
        } catch (e) {
          return fail("persist", e instanceof Error ? e.message : String(e), 500);
        }

        // done. Echo what the discriminators actually resolved to: an unknown
        // nationality falls back to "other" rather than erroring, so the caller
        // needs a way to confirm which guide their values produced.
        const query = data.ref ? `?ref=${encodeURIComponent(data.ref)}` : "";
        return json(
          {
            ok: true,
            token,
            url: `${publicHost(request)}/v/${token}${query}`,
            resolved: {
              serviceGuide: data.serviceGuide,
              serviceGuideLabel: contentFor(data.serviceGuide).label,
              nationality: data.nationality,
              pinned: explicitGuide != null,
            },
          },
          200,
        );
      },

      /* ─────────────────────────────────────────────────────────────────────
         GET /api/guides?token=… — fetch a stored guide (used by /debug).
         `token` accepts a bare token OR a full/partial link.
         ───────────────────────────────────────────────────────────────────── */
      GET: async ({ request }) => {
        const auth = requireBearer(request);
        if (!auth.ok) return fail(auth.step, auth.message, 401);
        const raw = new URL(request.url).searchParams.get("token");
        if (!raw) return fail("validate", "missing ?token", 422);
        const token = parseGuideToken(raw);
        if (!token) return fail("validate", `could not read a token from "${raw}"`, 422);
        const row = await getGuideRow(token);
        if (!row) return json({ ok: false, message: "not found" }, 404);
        // This route is bearer-gated internal tooling, so clientId is included
        // (it is what /debug hydrates the form with). The public /v/ render path
        // uses getGuideData(), which never exposes it.
        const { token: _t, clientId, createdAt, ...data } = row;
        return json(
          {
            ok: true,
            token,
            clientId,
            createdAt,
            data,
            label: contentFor(row.serviceGuide).label,
          },
          200,
        );
      },

      /* ─────────────────────────────────────────────────────────────────────
         PATCH /api/guides — correct an EXISTING guide in place.
         Body: { token: "<token or full link>", ...any fields to change }
         The token is never modified, so the link already shared with the client
         keeps working and simply shows the corrected guide.

         Note the extra step versus POST: a patch only carries the fields being
         changed, so GuideInputSchema's "required when …" refinements cannot run
         on it. We apply the patch, re-read the MERGED row, and only then check
         the invariants and re-resolve the guide — rolling back if the merged row
         can no longer resolve.
         ───────────────────────────────────────────────────────────────────── */
      PATCH: async ({ request }) => {
        const auth = requireBearer(request);
        if (!auth.ok) return fail(auth.step, auth.message, 401);
        const origin = requireAllowedOrigin(request);
        if (!origin.ok) return fail(origin.step, origin.message, 403);

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return fail("parse", "request body is not valid JSON", 400);
        }

        const token = parseGuideToken(String(body.token ?? body.url ?? ""));
        if (!token) {
          return fail("validate", "missing or unreadable `token` (token or full link)", 422);
        }

        // `token`/`url` identify the row; everything else is the patch.
        const { token: _t, url: _u, ...fields } = body;
        const parsed = GuideUpdateSchema.safeParse(fields);
        if (!parsed.success) {
          return fail("validate", "one or more fields are invalid", 422, parsed.error.issues);
        }

        let patch: Record<string, string | number | null>;
        try {
          patch = guidePatchFromInput(parsed.data);
        } catch (e) {
          return fail("compute", e instanceof Error ? e.message : String(e), 500);
        }
        if (Object.keys(patch).length === 0) {
          return fail("validate", "no updatable fields were sent", 422);
        }

        // Pinning: an explicit SERVICE_GUIDE must survive later discriminator
        // edits, so record it as the pinned choice alongside the rendered one.
        if (patch.service_guide !== undefined) patch.explicit_guide = patch.service_guide;

        // Keep the pre-patch row so we can roll back an invalid merge.
        const before = await getGuideRow(token);
        if (!before) return json({ ok: false, message: `no guide with token ${token}` }, 404);

        try {
          await updateGuide(token, patch);
        } catch (e) {
          return fail("persist", e instanceof Error ? e.message : String(e), 500);
        }

        const merged = await getGuideRow(token);
        if (!merged) return json({ ok: false, message: `no guide with token ${token}` }, 404);

        // Does the merged row still carry everything needed to pick a guide?
        const missing = missingDiscriminators(merged);
        if (missing.length > 0) {
          // Roll back so a rejected patch never leaves the link showing a guide
          // resolved off incomplete data.
          await updateGuide(token, {
            service_guide: before.serviceGuide,
            explicit_guide: before.explicitGuide,
            pkg: before.pkg,
            nationality: before.nationality,
            maid_location: before.maidLocation,
            passport_type: before.passportType,
            gender: before.gender,
            role: before.role,
            emirate: before.emirate,
          });
          return fail(
            "validate",
            `the patched guide would be missing: ${missing.join("; ")}. ` +
              "Send those fields in the same PATCH, or pin the guide with SERVICE_GUIDE. " +
              "No change was applied.",
            422,
          );
        }

        // Re-resolve: a caller who patched NATIONALITY expects the rendered
        // guide to follow. A pinned SERVICE_GUIDE always wins.
        const resolved = reresolveServiceGuide(merged, merged.explicitGuide);
        if (resolved !== merged.serviceGuide) {
          await updateGuide(token, { service_guide: resolved });
        }

        const data = await getGuideData(token);
        return json(
          {
            ok: true,
            token,
            url: `${publicHost(request)}/v/${token}`,
            updated: Object.keys(patch),
            resolved: {
              serviceGuide: resolved,
              serviceGuideLabel: contentFor(resolved).label,
              pinned: merged.explicitGuide != null,
            },
            data,
          },
          200,
        );
      },
    },
  },
});
