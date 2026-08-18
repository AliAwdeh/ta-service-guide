import type { ServiceGuide } from "./guide-config";

/* ═══════════════════════════════════════════════════════════════════════════
   GUIDE CONTENT — the 14 service guides, as data
   ─────────────────────────────────────────────────────────────────────────
   Transcribed from the source document, one entry per tab:
   docs.google.com/document/d/16bsdh4rvjiVYXDkl2RBWslFiTr7Ic2381EdCS5kbwRs

   The renderer (components/service-guide.tsx) is generic: it draws whatever is
   in here, so a wording change is a one-line edit in this file and never a
   component change.

   Conventions
   ───────────
   • {placeholders}  interpolated from Terms (see guide-config.ts `fill`):
                     {role} {Role} {subj} {Subj} {obj} {Obj} {poss} {Poss}.
                     Every reference to the worker goes through these, so one
                     content string serves a maid and a male driver alike.
   • **bold**        inline emphasis, rendered as <strong>. Mirrors the bold the
                     source document uses for amounts and durations.
   • `sourceLabel`   the stage number as the DOCUMENT prints it, kept even where
                     the document is wrong. Stages are RENUMBERED sequentially
                     for display (a client-facing page must not show "02" twice)
                     and any mismatch is surfaced on /debug. See DOC_ISSUES.
   ═══════════════════════════════════════════════════════════════════════════ */

export type IconName =
  | "shield"
  | "doc"
  | "plane"
  | "clock"
  | "ship"
  | "training"
  | "stamp"
  | "permit"
  | "refresh"
  | "check"
  | "money"
  | "building"
  | "medical";

/** A bulleted item, optionally with its own sub-bullets (the source document's
    "Proof of Income: (Both Required)" shape). */
export type Bullet = { text: string; sub?: string[] };

/** A boxed aside. The source document uses single-cell tables for these; `tone`
    picks the visual treatment. */
export type Callout = {
  tone: "documents" | "info" | "breakdown";
  title?: string;
  /** Lead paragraphs. */
  body?: string[];
  /** Bulleted items. */
  items?: Bullet[];
  /** label → value rows (process breakdowns with their durations). */
  rows?: { label: string; value?: string }[];
  /** Small print inside the box. */
  note?: string;
  /** Render only when the sponsor's Emirates ID is (or may be) Dubai-issued —
      the refundable AED 2,000 deposit only applies to Dubai files. */
  onlyWithDeposit?: boolean;
};

/** A titled block inside a stage (the source document's un-numbered
    "Private Entry Permit Fees" / "Process Initiation in the Philippines"). */
export type Subsection = {
  title: string;
  body?: string[];
  callouts?: Callout[];
  /** Renders the emirate-dependent private entry permit fee block. */
  feeBlock?: boolean;
};

export type Stage = {
  /** The number the source document prints for this stage. Display numbering is
      derived from array order instead — see the file header. */
  sourceLabel: string;
  title: string;
  /** As printed: "2 Weeks", "39 days", "3 Days". */
  duration?: string;
  icon: IconName;
  body?: string[];
  bullets?: string[];
  /** Paragraphs printed after the bullets. */
  bodyAfter?: string[];
  callouts?: Callout[];
  subsections?: Subsection[];
  /** The italic "In parallel, …" line the document puts under some stages. */
  parallel?: string;
  /** INTERNAL ONLY — surfaced on /debug, never on the client page. Flags a
      defect in the source document at this stage. */
  docNote?: string;
};

export type Glance = {
  body: string;
  note?: string;
};

export type GuideContent = {
  slug: ServiceGuide;
  /** The source tab's own title, verbatim (typos included) — so an operator can
      match a rendered guide back to the document tab it came from. */
  tabTitle: string;
  /** Short human label for the H1 subtitle and the /debug picker. */
  label: string;
  /** The second paragraph of the document's opening note; the first is shared. */
  introDetail: string;
  stages: Stage[];
  glance: Glance | null;
};

/* ---------------------------- shared boilerplate --------------------------- */

/** Opening line — identical on all 14 tabs. */
export const INTRO_LEAD = "Thank you for placing your trust in our services.";

/** Closing line — identical on all 14 tabs. */
export const OUTRO =
  "Throughout the entire process, our dedicated team remains available to guide and " +
  "assist you at every stage, ensuring a seamless experience.";

/** "Our Guarantee to You" — byte-identical on all 14 tabs, so it lives here once
    and the renderer appends it as the final section of every guide. */
export const GUARANTEE = {
  title: "Our Guarantee to You",
  body: [
    "If we are unable to bring your {role} to the UAE for any reason from our end, you will " +
      "receive a full refund of all amounts paid.",
    "If you and/or your {role} choose to cancel the arrangement, a refund will be issued after " +
      "deducting any expenses incurred up to that stage.",
  ],
} as const;

/* Recurring copy, hoisted so a wording change lands everywhere at once. */

const FLIGHT_3_DAYS =
  "Flights are typically arranged within 3 days of {obj} being ready to travel.";
const AIRPORT_PICKUP =
  "We will also arrange airport pickup and ensure {subj} is brought directly to your doorstep.";

/** The standard flight stage used by every guide that ships her from abroad. */
const flightStage = (opts: {
  sourceLabel: string;
  duration?: string;
  lead: string;
  docNote?: string;
}): Stage => ({
  sourceLabel: opts.sourceLabel,
  title: "Flight Booking & Arrival",
  duration: opts.duration,
  icon: "plane",
  body: [opts.lead, FLIGHT_3_DAYS, AIRPORT_PICKUP],
  ...(opts.docNote ? { docNote: opts.docNote } : {}),
});

const VISA_7_BUSINESS_DAYS =
  "Visa processing typically takes up to 7 business days after the government accepts the " +
  "submitted documents.";

/** "Passport copy + face photo" — the minimum document set on most tabs. */
const PASSPORT_AND_PHOTO: Bullet[] = [
  { text: "{Role}'s Passport Copy" },
  { text: "{Role}'s Face Photo" },
];

const GCC_INTRO_ATTESTED =
  "Before the visa application can be initiated, your {role} must obtain a Good Conduct " +
  "Certificate confirming {subj} has no criminal record. This certificate must then be " +
  "officially attested first by the Ministry of Foreign Affairs, then by the UAE Embassy.";

const GCC_INTRO_MANDATORY =
  "Before the visa application can be initiated, your {role} must obtain a Good Conduct " +
  "Certificate confirming {subj} has no criminal record. This is a mandatory requirement for " +
  "all {role}s.";

/** Required-documents box for the "we obtain the attested GCC" tabs. */
const gccDocuments = (note: string): Callout => ({
  tone: "documents",
  title: "Required Documents",
  items: [...PASSPORT_AND_PHOTO, { text: "Attested Good Conduct Certificate" }],
  note,
});

/* ═══════════════════════════════════════════════════════════════════════════
   KNOWN DEFECTS IN THE SOURCE DOCUMENT
   ─────────────────────────────────────────────────────────────────────────
   Transcribed faithfully rather than silently corrected — inventing process
   facts in a client-facing legal/financial document is worse than reproducing a
   flaw we have flagged. Each item is also attached to its stage as `docNote`
   and shown on /debug. Fix upstream, then update this file.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DOC_ISSUES: { guide: ServiceGuide; issue: string }[] = [
  {
    guide: "nepali-outside-nepal",
    issue:
      'Flight stage opens "Once the POE is approved" but this guide has no POE stage — ' +
      "copy-paste from the Nepal-in-Nepal tab. Every other outside-country tab reads " +
      '"Once the entry visa is issued". Needs a decision before this goes to clients.',
  },
  {
    guide: "nepali-outside-nepal",
    issue: 'Section numbering skips 03: stages run 01, 02, then "Our Guarantee to You" as 04.',
  },
  {
    guide: "sri-lankan-in-sri-lanka",
    issue: 'Two stages are both numbered "03" (Pre-Departure Processing and Flight Booking).',
  },
  {
    guide: "kenyan",
    issue:
      'Two stages are both numbered "02"; and the Travel & Visa heading says "(7 Days)" while ' +
      'its body says "up to 10 business days".',
  },
  {
    guide: "cameroonian",
    issue:
      'Two stages are both numbered "02"; the Travel & Visa heading says "(7 Days)" while its ' +
      'body says "up to 10 business days"; and the GCC is said to be attested "in Nigeria", ' +
      "which for a Cameroonian file is presumably meant to be Cameroon.",
  },
  {
    guide: "filipina-philippines",
    issue: 'Tab title misspells Philippines as "Philipines".',
  },
  {
    guide: "indian-male-ecr",
    issue:
      'Written in he/his but the flight line still says "within 3 days of her being ready to ' +
      'travel". Fixed here by construction — pronouns interpolate from {obj}.',
  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   THE GUIDES
   ═══════════════════════════════════════════════════════════════════════════ */

/* ------------------------ 1. Filipina in the Philippines ------------------- */

const FILIPINA_PHILIPPINES: GuideContent = {
  slug: "filipina-philippines",
  tabTitle: "Service Guide - Filipina in Philipines",
  label: "Filipina in the Philippines",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} from the Philippines to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      icon: "doc",
      body: [
        "The first step in bringing your {role} to the UAE is to apply for {poss} entry permit. " +
          "The issuance of the entry permit usually takes up to 7 working days after receiving " +
          "all the required documents.",
      ],
      callouts: [
        {
          tone: "documents",
          title: "Required Documents to apply for the entry permit",
          items: [
            { text: "Marriage Certificate attested by the embassy." },
            {
              text: "Proof of Income: (Both Required)",
              sub: [
                "Salary certificate (Above AED 25,000) or Trade license copy",
                "A 3-month bank statement",
              ],
            },
            {
              text: "Proof of Residency: (Only one is required)",
              sub: ["Recent DEWA bill", "Tenancy contract", "Title deed"],
            },
            {
              text: "Personal Documents:",
              sub: [
                "Sponsor and spouse's passport & visa copies",
                "Sponsor's original Emirates ID on both sides",
                "{Role}'s passport copy and photo",
              ],
            },
          ],
        },
        {
          tone: "info",
          title: "Additional Requirements",
          items: [
            {
              text:
                "If this is your first time sponsoring a housemaid, you should visit our " +
                "maids.cc office with your original Emirates ID to open a MOHRE file.",
            },
            {
              text:
                "In cases where the sponsor and the housemaid share the same nationality, a " +
                "No Blood Relationship Certificate, attested by the MWO, is required.",
            },
          ],
        },
      ],
      subsections: [
        {
          title: "Private Entry Permit Fees",
          body: [
            "Upon settlement of the Travel Assist fees and submission of the required documents, " +
              "you will receive a payment link to settle the private entry permit fees. The " +
              "amount depends on the emirate in which the sponsor's Emirates ID was issued:",
          ],
          feeBlock: true,
        },
        {
          title: "Process Initiation in the Philippines",
          body: [
            "As soon as the entry permit documents are received, our partner agency in the " +
              "Philippines will coordinate directly with your {role} and arrange {poss} move to " +
              "our accommodation.",
            "Your {role} is welcome to stay at our accommodation in Manila free of charge, with " +
              "meals and transportation provided. If {subj} is located far from Manila, we will " +
              "also cover the cost of {poss} domestic travel to reach our agency.",
            "We will schedule all required appointments for your {role} to complete the process " +
              "in the Philippines. Please note that your {role}'s availability and punctuality " +
              "are essential to avoid any delays.",
          ],
        },
      ],
    },
    {
      sourceLabel: "02",
      title: "Philippine Consulate Attestation — Dubai",
      duration: "2 Weeks",
      icon: "stamp",
      body: [
        "Once the entry permit is issued, it will be submitted with the required documents to " +
          "the Philippine Consulate in Dubai for attestation.",
        "In parallel, your {role} will undergo medical examination, and upon being declared fit " +
          "to work, {poss} medical certificate will be issued.",
      ],
    },
    {
      sourceLabel: "03",
      title: "Document Shipment & Pre-Departure Processing — Philippines",
      duration: "2 Weeks",
      icon: "ship",
      body: [
        "Once attestation by the Philippine Consulate is completed, the documents (entry permit " +
          "and contract) will be shipped to our partner agency in the Philippines.",
        "Upon receipt of the documents, the agency will proceed with the remaining steps, " +
          "including:",
      ],
      bullets: ["TESDA training", "TESDA assessment scheduling", "TESDA certificate issuance"],
    },
    {
      sourceLabel: "04",
      title: "Final Preparations — Philippines",
      duration: "2 Weeks",
      icon: "training",
      body: ["The final steps of the process include:"],
      bullets: [
        "OWWA seminar and certificate issuance",
        "OEC (Overseas Employment Certificate) issuance",
      ],
    },
    flightStage({
      sourceLabel: "05",
      lead:
        "Once the OEC is issued, we will contact you to confirm your preferred travel date and " +
        "proceed with flight booking.",
    }),
    {
      sourceLabel: "06",
      title: "Entry Permit Cancellation & Refund",
      icon: "refresh",
      body: [
        "Once your {role} arrives in the UAE, you will be guided to cancel {poss} entry permit " +
          "online via the MOHRE app or website:",
      ],
      bullets: [
        "Confirmation will be sent via SMS or email once approved.",
        "Following approval, we will proceed with the Change of Status application.",
      ],
      bodyAfter: [
        "Once the Change of Status is issued, we will proceed with issuing the 2-year " +
          "residency visa.",
      ],
      callouts: [
        {
          tone: "info",
          title: "For Dubai files only (where AED 2,614 was paid)",
          body: [
            "You may visit our center with your Emirates ID to request the refund of the " +
              "**AED 2,000** security deposit.",
          ],
          onlyWithDeposit: true,
        },
      ],
    },
  ],
  glance: {
    body:
      "From the moment your {role} arrives at our accommodation in the Philippines, {subj} " +
      "will reach your house in under **50 days**.",
  },
};

/* --------------------------- 2. Ethiopian in Ethiopia --------------------- */

const ETHIOPIAN_IN_ETHIOPIA: GuideContent = {
  slug: "ethiopian-in-ethiopia",
  tabTitle: "Service Guide - Ethiopian in Ethiopia",
  label: "Ethiopian in Ethiopia",
  introDetail:
    "This document has been prepared to provide you with clear understanding of each stage " +
    "involved in bringing your {role} from Ethiopia to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Good Conduct Certificate Issuance & Attestation – Ethiopia",
      duration: "39 days",
      icon: "shield",
      body: [GCC_INTRO_ATTESTED],
      callouts: [
        {
          tone: "documents",
          title: "Required Documents",
          items: [...PASSPORT_AND_PHOTO, { text: "Attested Good Conduct Certificate" }],
        },
        {
          tone: "breakdown",
          title: "Good Conduct Certificate Process Breakdown",
          rows: [
            { label: "GCC Issuance", value: "7 working days" },
            {
              label: "GCC Attestation (at the Ministry of Foreign Affairs & UAE Embassy)",
              value: "32 working days",
            },
          ],
        },
      ],
      parallel:
        "In parallel, your {role} will initiate the Pre-Departure Processing (See section 3) " +
        "through our partner agency in Ethiopia.",
    },
    {
      sourceLabel: "02",
      title: "Travel & Visa Processing",
      duration: "7 days",
      icon: "doc",
      body: [
        "Once we receive the required documents, we will initiate the visa application. " +
          VISA_7_BUSINESS_DAYS,
        "Once issued, the visa will be shared with our partner agency in Ethiopia to complete " +
          "the remaining procedures locally.",
      ],
    },
    {
      sourceLabel: "03",
      title: "Pre-Departure Processing – Ethiopia",
      duration: "30 Days",
      icon: "training",
      body: [
        "Pre-departure processing can begin in parallel with the visa application and does not " +
          "require the entry visa.",
        "Our partner agency will arrange your {role}'s travel to Addis Ababa and handle all " +
          "required government procedures, including:",
      ],
      bullets: [
        "Labour registration",
        "Biometric registration",
        "Medical examination",
        "Training and Certificate of Competency (COC) issuance",
      ],
    },
    {
      sourceLabel: "04",
      title: "Exit Permit – Ethiopia",
      duration: "7 Days",
      icon: "permit",
      body: [
        "Once the entry permit is issued and all documents are fully attested, our partner " +
          "agency will complete the final pre-departure requirements, including issuance of the " +
          "exit permit.",
      ],
    },
    flightStage({
      sourceLabel: "05",
      duration: "3 Days",
      lead:
        "Following the issuance of the exit permit, we will coordinate with you to confirm the " +
        "preferred travel date and arrange the flight booking.",
    }),
  ],
  glance: {
    body:
      "From the moment your {role} visits the agency, {subj} will arrive at your doorstep in " +
      "under **60 Business Days.**",
    note: "Steps 01–02 and Step 03 run simultaneously, so Step 03 adds no extra time to this total.",
  },
};

/* ------------------------ 3. Ethiopian outside Ethiopia ------------------- */

const ETHIOPIAN_OUTSIDE_ETHIOPIA: GuideContent = {
  slug: "ethiopian-outside-ethiopia",
  tabTitle: "Service Guide - Ethiopian Outside Ethiopia",
  label: "Ethiopian outside Ethiopia",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Good Conduct Certificate Issuance & Attestation – Ethiopia",
      duration: "46 days",
      icon: "shield",
      body: [
        "Before the visa application can be initiated, your {role} must obtain an Attested " +
          "Good Conduct Certificate confirming {subj} has no criminal record. This is a " +
          "mandatory requirement for all {role}s.",
      ],
      callouts: [
        {
          tone: "documents",
          title: "Required Documents",
          items: [...PASSPORT_AND_PHOTO, { text: "Attested Good Conduct Certificate" }],
        },
        {
          tone: "breakdown",
          title: "How the GCC Is Issued",
          rows: [
            {
              label: "{Role} visits the Ethiopian embassy for biometrics & power of attorney",
              value: "1 visit, no appointment needed",
            },
            {
              label: "Our agent guides {obj} through it and shares sample documents beforehand",
            },
            {
              label: "{Subj} sends the hardcopy documents to our agency via DHL",
              value: "7 working days",
            },
            { label: "GCC Issuance", value: "7 working days" },
            {
              label: "GCC Attestation (Ministry of Foreign Affairs & UAE Embassy)",
              value: "32 working days",
            },
          ],
        },
      ],
    },
    {
      sourceLabel: "02",
      title: "Travel & Visa Processing",
      icon: "doc",
      body: [
        "Once we receive your {role}'s documents, we will apply for {poss} visa. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    flightStage({
      sourceLabel: "03",
      duration: "3 Days",
      lead:
        "Once the entry visa is issued, we will share it with you and coordinate to confirm " +
        "your preferred travel date and arrange the flight booking.",
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s passport copy and photo are submitted, {subj} will arrive " +
      "at your doorstep in under **60 Working Days.**",
  },
};

/* --------------------------- 4. Sri Lankan in Sri Lanka ------------------- */

const SRI_LANKAN_IN_SRI_LANKA: GuideContent = {
  slug: "sri-lankan-in-sri-lanka",
  tabTitle: "Service Guide - SriLanka in Sri Lanka",
  label: "Sri Lankan in Sri Lanka",
  introDetail:
    "This document has been prepared to provide you with clear understanding of each stage " +
    "involved in bringing your {role} from Sri Lanka to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Good Conduct Certificate Issuance & Attestation – Sri Lanka",
      duration: "39 days",
      icon: "shield",
      body: [GCC_INTRO_ATTESTED],
      callouts: [
        {
          tone: "documents",
          title: "Required Documents",
          items: [...PASSPORT_AND_PHOTO, { text: "Attested Good Conduct Certificate" }],
        },
        {
          tone: "breakdown",
          title: "GCC Process Breakdown",
          rows: [
            { label: "GCC Issuance", value: "25 working days" },
            { label: "GCC Attestation", value: "14 working days" },
          ],
        },
      ],
      parallel:
        "In parallel, your {role} will initiate the Pre-Departure Processing (See section 3) " +
        "through our partner agency in Sri Lanka.",
    },
    {
      sourceLabel: "02",
      title: "Travel & Visa Processing",
      duration: "7 days",
      icon: "doc",
      body: [
        "Once we receive the required documents, we will initiate the visa application. " +
          VISA_7_BUSINESS_DAYS,
        "Once issued, the visa will be shared with our partner agency in Sri Lanka to complete " +
          "the remaining procedures locally.",
      ],
    },
    {
      sourceLabel: "03",
      title: "Pre-Departure Processing — Sri Lanka",
      duration: "38 Days",
      icon: "training",
      body: [
        "Pre-departure processing can begin in parallel with the visa application and does not " +
          "require the entry visa.",
        "Our partner agency in Sri Lanka will coordinate with your {role} to initiate the " +
          "required government procedures, including {poss} mandatory training which takes up " +
          "to 38 days to complete.",
        "In parallel, our PRO will apply for contract attestation at the Sri Lankan Embassy in " +
          "the UAE.",
      ],
      callouts: [
        {
          tone: "info",
          title: "Development Office Approval",
          body: [
            "Our partner agency in Sri Lanka will submit a request for the development office " +
              "to visit the {role} and approve {poss} travel. A development officer will visit " +
              "within **8-10 days** to ensure {subj} does not have children below the age of 2 " +
              "or without a proper guardian.",
          ],
        },
      ],
    },
    flightStage({
      sourceLabel: "03",
      lead:
        "Once training is completed, we will coordinate with you to confirm the preferred " +
        "travel date and arrange the flight booking.",
      docNote: 'The document numbers this stage "03" as well — a duplicate of Pre-Departure.',
    }),
  ],
  glance: {
    body:
      "From the moment your {role} visits the agency, {subj} will arrive at your doorstep in " +
      "under **60 Business Days.**",
    note: "Steps 01–02 and Step 03 run simultaneously, so Step 03 adds no extra time to this total.",
  },
};

/* --------------------------------- 5. Ugandan ----------------------------- */

const UGANDAN: GuideContent = {
  slug: "ugandan",
  tabTitle: "Service Guide - Ugandan",
  label: "Ugandan",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      duration: "12 Days",
      icon: "doc",
      callouts: [
        {
          tone: "documents",
          title: "Required Documents",
          items: [
            ...PASSPORT_AND_PHOTO,
            { text: "**Good Conduct Certificate:** Acquired from the police station." },
          ],
          note:
            "We can obtain the Attested Good Conduct Certificate on your {role}'s behalf, free " +
            "of charge. This typically takes **5** working days.",
        },
      ],
      body: [
        "Once we receive the required documents, we will initiate the visa application. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    flightStage({
      sourceLabel: "02",
      duration: "3 Days",
      lead:
        "Once the entry visa is issued, we will share it with you and coordinate to confirm " +
        "your preferred travel date and arrange the flight booking.",
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s passport copy and photo are submitted, {subj} will arrive " +
      "at your doorstep in **~ 15 business days.**",
  },
};

/* ------------------------------ 6. Nepali in Nepal ------------------------ */

/** Shared by both Nepali guides — the document prints an identical box on each. */
const NEPAL_DOCUMENTS: Callout = {
  tone: "documents",
  title: "Required Documents",
  items: [
    { text: "Passport" },
    { text: "Profile Picture" },
    {
      text:
        "**Good Conduct Certificate (GCC)**: Acquired from the police stations and must be " +
        "attested first by the Ministry of Foreign Affairs, then by the UAE Embassy.",
    },
  ],
  note:
    "If the {role} does not have a GCC, issuing and attesting it typically takes 15 " +
    "business days.",
};

const NEPALI_IN_NEPAL: GuideContent = {
  slug: "nepali-in-nepal",
  tabTitle: "Service Guide - Nepal in Nepal",
  label: "Nepali in Nepal",
  introDetail:
    "This document has been prepared to provide you with clear understanding of each stage " +
    "involved in bringing your {role} from Nepal to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      duration: "22 Days",
      icon: "doc",
      callouts: [NEPAL_DOCUMENTS],
      body: [
        "Once we receive the required documents, we will initiate the visa application. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    {
      sourceLabel: "02",
      title: "POE Process — Nepal",
      duration: "15 Days",
      icon: "permit",
      body: [
        "Upon the issuance of the visa, we will begin the Permit of Exit (POE) process through " +
          "the relevant Nepalese authorities. This is a mandatory government clearance required " +
          "before your {role} can travel to the UAE.",
      ],
    },
    flightStage({
      sourceLabel: "03",
      duration: "3 Days",
      lead:
        "Once the POE is approved, we will coordinate with you to confirm the preferred travel " +
        "date and arrange the flight booking.",
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in under **40 Business Days**",
  },
};

/* ---------------------------- 7. Nepali outside Nepal --------------------- */

const NEPALI_OUTSIDE_NEPAL: GuideContent = {
  slug: "nepali-outside-nepal",
  tabTitle: "Service Guide - Nepal Outside Nepal",
  label: "Nepali outside Nepal",
  introDetail:
    "This document has been prepared to provide you with clear understanding of each stage " +
    "involved in bringing your Nepali {role} to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      duration: "22 Days",
      icon: "doc",
      callouts: [NEPAL_DOCUMENTS],
      body: [
        "Once we receive the required documents, we will initiate the visa application. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    flightStage({
      sourceLabel: "02",
      duration: "3 Days",
      // Verbatim from the document, including the reference to a POE stage that
      // does not exist in this guide. See DOC_ISSUES.
      lead:
        "Once the POE is approved, we will coordinate with you to confirm the preferred travel " +
        "date and arrange the flight booking.",
      docNote:
        'Opens "Once the POE is approved" but this guide has no POE stage. Every other ' +
        'outside-country tab reads "Once the entry visa is issued".',
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in under **25 Business Days**",
  },
};

/* ------------------------------ 8. Indian — ECNR -------------------------- */

const INDIAN_ECNR: GuideContent = {
  slug: "indian-ecnr",
  tabTitle: "Service Guide - Indian - ECNR",
  label: "Indian — ECNR",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} from India to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      icon: "doc",
      callouts: [{ tone: "documents", title: "Required Documents", items: PASSPORT_AND_PHOTO }],
      body: [
        "Once we receive the required documents, we will apply for {poss} visa. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    flightStage({
      sourceLabel: "02",
      duration: "3 Days",
      lead:
        "As soon as the entry visa is issued, we will share it with you and coordinate to " +
        "confirm your preferred travel date and arrange the flight booking.",
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in under **15 Business Days.**",
  },
};

/* ---------------------------- 9. Indian — Male ECR ------------------------ */

const INDIAN_MALE_ECR: GuideContent = {
  slug: "indian-male-ecr",
  tabTitle: "Service Guide - Indian - Male ECR",
  label: "Indian — Male ECR",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} from India to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      icon: "doc",
      callouts: [{ tone: "documents", title: "Required Documents", items: PASSPORT_AND_PHOTO }],
      body: [
        "Once we receive your {role}'s documents, we will apply for {poss} visa. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    {
      sourceLabel: "02",
      title: "Pre-Departure — Exit Approval",
      icon: "permit",
      body: [
        "Once your {role}'s visa is issued, we will apply for {poss} travel clearance and OK to " +
          "Board. This process typically takes 10 business days.",
      ],
    },
    flightStage({
      sourceLabel: "03",
      duration: "3 Days",
      lead:
        "Once the OK to Board is issued, we will contact you to confirm your preferred travel " +
        "date and arrange the flight booking.",
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in under **25 Business Days.**",
  },
};

/* --------------------------- 10. Indian — Female ECR ---------------------- */

const INDIAN_FEMALE_ECR: GuideContent = {
  slug: "indian-female-ecr",
  tabTitle: "Service Guide - Indian - Female ECR",
  label: "Indian — Female ECR",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} from India to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      icon: "doc",
      callouts: [
        {
          tone: "documents",
          title: "Required Documents",
          items: PASSPORT_AND_PHOTO,
          note:
            "**Note:** Please also make sure **AED 2,000** in cash is ready for your {role} to " +
            "carry with {obj}. {Subj}'ll need to present this to UAE immigration on arrival as " +
            "proof of funds.",
        },
      ],
      body: [
        "Once we receive the required documents, we will apply for {poss} entry visa. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    flightStage({
      sourceLabel: "02",
      duration: "3 Days",
      lead:
        "Once the tourist visa is issued, we will share it with you and coordinate to confirm " +
        "your preferred travel date and arrange the flight booking.",
    }),
    {
      sourceLabel: "03",
      title: "Post-Arrival",
      icon: "refresh",
      body: [
        "Upon your {role}'s arrival in the UAE, we will proceed with processing {poss} Change " +
          "of Status and 2-year residency visa.",
      ],
    },
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in under **15 Business Days.**",
  },
};

/* --------------------------------- 11. Kenyan ----------------------------- */

const KENYAN: GuideContent = {
  slug: "kenyan",
  tabTitle: "Service Guide - Kenyan",
  label: "Kenyan",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Good Conduct Certificate Issuance & Attestation – Kenya",
      duration: "15 Days",
      icon: "shield",
      body: [GCC_INTRO_MANDATORY],
      callouts: [
        gccDocuments(
          "We can obtain the Attested Good Conduct Certificate on your {role}'s behalf, free of " +
            "charge. This typically takes **15** days.",
        ),
      ],
    },
    {
      sourceLabel: "02",
      title: "Travel & Visa Processing",
      duration: "7 Days",
      icon: "doc",
      body: [
        "Once the Good Conduct Certificate is issued, we will initiate the visa application. " +
          "Visa processing typically takes up to 10 business days after the government accepts " +
          "the submitted documents.",
      ],
      docNote:
        'Heading says "(7 Days)" but the body says "up to 10 business days" — the two ' +
        "disagree in the source document.",
    },
    flightStage({
      sourceLabel: "02",
      duration: "3 Days",
      lead:
        "Once the entry visa is issued, we will share it with you and coordinate to confirm " +
        "your preferred travel date and arrange the flight booking.",
      docNote: 'The document numbers this stage "02" as well — a duplicate of Travel & Visa.',
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in **~ 25 business days.**",
  },
};

/* ------------------------------ 12. Cameroonian --------------------------- */

const CAMEROONIAN: GuideContent = {
  slug: "cameroonian",
  tabTitle: "Service Guide - Cameroonians",
  label: "Cameroonian",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Good Conduct Certificate Issuance & Attestation – Cameroon",
      duration: "25 Days",
      icon: "shield",
      body: [GCC_INTRO_MANDATORY],
      callouts: [
        gccDocuments(
          "We can obtain the Attested Good Conduct Certificate on your {role}'s behalf and have " +
            "it attested at the Ministry of Foreign Affairs & UAE Embassy in Nigeria, free of " +
            "charge. This typically takes **25** working days.",
        ),
      ],
      docNote:
        'Says the certificate is attested "in Nigeria" — for a Cameroonian file this is ' +
        "presumably meant to be Cameroon.",
    },
    {
      sourceLabel: "02",
      title: "Travel & Visa Processing",
      duration: "7 Days",
      icon: "doc",
      body: [
        "Once the Good Conduct Certificate is issued, we will initiate the visa application. " +
          "Visa processing typically takes up to 10 business days after the government accepts " +
          "the submitted documents.",
      ],
      docNote:
        'Heading says "(7 Days)" but the body says "up to 10 business days" — the two ' +
        "disagree in the source document.",
    },
    flightStage({
      sourceLabel: "02",
      duration: "3 Days",
      lead:
        "Once the entry visa is issued, we will share it with you and coordinate to confirm " +
        "your preferred travel date and arrange the flight booking.",
      docNote: 'The document numbers this stage "02" as well — a duplicate of Travel & Visa.',
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in **~ 35 business days.**",
  },
};

/* ---------------------------------- 13. Other ----------------------------- */

const OTHER: GuideContent = {
  slug: "other",
  tabTitle: "Service Guide - Other",
  label: "Other nationalities",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Travel & Visa Processing",
      icon: "doc",
      callouts: [
        { tone: "documents", title: "Required Documents", items: PASSPORT_AND_PHOTO },
        {
          tone: "info",
          title: "Please Note — Good Conduct Certificate",
          body: [
            "The **UAE immigration authorities** require a **Good Conduct Certificate** as part " +
              "of the visa process for nationals of the following countries: Afghanistan, " +
              "Algeria, Bhutan, Bulgaria, Cameroon, Cuba, Egypt, Ethiopia, Gambia, Ghana, Iraq, " +
              "Lebanon, Lithuania, Mexico, Morocco, Mozambique, Nepal, Pakistan, Senegal, " +
              "Somalia, Sri Lanka, Syria, and Tonga.",
            "The Good Conduct Certificate must be attested by the **Ministry of Foreign " +
              "Affairs** (MOFA) and the **UAE Embassy** in the country of issuance.",
          ],
        },
      ],
      body: [
        "Once we receive your {role}'s documents, we will apply for {poss} visa. " +
          VISA_7_BUSINESS_DAYS,
      ],
    },
    flightStage({
      sourceLabel: "02",
      duration: "3 Days",
      lead:
        "Once the entry visa is issued, we will share it with you and coordinate to confirm " +
        "your preferred travel date and arrange the flight booking.",
    }),
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, {subj} will arrive at your " +
      "doorstep in under **15 Business Days.**",
  },
};

/* ----------------------------- 14. Visa Only Package ---------------------- */

const VISA_ONLY: GuideContent = {
  slug: "visa-only",
  tabTitle: "Service Guide - Visa Only Package",
  label: "Visa Only Package",
  introDetail:
    "This document has been prepared to provide you with a clear understanding of each stage " +
    "involved in bringing your {role} to the UAE.",
  stages: [
    {
      sourceLabel: "01",
      title: "Visa Processing",
      icon: "doc",
      callouts: [
        { tone: "documents", title: "Required Documents", items: PASSPORT_AND_PHOTO },
        {
          tone: "info",
          title: "Please Note — Good Conduct Certificate",
          body: [
            "In some cases, UAE immigration may require a **Good Conduct Certificate** as part " +
              "of the visa process.",
            "If applicable, we will notify you and request it accordingly.",
          ],
        },
      ],
      body: [
        "Once we receive your {role}'s documents, we will apply for {poss} visa. Processing " +
          "typically takes 5–7 business days after approval.",
      ],
    },
    {
      sourceLabel: "02",
      title: "Flight Booking & Arrival",
      duration: "3 Days",
      icon: "plane",
      body: [
        "Once the entry visa is issued, we will share it with you so you can proceed with " +
          "flight booking.",
      ],
    },
  ],
  glance: {
    body:
      "From the moment your {role}'s documents are approved, the visa issuance will take **up " +
      "to 5 to 7 business days.**",
  },
};

/* ------------------------------- the registry ----------------------------- */

export const GUIDE_CONTENT: Record<ServiceGuide, GuideContent> = {
  "filipina-philippines": FILIPINA_PHILIPPINES,
  "ethiopian-in-ethiopia": ETHIOPIAN_IN_ETHIOPIA,
  "ethiopian-outside-ethiopia": ETHIOPIAN_OUTSIDE_ETHIOPIA,
  "sri-lankan-in-sri-lanka": SRI_LANKAN_IN_SRI_LANKA,
  ugandan: UGANDAN,
  "nepali-in-nepal": NEPALI_IN_NEPAL,
  "nepali-outside-nepal": NEPALI_OUTSIDE_NEPAL,
  "indian-ecnr": INDIAN_ECNR,
  "indian-male-ecr": INDIAN_MALE_ECR,
  "indian-female-ecr": INDIAN_FEMALE_ECR,
  kenyan: KENYAN,
  cameroonian: CAMEROONIAN,
  "visa-only": VISA_ONLY,
  other: OTHER,
};

export function contentFor(slug: ServiceGuide): GuideContent {
  return GUIDE_CONTENT[slug] ?? OTHER;
}

/** Every stage whose displayed number differs from the document's, plus every
    stage carrying a `docNote`. Rendered on /debug so the team can see exactly
    what needs fixing upstream; never shown on a client page. */
export function docNotesFor(slug: ServiceGuide): { stage: string; note: string }[] {
  const c = contentFor(slug);
  const out: { stage: string; note: string }[] = [];
  c.stages.forEach((s, i) => {
    const display = String(i + 1).padStart(2, "0");
    if (s.docNote) out.push({ stage: `${display} ${s.title}`, note: s.docNote });
    if (s.sourceLabel !== display) {
      out.push({
        stage: `${display} ${s.title}`,
        note: `Document prints this stage as "${s.sourceLabel}"; renumbered to "${display}" for display.`,
      });
    }
  });
  return out;
}
