/** JSON Response helper for the API routes. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export type FailStep = "auth" | "origin" | "parse" | "validate" | "compute" | "persist";

/** Step-labelled error body so the caller sees exactly where it failed. */
export function fail(step: FailStep, message: string, status: number, issues?: unknown): Response {
  return json({ ok: false, step, message, ...(issues ? { issues } : {}) }, status);
}
