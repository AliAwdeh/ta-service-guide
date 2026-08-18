import { createFileRoute } from "@tanstack/react-router";

/* Only the landing page is crawlable. The client guides at /v/<token> carry a
   client's own process details behind an unguessable code — not secret, but they
   have no business in a search index — and /debug + /admin are internal tools. */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const body = [
          "User-agent: *",
          "Allow: /$",
          "Disallow: /v/",
          "Disallow: /debug",
          "Disallow: /admin/",
          "Disallow: /api/",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
        ].join("\n");
        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
