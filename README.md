# TA Service Guide

Per-client service guide for maids.cc. A backend POSTs a client's profile fields to an
authenticated API; the app resolves **which of 14 service guides** that client should see,
stores it, and returns an unguessable `https://maidscc.app/v/<code>` link (the real
`CLIENT_ID` never appears in the URL). The guide renders the correct end-to-end process for
that maid's nationality, location and paperwork route.

Same architecture as [maid-visa-guide](https://github.com/AliAwdeh/maid-visa-guide) — config
module → bearer API → tokenized link → variant-driven component → debug generator → analytics.
The difference is what drives the variant: there, contract terms; here, **which document tab
applies**.

- `/` — public maids.cc landing
- `/v/<code>` — the client-facing guide
- `/debug` — token-gated generator, live preview of all 14 guides, and the source-document defect list
- `/admin/admin` — token-gated visitor analytics
- API reference: [docs/API.md](docs/API.md) · Postman: [docs/ta-service-guide.postman_collection.json](docs/ta-service-guide.postman_collection.json)

## Run

```bash
bun install
cp .env.example .env      # set a strong API_TOKEN
bun run dev               # local dev at http://localhost:5173
# production:
bun run build && bun run start   # Bun server on $PORT (default 3000)
```

`.env` (auto-loaded by Bun): `API_TOKEN`, `PUBLIC_APP_HOST`, `ALLOWED_ORIGINS`,
`DB_PATH` (`./data/app.db`), `PORT`. Point cloudflared at the port.

## The 14 guides

Each is one tab of the source
[Service Guide document](https://docs.google.com/document/d/16bsdh4rvjiVYXDkl2RBWslFiTr7Ic2381EdCS5kbwRs/edit).

| Slug                         | Document tab               |
| ---------------------------- | -------------------------- |
| `filipina-philippines`       | Filipina in Philipines     |
| `ethiopian-in-ethiopia`      | Ethiopian in Ethiopia      |
| `ethiopian-outside-ethiopia` | Ethiopian Outside Ethiopia |
| `sri-lankan-in-sri-lanka`    | SriLanka in Sri Lanka      |
| `ugandan`                    | Ugandan                    |
| `nepali-in-nepal`            | Nepal in Nepal             |
| `nepali-outside-nepal`       | Nepal Outside Nepal        |
| `indian-ecnr`                | Indian - ECNR              |
| `indian-male-ecr`            | Indian - Male ECR          |
| `indian-female-ecr`          | Indian - Female ECR        |
| `kenyan`                     | Kenyan                     |
| `cameroonian`                | Cameroonians               |
| `visa-only`                  | Visa Only Package          |
| `other`                      | Other                      |

## How the guide is chosen

`resolveServiceGuide()` in [src/lib/guide-config.ts](src/lib/guide-config.ts), highest
precedence first:

1. **`PACKAGE` = `visa-only`** → the Visa Only guide, whatever the nationality. We stop at
   handing over the visa, so the process is the same for everyone.
2. **`NATIONALITY`** → picks the country guide. Unknown values map to `other` rather than
   erroring, so a new entry in the ERP's picklist never breaks a request.
3. **`MAID_LOCATION`** → splits Ethiopian and Nepali into in-country / outside-country.
4. **`PASSPORT_TYPE` + `GENDER`** → splits Indian into ECNR / Male ECR / Female ECR.
5. Anything unresolved → `other`.

A caller that already knows the answer can send **`SERVICE_GUIDE`** directly and skip all of
it. That choice is _pinned_: it survives later edits to the discriminators.

Two fields change wording rather than picking a guide:

- **`GENDER`** → pronouns throughout (she/her vs he/his).
- **`EMIRATE`** → only the Filipina guide, where the private entry permit fee depends on which
  emirate issued the sponsor's Emirates ID (Dubai AED 2,614 including a refundable AED 2,000
  deposit; all others AED 450). Omit it and both options are shown rather than a guessed one.

### Why some fields are required rather than defaulted

The API returns `422` instead of guessing when a discriminator is load-bearing:

| Required        | When              | Why guessing is worse than failing                                                                                                                                                                    |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAID_LOCATION` | Ethiopian, Nepali | An Ethiopian in Ethiopia runs a 39-day GCC and 30-day pre-departure that a maid already abroad skips — the timelines differ by weeks.                                                                 |
| `PASSPORT_TYPE` | Indian            | ECR needs an extra government clearance; ECNR does not. Wrong guide = wrong arrival estimate and a missing step.                                                                                      |
| `GENDER`        | Indian + ECR      | The male route needs an OK to Board; the female route is a tourist visa where **the client must have AED 2,000 in cash ready** for immigration. Sending the wrong one means the client is never told. |

This mirrors maid-visa-guide's `EID_APPLICATION_TYPE is required when EMIRATE is abu_dhabi`.

### Combinations the document does not cover

- **Filipina outside the Philippines** → falls back to `other`. The Filipina guide is written
  end-to-end around the in-country process (Manila accommodation, TESDA, OWWA, OEC), none of
  which applies to a maid already abroad. Worth confirming with the TA team.
- **Sri Lankan / Ugandan / Kenyan / Cameroonian outside their home country** → the document
  gives these one version each, so `MAID_LOCATION` is ignored for them.

## Content lives in data, not components

[src/lib/guide-content.ts](src/lib/guide-content.ts) holds all 14 guides as structured data —
stages, durations, document callouts, process breakdowns, timeline boxes.
[src/components/service-guide.tsx](src/components/service-guide.tsx) renders any of them. A
wording change is a one-line edit in the content file and never touches a component.

Copy uses `{placeholders}` (`{role}`, `{subj}`, `{poss}`, …) filled from one vocabulary, so a
single string serves a female maid and a male driver. This also fixes a slip in the source
document, where the Indian Male ECR tab is written in he/his but still says "within 3 days of
**her** being ready to travel".

## Known defects in the source document

Transcribed faithfully rather than silently corrected — inventing process facts in a
client-facing document is worse than reproducing a flaw we have flagged. Each is listed in
`DOC_ISSUES` in [src/lib/guide-content.ts](src/lib/guide-content.ts) and shown on `/debug` for
whichever guide is on screen. **These never appear on a client page.**

| Guide                 | Defect                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nepal Outside Nepal   | Flight stage opens _"Once the POE is approved"_ but this guide has no POE stage — copy-paste from the in-Nepal tab. Every other outside-country tab reads _"Once the entry visa is issued"_. **Needs a decision before this goes to clients.** |
| Nepal Outside Nepal   | Section numbering skips `03` (runs 01, 02, then Guarantee as 04).                                                                                                                                                                              |
| SriLanka in Sri Lanka | Two stages both numbered `03`.                                                                                                                                                                                                                 |
| Kenyan                | Two stages both numbered `02`; heading says _(7 Days)_ while the body says _up to 10 business days_.                                                                                                                                           |
| Cameroonians          | Two stages both numbered `02`; same 7-vs-10-day contradiction; and the GCC is said to be attested _"in Nigeria"_, presumably meant to be Cameroon.                                                                                             |
| Filipina              | Tab title misspells Philippines as "Philipines".                                                                                                                                                                                               |

Stage numbers are **renumbered sequentially for display** — a client-facing document must not
show "02" twice. The document's own label is kept as `sourceLabel` and any mismatch is
reported on `/debug`.

## Layout

```
src/lib/guide-config.ts     variant resolution, Zod schemas, stored shape, terms  (client-safe)
src/lib/guide-content.ts    the 14 guides as data
src/lib/db.server.ts        SQLite (bun:sqlite in prod, node:sqlite in dev) — guides + visits
src/lib/auth.server.ts      bearer + allowed-origin checks
src/components/service-guide.tsx   the renderer
src/routes/api/guides.ts    POST create · GET read · PATCH correct in place
src/routes/v/$id.tsx        the client-facing page
src/routes/debug.tsx        generator + live preview + document defect list
src/routes/admin/admin.tsx  visitor analytics
```

Correcting a live link uses `PATCH` and never changes the token, so a link already sent on
WhatsApp keeps working and simply shows the corrected guide. Because a patch only carries the
fields being changed, the API applies it, re-reads the merged row, re-resolves the guide, and
**rolls the patch back with a 422** if the merged row would be missing a required
discriminator — a rejected patch never leaves a link showing a guide resolved off incomplete
data.
