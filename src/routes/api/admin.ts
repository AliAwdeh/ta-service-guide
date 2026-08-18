import { createFileRoute } from "@tanstack/react-router";

import { requireBearer } from "../../lib/auth.server";
import { listGuides, listVisits } from "../../lib/db.server";
import { fail, json } from "../../lib/http";

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/admin — bearer-gated feed for the /admin/admin dashboard.
   Returns every generated guide (with visit counts) and the visit log.
   ═══════════════════════════════════════════════════════════════════════════ */

export const Route = createFileRoute("/api/admin")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = requireBearer(request);
        if (!auth.ok) return fail(auth.step, auth.message, 401);
        return json({ ok: true, guides: await listGuides(), visits: await listVisits() }, 200);
      },
    },
  },
});
