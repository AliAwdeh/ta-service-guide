import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";

import { ServiceGuide } from "../../components/service-guide";
import { toVariantConfig } from "../../lib/guide-config";
import { fetchGuideData } from "../../lib/guides.functions";
import { startVisitBeacon } from "../../lib/visit-beacon";

/* /v/<code> — the client-facing service guide link. Lookup is by the stored
   token; unknown codes fall through to the 404. */
export const Route = createFileRoute("/v/$id")({
  loader: async ({ params }) => {
    const data = await fetchGuideData({ data: { token: params.id } });
    if (!data) throw notFound();
    return { data };
  },
  component: ViewGuide,
});

function ViewGuide() {
  const { data } = Route.useLoaderData();
  const { id } = Route.useParams();

  // Isomorphic beacon: no-op on the server, records the visit in the browser.
  useEffect(() => startVisitBeacon({ guideToken: id, path: `/v/${id}` }), [id]);

  return <ServiceGuide config={toVariantConfig(data)} />;
}
