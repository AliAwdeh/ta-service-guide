import { z } from "zod";

/* ═══════════════════════════════════════════════════════════════════════════
   GUIDE CONFIG — single source of truth (client-safe, pure)
   ─────────────────────────────────────────────────────────────────────────
   Shared by the API (validate + persist), the /debug generator, and the
   <ServiceGuide> React component. No server-only imports here so it bundles
   into the client too.

   Three shapes flow through the app:
     • GuideInput  — the raw API request body (UPPER_SNAKE keys, as sent by the
                     maids.cc system). Validated by GuideInputSchema.
     • GuideData   — the normalized, stored shape (one row in `guides`).
     • VariantConfig — the component's render config: which of the 14 service
                     guides to render, plus the terms (role + pronouns) and the
                     emirate that the copy interpolates.

   The guide is VARIANT-DRIVEN: it renders whatever config it is handed. All the
   "which guide does this client get" logic lives in resolveServiceGuide() below.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   THE 14 SERVICE GUIDES — one per tab in the source document
   ("Service Guide" — docs.google.com/document/d/16bsdh4rvjiVYXDkl2RBWslFiTr7Ic2381EdCS5kbwRs)
   The slug is this app's stable internal name for a tab; the tab's own title is
   carried in guide-content.ts as `label`.
   ═══════════════════════════════════════════════════════════════════════════ */

export const SERVICE_GUIDES = [
  "filipina-philippines", // "Service Guide - Filipina in Philipines"
  "ethiopian-in-ethiopia", // "Service Guide - Ethiopian in Ethiopia"
  "ethiopian-outside-ethiopia", // "Service Guide - Ethiopian Outside Ethiopia"
  "sri-lankan-in-sri-lanka", // "Service Guide - SriLanka in Sri Lanka"
  "ugandan", // "Service Guide - Ugandan"
  "nepali-in-nepal", // "Service Guide - Nepal in Nepal"
  "nepali-outside-nepal", // "Service Guide - Nepal Outside Nepal"
  "indian-ecnr", // "Service Guide - Indian - ECNR"
  "indian-male-ecr", // "Service Guide - Indian - Male ECR"
  "indian-female-ecr", // "Service Guide - Indian - Female ECR"
  "kenyan", // "Service Guide - Kenyan"
  "cameroonian", // "Service Guide - Cameroonians"
  "visa-only", // "Service Guide - Visa Only Package"
  "other", // "Service Guide - Other"
] as const;

export type ServiceGuide = (typeof SERVICE_GUIDES)[number];

/* ------------------------------- API enums -------------------------------- */

/** Service package. `visa-only` short-circuits nationality entirely — we issue
    the visa and hand it over; the client books their own flight. */
export const PACKAGES = ["full", "visa-only"] as const;
export type ApiPackage = (typeof PACKAGES)[number];

/** Where the maid currently is. Splits the Ethiopian and Nepali guides (the
    in-country versions carry the local GCC / POE / pre-departure stages that a
    maid already abroad does not go through). */
export const LOCATIONS = ["in-country", "outside-country"] as const;
export type MaidLocation = (typeof LOCATIONS)[number];

/** Indian passport emigration-check status. ECR passports need an extra
    government clearance before travel; ECNR do not. */
export const PASSPORT_TYPES = ["ECR", "ECNR"] as const;
export type PassportType = (typeof PASSPORT_TYPES)[number];

/** Gender drives the pronouns used throughout the guide, AND picks between the
    two Indian ECR guides (the female-ECR route is a tourist visa with a
    proof-of-funds requirement; the male-ECR route needs an OK to Board). */
export type Gender = "female" | "male";

/** Emirate the sponsor's Emirates ID was issued in. Only used by the Filipina
    guide, where it sets the private entry permit fee. */
export const EMIRATES = [
  "dubai",
  "abu-dhabi",
  "sharjah",
  "ajman",
  "umm-al-quwain",
  "ras-al-khaimah",
  "fujairah",
] as const;
export type Emirate = (typeof EMIRATES)[number];

/* ------------------------------- nationality ------------------------------ */

/** The nationalities that have their own guide in the document. Everything else
    resolves to "other" (the generic guide, which carries UAE immigration's own
    Good Conduct Certificate country list). */
export const NATIONALITIES = [
  "filipino",
  "ethiopian",
  "sri-lankan",
  "ugandan",
  "nepali",
  "indian",
  "kenyan",
  "cameroonian",
  "other",
] as const;

export type Nationality = (typeof NATIONALITIES)[number];

/**
 * Extra spellings accepted for the same nationality — country names as well as
 * demonyms, plus the variants an ERP picklist realistically holds. Without
 * these, a picklist that said "Philippines" rather than "Filipino" would
 * silently fall through to "other" and the client would get the generic guide
 * instead of the 50-day Philippines process.
 */
const NATIONALITY_ALIASES: Record<string, Nationality> = {
  // Philippines
  philippines: "filipino",
  philippino: "filipino",
  filipina: "filipino",
  philipino: "filipino",
  phillipino: "filipino",
  ph: "filipino",
  // Ethiopia
  ethiopia: "ethiopian",
  et: "ethiopian",
  // Sri Lanka
  "sri-lanka": "sri-lankan",
  srilanka: "sri-lankan",
  srilankan: "sri-lankan",
  "sri-lankese": "sri-lankan",
  sinhalese: "sri-lankan",
  lk: "sri-lankan",
  // Uganda
  uganda: "ugandan",
  ug: "ugandan",
  // Nepal
  nepal: "nepali",
  nepalese: "nepali",
  np: "nepali",
  // India
  india: "indian",
  in: "indian",
  // Kenya
  kenya: "kenyan",
  ke: "kenyan",
  // Cameroon
  cameroon: "cameroonian",
  cameroonians: "cameroonian",
  cameroonean: "cameroonian",
  cm: "cameroonian",
};

/**
 * Map whatever the caller's picklist sent onto a nationality the guide knows.
 * Unrecognised values resolve to "other" (the generic guide) rather than
 * failing, so the caller can pass its full nationality list through untouched.
 * The resolved value is echoed back in the API response so a caller can confirm
 * what a value actually mapped to.
 */
export function resolveNationality(input: unknown): Nationality {
  if (input == null) return "other";
  const s = String(input)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (!s) return "other";
  if ((NATIONALITIES as readonly string[]).includes(s)) return s as Nationality;
  return NATIONALITY_ALIASES[s] ?? "other";
}

/* --------------------------- location resolution -------------------------- */

/**
 * Nationalities whose guide splits on where the maid currently is. For these,
 * MAID_LOCATION is required — the two versions differ by weeks of process
 * (an Ethiopian in Ethiopia runs a 39-day local GCC + 30-day pre-departure that
 * a maid already abroad skips entirely), so guessing would show a client the
 * wrong timeline.
 */
export const LOCATION_SPLIT_NATIONALITIES: readonly Nationality[] = ["ethiopian", "nepali"];

/**
 * The Filipina guide is written end-to-end around the process INSIDE the
 * Philippines (partner agency in Manila, TESDA, OWWA, OEC). The document has no
 * counterpart for a Filipina already outside the Philippines, so that
 * combination falls back to the generic "other" guide — see README.
 */
const PHILIPPINES_ONLY: Nationality = "filipino";

/** Accepted spellings for "the maid is still in her home country" and its
    opposite. Country-specific phrasings ("in_ethiopia", "outside nepal") and
    the common ERP shorthands are all understood. */
function resolveLocation(input: unknown): MaidLocation | null {
  if (input == null) return null;
  const s = String(input)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (!s) return null;
  if ((LOCATIONS as readonly string[]).includes(s)) return s as MaidLocation;
  // "in-ethiopia", "in-nepal", "in-country", "home", "local"
  if (/^in(-|$)/.test(s) || s === "home" || s === "local" || s === "homeland") return "in-country";
  // "outside-ethiopia", "outside", "abroad", "uae", "in-uae", "overseas", "transfer"
  if (/^outside(-|$)/.test(s) || ["abroad", "overseas", "uae", "in-uae", "transfer"].includes(s)) {
    return "outside-country";
  }
  return null;
}

function resolvePassportType(input: unknown): PassportType | null {
  if (input == null) return null;
  const s = String(input)
    .trim()
    .toUpperCase()
    .replace(/[\s_-]+/g, "");
  if (s === "ECR") return "ECR";
  if (s === "ECNR" || s === "NONECR" || s === "NOECR") return "ECNR";
  return null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE VARIANT RESOLVER — which of the 14 guides does this client get?
   ─────────────────────────────────────────────────────────────────────────
   Precedence, highest first:

     1. PACKAGE = "visa-only"   → the Visa Only guide, whatever the nationality.
                                  (We issue the visa; the client books the flight.)
     2. NATIONALITY             → picks the country guide.
     3. MAID_LOCATION           → splits Ethiopian and Nepali into in/outside.
                                  Also gates Filipina, which is Philippines-only.
     4. PASSPORT_TYPE + GENDER  → splits Indian into ECNR / Male ECR / Female ECR.
     5. anything unresolved     → "other", the generic guide.

   A caller that already knows the answer can send SERVICE_GUIDE directly and
   skip all of this (same escape hatch the maid-visa-guide API gives for TA_CASE).
   ═══════════════════════════════════════════════════════════════════════════ */

export function resolveServiceGuide(signals: {
  pkg?: ApiPackage | null;
  nationality?: Nationality | null;
  location?: MaidLocation | null;
  passportType?: PassportType | null;
  gender?: Gender | null;
}): ServiceGuide {
  // 1. Visa-only short-circuits everything: the process is the same regardless
  //    of where she is from, because we stop at handing over the visa.
  if (signals.pkg === "visa-only") return "visa-only";

  const nat = signals.nationality ?? "other";
  const loc = signals.location ?? null;

  switch (nat) {
    // 2 + 3. Location-split nationalities.
    case "ethiopian":
      return loc === "outside-country" ? "ethiopian-outside-ethiopia" : "ethiopian-in-ethiopia";
    case "nepali":
      return loc === "outside-country" ? "nepali-outside-nepal" : "nepali-in-nepal";

    // 3. Philippines-only: the guide describes the in-country process, so a
    //    Filipina already abroad gets the generic guide instead.
    case PHILIPPINES_ONLY:
      return loc === "outside-country" ? "other" : "filipina-philippines";

    // 4. India splits on the passport's emigration-check status, and ECR
    //    additionally on gender (different visa route + extra clearance).
    case "indian": {
      if (signals.passportType === "ECNR") return "indian-ecnr";
      if (signals.passportType === "ECR") {
        return signals.gender === "male" ? "indian-male-ecr" : "indian-female-ecr";
      }
      // Unknown passport type — the schema requires it for Indians, so this is
      // only reachable when a caller sent SERVICE_GUIDE-less partial data.
      return "other";
    }

    // 2. Single-guide nationalities. The document gives these one version each
    //    (we obtain the attested GCC on her behalf either way), so location
    //    does not change the guide.
    case "sri-lankan":
      return "sri-lankan-in-sri-lanka";
    case "ugandan":
      return "ugandan";
    case "kenyan":
      return "kenyan";
    case "cameroonian":
      return "cameroonian";

    // 5. Everything else.
    case "other":
    default:
      return "other";
  }
}

/* ------------------------- entry permit fee (Filipina) -------------------- */

/** The Filipina private entry permit fee, which depends on the emirate that
    issued the sponsor's Emirates ID. Dubai files pay a refundable deposit on
    top of the government fee; every other emirate pays the government fee only. */
export type EntryPermitFee = {
  emirate: Emirate | null;
  /** Total payable now, in AED. */
  total: number;
  /** Refundable security deposit portion (Dubai only), in AED. */
  deposit: number;
  /** Non-refundable government fees portion, in AED. */
  government: number;
};

const DUBAI_FEE: EntryPermitFee = {
  emirate: "dubai",
  total: 2614,
  deposit: 2000,
  government: 614,
};
const OTHER_EMIRATE_FEE = { total: 450, deposit: 0, government: 450 };

/**
 * Resolve the entry permit fee for a known emirate. Returns null when the
 * emirate is unknown — the guide then shows BOTH options exactly as the source
 * document lists them, rather than guessing and quoting the wrong amount.
 */
export function entryPermitFeeFor(emirate: Emirate | null): EntryPermitFee | null {
  if (!emirate) return null;
  return emirate === "dubai" ? DUBAI_FEE : { emirate, ...OTHER_EMIRATE_FEE };
}

/** Both fee options, for the "emirate not supplied" case. */
export const ENTRY_PERMIT_FEES = {
  dubai: DUBAI_FEE,
  other: OTHER_EMIRATE_FEE,
} as const;

/** Dubai files pay the refundable deposit, so only they get the refund section. */
export function hasDepositRefund(emirate: Emirate | null): boolean {
  // Unknown emirate → show it, since the client may well be a Dubai file and
  // the section explains how to claim money that is genuinely theirs.
  return emirate === null || emirate === "dubai";
}

/* --------------------------- zod field coercions -------------------------- */

/* Tolerant coercions: the caller may send numbers or strings, upper or lower
   case, spaces or underscores. Normalize before enum-checking so a
   stringly-typed body still validates. */

const zServiceGuide = z.preprocess(
  (v) =>
    v == null
      ? v
      : String(v)
          .trim()
          .toLowerCase()
          .replace(/[\s_]+/g, "-"),
  z.enum(SERVICE_GUIDES),
);

// Package: "visa only", "VISA_ONLY", "vo", "visa-only" → "visa-only";
// anything else (including "full", "travel assist", "complete") → "full".
const zPackage = z.preprocess((v) => {
  if (v == null) return v;
  const s = String(v)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (["visa-only", "visaonly", "vo", "visa"].includes(s)) return "visa-only";
  return "full";
}, z.enum(PACKAGES));

// Nationality is NOT a strict enum: the caller passes its own picklist value
// through and we map it (unknown → "other"), so a new country in their list
// never breaks a request. resolveNationality() does the matching.
const zNationality = z.preprocess((v) => resolveNationality(v), z.enum(NATIONALITIES));

const zLocation = z.preprocess((v) => resolveLocation(v) ?? undefined, z.enum(LOCATIONS));

const zPassportType = z.preprocess(
  (v) => resolvePassportType(v) ?? undefined,
  z.enum(PASSPORT_TYPES),
);

// Emirate: "Abu Dhabi", "ABU_DHABI", "abu-dhabi" → "abu-dhabi". Unknown → undefined
// (the Filipina guide then shows both fee options rather than quoting one).
const zEmirate = z.preprocess((v) => {
  if (v == null) return v;
  const s = String(v)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");
  const direct = (EMIRATES as readonly string[]).includes(s) ? s : null;
  if (direct) return direct;
  const aliases: Record<string, Emirate> = {
    dxb: "dubai",
    auh: "abu-dhabi",
    abudhabi: "abu-dhabi",
    shj: "sharjah",
    ajm: "ajman",
    uaq: "umm-al-quwain",
    "umm-al-quwain": "umm-al-quwain",
    "umm-al-qaiwain": "umm-al-quwain",
    "umm-al-quwaim": "umm-al-quwain",
    rak: "ras-al-khaimah",
    "ras-al-khaima": "ras-al-khaimah",
    fuj: "fujairah",
  };
  return aliases[s] ?? undefined;
}, z.enum(EMIRATES));

// Gender → pronouns (and the Indian ECR split). Tolerant of "m"/"male"/"man".
const zGender = z.preprocess(
  (v) => {
    if (v == null) return v;
    const s = String(v).trim().toLowerCase();
    if (["male", "m", "man", "him", "his", "he"].includes(s)) return "male";
    if (["female", "f", "woman", "her", "hers", "she"].includes(s)) return "female";
    return undefined;
  },
  z.enum(["female", "male"]),
);

// Role/designation noun (maid, driver, chef, …). Free-form; lower-cased, capped.
const zRole = z.preprocess(
  (v) => (v == null ? v : String(v).trim().toLowerCase()),
  z.string().min(1).max(40),
);

/* ------------------------------ input schema ------------------------------ */

/**
 * The API request body. Every discriminator is optional on its own, but the
 * refinements below make a field REQUIRED once the other fields make it load
 * bearing — the same shape maid-visa-guide uses for
 * "EID_APPLICATION_TYPE is required when EMIRATE is abu_dhabi".
 *
 * Rationale for being strict here rather than defaulting: showing a client the
 * wrong process is worse than a 422. An Indian ECR maid sent the ECNR guide
 * would be told to expect arrival in 15 days instead of 25, with no mention of
 * the OK to Board clearance; a female ECR sent the male guide would never be
 * told to carry AED 2,000 in cash for immigration.
 */
export const GuideInputSchema = z
  .object({
    /** Your internal client identifier. Stored, never exposed in the link. */
    CLIENT_ID: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),

    /** Explicit override — send this and every discriminator below is ignored. */
    SERVICE_GUIDE: zServiceGuide.optional(),

    /* ---- the discriminators resolveServiceGuide() reads ---- */
    /** `full` (default) or `visa-only`. Visa-only wins over nationality. */
    PACKAGE: zPackage.optional().default("full"),
    /** Maid nationality. Unknown values map to "other". */
    NATIONALITY: zNationality.optional().default("other"),
    /** Where she is now. REQUIRED for Ethiopian and Nepali. */
    MAID_LOCATION: zLocation.optional(),
    /** Indian passport emigration-check status. REQUIRED for Indian. */
    PASSPORT_TYPE: zPassportType.optional(),
    /** REQUIRED for Indian ECR (picks male vs female guide). Elsewhere it only
        sets pronouns and defaults to female. */
    GENDER: zGender.optional(),

    /* ---- copy interpolation ---- */
    /** Worker designation shown throughout (maid, driver, chef…). Default "maid". */
    ROLE: zRole.optional().default("maid"),
    /** Emirate that issued the sponsor's Emirates ID. Only the Filipina guide
        uses it (entry permit fee). Omit it and both fee options are shown. */
    EMIRATE: zEmirate.optional(),

    /* ---- metadata: stored, shown in admin, never rendered on the guide ---- */
    /** Optional: a client can have several contracts. */
    contract_id: z
      .union([z.string(), z.number()])
      .transform((v) => String(v).trim())
      .optional(),
    /** Optional source tag; baked into the returned link as ?ref=. */
    ref: z.string().trim().max(64).optional(),
  })
  /* Ethiopian / Nepali: the in-country and outside-country guides differ by
     weeks of process, so the location must be stated. */
  .refine(
    (d) =>
      d.SERVICE_GUIDE != null ||
      d.PACKAGE === "visa-only" ||
      !LOCATION_SPLIT_NATIONALITIES.includes(d.NATIONALITY) ||
      d.MAID_LOCATION != null,
    {
      message:
        "MAID_LOCATION is required for Ethiopian and Nepali maids " +
        '("in-country" or "outside-country") — the two guides describe different processes',
      path: ["MAID_LOCATION"],
    },
  )
  /* Indian: ECR needs an extra government clearance that ECNR does not. */
  .refine(
    (d) =>
      d.SERVICE_GUIDE != null ||
      d.PACKAGE === "visa-only" ||
      d.NATIONALITY !== "indian" ||
      d.PASSPORT_TYPE != null,
    {
      message: 'PASSPORT_TYPE is required for Indian maids ("ECR" or "ECNR")',
      path: ["PASSPORT_TYPE"],
    },
  )
  /* Indian ECR: male and female take different visa routes entirely. */
  .refine(
    (d) =>
      d.SERVICE_GUIDE != null ||
      d.PACKAGE === "visa-only" ||
      d.NATIONALITY !== "indian" ||
      d.PASSPORT_TYPE !== "ECR" ||
      d.GENDER != null,
    {
      message:
        "GENDER is required for Indian ECR maids — the male route needs an OK to Board " +
        "clearance and the female route is a tourist visa with a proof-of-funds requirement",
      path: ["GENDER"],
    },
  );

export type GuideInput = z.infer<typeof GuideInputSchema>;

/* ------------------------------ stored shape ------------------------------ */

export type GuideData = {
  /** The resolved guide — the one thing the renderer actually needs. */
  serviceGuide: ServiceGuide;
  /** The discriminators it was resolved from, kept so admin can explain a link
      and /debug can re-hydrate the form that produced it. */
  pkg: ApiPackage;
  nationality: Nationality;
  maidLocation: MaidLocation | null;
  passportType: PassportType | null;
  /** null = the caller never stated a gender. Distinct from "female": pronouns
      fall back to she/her, but the Indian-ECR split refuses to guess. */
  gender: Gender | null;
  role: string;
  emirate: Emirate | null;
  /** Optional — a client can have multiple contracts. Metadata, not rendered. */
  contractId: string | null;
  /** Optional source tag (baked into the shared link). Metadata, not rendered. */
  ref: string | null;
};

/** Normalize a validated API body into the stored/renderable shape. */
export function guideDataFromInput(input: GuideInput): GuideData {
  const nationality = input.NATIONALITY;
  const pkg = input.PACKAGE;
  // Kept as null when unstated so a later PATCH cannot silently resolve an
  // Indian ECR guide off a defaulted gender.
  const gender = input.GENDER ?? null;
  return {
    serviceGuide:
      input.SERVICE_GUIDE ??
      resolveServiceGuide({
        pkg,
        nationality,
        location: input.MAID_LOCATION ?? null,
        passportType: input.PASSPORT_TYPE ?? null,
        gender,
      }),
    pkg,
    nationality,
    // Location is only meaningful for the nationalities that split on it.
    maidLocation: input.MAID_LOCATION ?? null,
    passportType: nationality === "indian" ? (input.PASSPORT_TYPE ?? null) : null,
    gender,
    role: input.ROLE,
    emirate: input.EMIRATE ?? null,
    contractId: input.contract_id ?? null,
    ref: input.ref ?? null,
  };
}

/* ------------------------------ update schema ----------------------------- */

/**
 * PATCH body: every field optional — only what's sent is changed. The token
 * itself is never updatable, so the client's link keeps working and simply
 * shows the corrected guide.
 *
 * Note the asymmetry with GuideInputSchema: a PATCH cannot run the
 * "required when …" refinements, because it only sees the fields being changed
 * and not the stored row. The API therefore re-resolves the guide from the
 * MERGED row after applying the patch (see routes/api/guides.ts), which is
 * where those invariants are re-checked.
 */
export const GuideUpdateSchema = z.object({
  CLIENT_ID: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .optional(),
  SERVICE_GUIDE: zServiceGuide.optional(),
  PACKAGE: zPackage.optional(),
  NATIONALITY: zNationality.optional(),
  MAID_LOCATION: zLocation.optional(),
  PASSPORT_TYPE: zPassportType.optional(),
  GENDER: zGender.optional(),
  ROLE: zRole.optional(),
  EMIRATE: zEmirate.optional(),
  contract_id: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .optional(),
  ref: z.string().trim().max(64).optional(),
});

export type GuideUpdate = z.infer<typeof GuideUpdateSchema>;

/** Map a validated PATCH body onto the stored column names (only sent keys). */
export function guidePatchFromInput(u: GuideUpdate): Record<string, string | number | null> {
  const p: Record<string, string | number | null> = {};
  if (u.CLIENT_ID !== undefined) p.client_id = u.CLIENT_ID;
  if (u.SERVICE_GUIDE !== undefined) p.service_guide = u.SERVICE_GUIDE;
  if (u.PACKAGE !== undefined) p.pkg = u.PACKAGE;
  if (u.NATIONALITY !== undefined) p.nationality = u.NATIONALITY;
  if (u.MAID_LOCATION !== undefined) p.maid_location = u.MAID_LOCATION;
  if (u.PASSPORT_TYPE !== undefined) p.passport_type = u.PASSPORT_TYPE;
  if (u.GENDER !== undefined) p.gender = u.GENDER;
  if (u.ROLE !== undefined) p.role = u.ROLE;
  if (u.EMIRATE !== undefined) p.emirate = u.EMIRATE;
  if (u.contract_id !== undefined) p.contract_id = u.contract_id;
  if (u.ref !== undefined) p.ref = u.ref;
  return p;
}

/**
 * Re-resolve the guide for a row after a PATCH. A caller who patches
 * NATIONALITY (or PACKAGE, PASSPORT_TYPE, …) expects the rendered guide to
 * follow; a caller who patched SERVICE_GUIDE explicitly at any point expects
 * their choice to stick. `explicit` is that stored choice.
 */
export function reresolveServiceGuide(
  row: Pick<GuideData, "pkg" | "nationality" | "maidLocation" | "passportType" | "gender">,
  explicit: ServiceGuide | null,
): ServiceGuide {
  if (explicit) return explicit;
  return resolveServiceGuide({
    pkg: row.pkg,
    nationality: row.nationality,
    location: row.maidLocation,
    passportType: row.passportType,
    gender: row.gender,
  });
}

/* ---------------------- merged-row invariant checking --------------------- */

/**
 * The discriminators a stored row is still missing before it can resolve to a
 * definite guide. Empty array = the row resolves cleanly.
 *
 * GuideInputSchema's refinements enforce this on CREATE, but a PATCH only sees
 * the fields being changed — patching NATIONALITY to "indian" without also
 * sending PASSPORT_TYPE would otherwise fall through to the generic guide and
 * quietly show the client the wrong process. The API runs this against the
 * MERGED row after applying a patch, and rejects the patch if anything is
 * missing. A row with an explicit SERVICE_GUIDE never needs discriminators.
 */
export function missingDiscriminators(row: {
  explicitGuide?: ServiceGuide | null;
  pkg: ApiPackage;
  nationality: Nationality;
  maidLocation: MaidLocation | null;
  passportType: PassportType | null;
  gender: Gender | null;
}): string[] {
  if (row.explicitGuide) return [];
  if (row.pkg === "visa-only") return [];
  const missing: string[] = [];
  if (LOCATION_SPLIT_NATIONALITIES.includes(row.nationality) && row.maidLocation == null) {
    missing.push(
      `MAID_LOCATION (required for ${row.nationality} — "in-country" or "outside-country")`,
    );
  }
  if (row.nationality === "indian") {
    if (row.passportType == null) {
      missing.push('PASSPORT_TYPE (required for Indian — "ECR" or "ECNR")');
    } else if (row.passportType === "ECR" && row.gender == null) {
      missing.push("GENDER (required for Indian ECR — male and female take different routes)");
    }
  }
  return missing;
}

/* ------------------------------ link parsing ------------------------------ */

/**
 * Accepts anything that identifies a guide and returns its bare token:
 *   https://maidscc.app/v/Ang1vo?ref=whatsapp   → "Ang1vo"
 *   /v/Ang1vo   ·   v/Ang1vo   ·   Ang1vo       → "Ang1vo"
 * Query strings, hashes, trailing slashes and surrounding whitespace are
 * tolerated, so an operator can paste a complete link straight from WhatsApp.
 * Returns null when nothing token-shaped is found.
 */
export function parseGuideToken(input: string): string | null {
  if (!input) return null;
  let s = String(input).trim();
  if (!s) return null;
  // strip hash + query, then a trailing slash
  s = s.split("#")[0].split("?")[0].replace(/\/+$/, "");
  // a /v/<token> segment anywhere in the string wins
  const m = s.match(/(?:^|\/)v\/([A-Za-z0-9_-]+)/i);
  if (m) return m[1];
  // otherwise: if it still looks like a URL/path, take the last segment
  const last = s.split("/").filter(Boolean).pop() ?? "";
  return /^[A-Za-z0-9_-]+$/.test(last) ? last : null;
}

/* --------------------------- component render config ---------------------- */

export type VariantConfig = {
  /** Which of the 14 guides to render. */
  serviceGuide: ServiceGuide;
  /** Worker designation noun (maid, driver, chef…). */
  role: string;
  /** Worker gender — drives pronouns. */
  gender: Gender;
  /** Sponsor's Emirates ID emirate; null shows both Filipina fee options. */
  emirate: Emirate | null;
};

/**
 * What the PUBLIC /v/ page is allowed to receive. `contractId` and `ref` are
 * internal metadata that the guide never renders, and anything handed to the
 * route loader is serialised into the page's hydration payload where the client
 * could read it — so they are excluded here by type, not by habit.
 */
export type GuideRenderData = Omit<GuideData, "contractId" | "ref">;

export function toVariantConfig(g: GuideRenderData): VariantConfig {
  return {
    serviceGuide: g.serviceGuide,
    role: g.role || "maid",
    gender: g.gender ?? "female",
    emirate: g.emirate ?? null,
  };
}

/** Sensible default used by /debug's initial state. */
export const DEFAULT_VARIANT: VariantConfig = {
  serviceGuide: "filipina-philippines",
  role: "maid",
  gender: "female",
  emirate: "dubai",
};

/* --------------------------- role + pronoun terms ------------------------- */

/** The interpolation vocabulary for a guide — the designation noun plus the
    right pronouns for the worker's gender. Used everywhere copy refers to
    her/him, so one content string serves both genders.

    This also fixes a copy-paste slip in the source document: the Indian Male
    ECR tab is written in he/his but still says "within 3 days of HER being
    ready to travel". Interpolating from one vocabulary makes that impossible. */
export type Terms = {
  role: string; // maid / driver
  Role: string; // Maid / Driver (title-cased)
  subj: string; // she / he
  Subj: string; // She / He
  obj: string; // her / him
  Obj: string; // Her / Him
  poss: string; // her / his
  Poss: string; // Her / His
};

export function makeTerms(role: string, gender: Gender): Terms {
  const r = (role || "maid").trim().toLowerCase() || "maid";
  const female = gender !== "male";
  return {
    role: r,
    // Title-case each word so multi-word designations render cleanly in the H1.
    Role: r
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" "),
    subj: female ? "she" : "he",
    Subj: female ? "She" : "He",
    obj: female ? "her" : "him",
    Obj: female ? "Her" : "Him",
    poss: female ? "her" : "his",
    Poss: female ? "Her" : "His",
  };
}

/**
 * Interpolate a content string's {placeholders} from the terms vocabulary.
 * Unknown placeholders are left untouched so a typo shows up loudly in review
 * rather than silently deleting a word from a client-facing document.
 */
export function fill(template: string, t: Terms): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in t ? (t as unknown as Record<string, string>)[key] : whole,
  );
}

/* ----------------------------- number formatting -------------------------- */

/** AED with thousands separators, e.g. 2614 → "AED 2,614". */
export function aed(n: number): string {
  return `AED ${Math.round(n).toLocaleString("en-US")}`;
}
