import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getGuideData } from "./db.server";

/* Server function used by the /v/$id route loader to fetch a guide's render
   data by its public token. Runs server-only (createServerFn RPC), so the
   bun:sqlite import in db.server.ts never reaches the client bundle.
   Returns the render data (never client_id) or null when the token is unknown. */
export const fetchGuideData = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => getGuideData(data.token));
