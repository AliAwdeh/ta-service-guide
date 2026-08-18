# TA Service Guide — API reference

Base URL: `https://maidscc.app` (prod) · `http://localhost:5173` (dev) · `http://localhost:3000` (built Bun server).

All responses are JSON with `Cache-Control: no-store`.

## Authentication

A single shared bearer token gates the write/admin endpoints. Send it as:

```
Authorization: Bearer <API_TOKEN>
```

`API_TOKEN` is read from the server's `.env`. Server-to-server calls (no `Origin` header — e.g.
curl, your backend) are always allowed once the token is valid. Browser calls are additionally
restricted to the origins in `ALLOWED_ORIGINS`.

| Endpoint            | Auth               |
| ------------------- | ------------------ |
| `POST /api/guides`  | Bearer             |
| `GET /api/guides`   | Bearer             |
| `PATCH /api/guides` | Bearer             |
| `GET /api/admin`    | Bearer             |
| `POST /api/visits`  | none (open beacon) |

---

## POST /api/guides

Resolve which service guide a client should see, store it, and get back a shareable link. Each
call creates a **new** guide + token (history is preserved). The real `CLIENT_ID` is stored but
never appears in the URL or in any client-facing response.

### Request body

| Field           | Type             | Required    | Values / rules                                                                                                                                                                                                                                                                       |
| --------------- | ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CLIENT_ID`     | string \| number | yes         | Your internal client identifier. Stored, never exposed.                                                                                                                                                                                                                              |
| `SERVICE_GUIDE` | string           | no          | Pin a guide directly and skip resolution. One of the 14 slugs (see below). Pinned choices survive later discriminator edits.                                                                                                                                                         |
| `PACKAGE`       | string           | no          | `full` (default) \| `visa-only`. `visa-only` wins over nationality. Accepts `"visa only"`, `"VISA_ONLY"`, `"vo"`.                                                                                                                                                                    |
| `NATIONALITY`   | string           | no          | Your own picklist value. Recognised: filipino, ethiopian, sri-lankan, ugandan, nepali, indian, kenyan, cameroonian. Country names and common variants are accepted (`"Philippines"`, `"Sri Lanka"`, `"Nepalese"`). Anything unrecognised → `other`, never an error. Default `other`. |
| `MAID_LOCATION` | string           | conditional | `in-country` \| `outside-country`. **Required when `NATIONALITY` is ethiopian or nepali.** Accepts `"in_ethiopia"`, `"outside nepal"`, `"abroad"`, `"uae"`, `"home"`.                                                                                                                |
| `PASSPORT_TYPE` | string           | conditional | `ECR` \| `ECNR`. **Required when `NATIONALITY` is indian.**                                                                                                                                                                                                                          |
| `GENDER`        | string           | conditional | `female` \| `male`. **Required when `NATIONALITY` is indian and `PASSPORT_TYPE` is `ECR`.** Elsewhere optional — sets pronouns, falls back to she/her. Accepts `"m"`, `"f"`, `"man"`.                                                                                                |
| `ROLE`          | string           | no          | Designation noun shown throughout (`maid`, `driver`, `chef`…). Default `maid`.                                                                                                                                                                                                       |
| `EMIRATE`       | string           | no          | Emirate that issued the sponsor's Emirates ID. Only the Filipina guide uses it (private entry permit fee + the Dubai-only deposit refund). Omit and both fee options are shown. Accepts `"Abu Dhabi"`, `"ABU_DHABI"`, `"dxb"`.                                                       |
| `contract_id`   | string \| number | no          | A client can have several contracts. Stored + shown in admin; not on the guide.                                                                                                                                                                                                      |
| `ref`           | string           | no          | Source tag (e.g. `whatsapp`). Baked into the returned link as `?ref=…` so opens are auto-tagged.                                                                                                                                                                                     |

Enum values are case-insensitive and tolerate spaces or underscores; numbers may be sent as strings.

### The 14 `SERVICE_GUIDE` slugs

`filipina-philippines` · `ethiopian-in-ethiopia` · `ethiopian-outside-ethiopia` ·
`sri-lankan-in-sri-lanka` · `ugandan` · `nepali-in-nepal` · `nepali-outside-nepal` ·
`indian-ecnr` · `indian-male-ecr` · `indian-female-ecr` · `kenyan` · `cameroonian` ·
`visa-only` · `other`

### Success — `200`

```json
{
  "ok": true,
  "token": "SDve4q",
  "url": "https://maidscc.app/v/SDve4q?ref=whatsapp",
  "resolved": {
    "serviceGuide": "filipina-philippines",
    "serviceGuideLabel": "Filipina in the Philippines",
    "nationality": "filipino",
    "pinned": false
  }
}
```

`url` uses `PUBLIC_APP_HOST`, falling back to the request origin, and carries `?ref=<value>`
when `ref` was sent. Always check `resolved.serviceGuide` — an unrecognised nationality falls
back to `other` rather than erroring, so this is how you confirm what your values produced.
`pinned` is `true` when `SERVICE_GUIDE` was sent explicitly.

### Errors — step-labelled

Every failure names the step that failed so you can pinpoint it:

| Step       | Status | When                                                        |
| ---------- | ------ | ----------------------------------------------------------- |
| `auth`     | 401    | Missing/invalid bearer token, or server has no `API_TOKEN`. |
| `origin`   | 403    | Browser request from an origin not in `ALLOWED_ORIGINS`.    |
| `parse`    | 400    | Body is not valid JSON.                                     |
| `validate` | 422    | A field is missing/invalid (includes a Zod `issues` array). |
| `compute`  | 500    | Internal error resolving the guide.                         |
| `persist`  | 500    | Database write failed.                                      |

```json
{
  "ok": false,
  "step": "validate",
  "message": "one or more fields are invalid",
  "issues": [
    {
      "code": "custom",
      "path": ["GENDER"],
      "message": "GENDER is required for Indian ECR maids — the male route needs an OK to Board clearance and the female route is a tourist visa with a proof-of-funds requirement"
    }
  ]
}
```

### Examples

Let the API resolve the guide from ERP fields — this is what production should do:

```bash
curl -X POST https://maidscc.app/api/guides \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "CLIENT_ID": 1002,
    "NATIONALITY": "Ethiopia",
    "MAID_LOCATION": "in-country",
    "ROLE": "maid",
    "GENDER": "female",
    "ref": "whatsapp"
  }'
```

Pin a guide directly when you already know which one applies:

```bash
curl -X POST https://maidscc.app/api/guides \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"CLIENT_ID": 1003, "SERVICE_GUIDE": "visa-only"}'
```

Filipina file, where the emirate sets the entry permit fee:

```bash
curl -X POST https://maidscc.app/api/guides \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "CLIENT_ID": 1004,
    "NATIONALITY": "Philippines",
    "MAID_LOCATION": "in-country",
    "EMIRATE": "dubai"
  }'
```

---

## GET /api/guides

Fetch a stored guide by token (used by the `/debug` preview). Bearer-gated internal tooling, so
this one **does** return `client_id`; the public `/v/` render path never does.

Query params: `token` (required) — a bare token **or** a full/partial link
(`https://maidscc.app/v/SDve4q?ref=x`, `/v/SDve4q`, `SDve4q` all work).

```json
{
  "ok": true,
  "token": "SDve4q",
  "clientId": "1002",
  "createdAt": "2026-08-18T09:14:22.031Z",
  "label": "Ethiopian in Ethiopia",
  "data": {
    "serviceGuide": "ethiopian-in-ethiopia",
    "explicitGuide": null,
    "pkg": "full",
    "nationality": "ethiopian",
    "maidLocation": "in-country",
    "passportType": null,
    "gender": "female",
    "role": "maid",
    "emirate": null,
    "contractId": null,
    "ref": "whatsapp"
  }
}
```

`404` when the token is unknown.

---

## PATCH /api/guides

Correct an **existing** guide in place. The token is never modified, so a link already sent on
WhatsApp keeps working and simply shows the corrected guide.

Body: `{ "token": "<token or full link>", ...any fields to change }`. Every field from `POST`
is accepted; only what you send is changed.

Because a patch carries only the changed fields, the "required when …" rules cannot be checked
against the body alone. The API therefore:

1. applies the patch,
2. re-reads the **merged** row,
3. re-resolves which guide it renders (so patching `NATIONALITY` moves the guide with it),
4. and if the merged row is missing a required discriminator, **rolls the patch back** and
   returns `422`.

So this fails and changes nothing, because the stored row has no passport type:

```bash
curl -X PATCH https://maidscc.app/api/guides \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"token": "SDve4q", "NATIONALITY": "indian"}'
```

```json
{
  "ok": false,
  "step": "validate",
  "message": "the patched guide would be missing: PASSPORT_TYPE (required for Indian — \"ECR\" or \"ECNR\"). Send those fields in the same PATCH, or pin the guide with SERVICE_GUIDE. No change was applied."
}
```

While this succeeds:

```bash
curl -X PATCH https://maidscc.app/api/guides \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"token": "SDve4q", "NATIONALITY": "indian", "PASSPORT_TYPE": "ECNR"}'
```

```json
{
  "ok": true,
  "token": "SDve4q",
  "url": "https://maidscc.app/v/SDve4q",
  "updated": ["nationality", "passport_type"],
  "resolved": {
    "serviceGuide": "indian-ecnr",
    "serviceGuideLabel": "Indian — ECNR",
    "pinned": false
  },
  "data": { "...": "the merged render data" }
}
```

`404` when the token is unknown.

---

## GET /api/admin

Bearer-gated feed for the `/admin/admin` dashboard: every generated guide (with visit counts)
and the visit log. No query params.

## POST /api/visits

Open, same-origin analytics beacon called by the `/v/` pages (initial hit, 10s heartbeats, and
a final `sendBeacon` on unload). No bearer — guide viewers are clients who don't hold the
token. IP, User-Agent, device and Dubai time are derived server-side and never trusted from the
body. Upserts one row per `sessionId`.
