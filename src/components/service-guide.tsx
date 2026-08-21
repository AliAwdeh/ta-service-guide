import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  ENTRY_PERMIT_FEES,
  aed,
  entryPermitFeeFor,
  fill,
  hasDepositRefund,
  makeTerms,
  type Emirate,
  type Terms,
  type VariantConfig,
} from "../lib/guide-config";
import {
  GUARANTEE,
  INTRO_LEAD,
  OUTRO,
  contentFor,
  type Bullet,
  type Callout,
  type IconName,
  type Stage,
} from "../lib/guide-content";

/* ═══════════════════════════════════════════════════════════════════════════
   SERVICE GUIDE — shared, variant-driven component
   ─────────────────────────────────────────────────────────────────────────
   Renders any of the 14 service guides. Everything it draws comes from two
   places and nothing else:

     • lib/guide-content.ts — the stages, callouts and copy for each guide
     • VariantConfig        — which guide, plus role/gender (pronouns) and the
                              sponsor's emirate (the Filipina entry permit fee)

   So a wording change is a content edit, and a new guide is a new content
   entry — neither touches this file.

   Design system carried over from maid-visa-guide so a client who receives both
   documents sees one brand:
     blue #4878BC · orange #F6891E · green #15B886 / #0A7C5A
     dark #111827 · gray #6B7280 / #374151 · wash #EEF3FB · #B9CCE6 / #E5E7EB
   Mobile-first, system sans, no webfont — these open inside WhatsApp's in-app
   browser on mobile data.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ---------------------------------- icons --------------------------------- */

type IconProps = { className?: string };

function Icon({ children, className }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IcShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);
const IcDoc = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="m9 15 2 2 4-4" />
  </Icon>
);
/* Symmetric top-down airliner. Written out as explicit geometry rather than
   copied from an icon set: nose at the top, wings sweeping back from the
   mid-fuselage, tailplanes at the bottom. Stays readable at 20px. */
const IcPlane = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.5 13.2 6.5v3.5l8.3 5v1.8l-8.3-2.6v4.3l2.6 2.3V22L12 21l-3.8 1v-1.2l2.6-2.3v-4.3L2.5 16.8V15l8.3-5V6.5Z" />
  </Icon>
);
const IcClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
const IcTraining = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 2 8l10 5 10-5-10-5Z" />
    <path d="M6 10.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-6.5" />
  </Icon>
);
const IcStamp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 21h14" />
    <path d="M6 18h12v-2a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2Z" />
    <path d="M10 14V9a2 2 0 0 1 4 0v5" />
  </Icon>
);
const IcPermit = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <circle cx="8" cy="12" r="2.5" />
    <path d="M14 10h4M14 14h4" />
  </Icon>
);
const IcRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </Icon>
);
const IcCheck = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Icon>
);
const IcMoney = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 12h.01M18 12h.01" />
  </Icon>
);
/* Required-documents boxes — a clipboard, so it never collides with the
   document-shaped icon a "Travel & Visa Processing" stage uses. */
const IcClipboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M8 11h8M8 15h5" />
  </Icon>
);
/* "Please note" asides. */
const IcInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </Icon>
);
/* Something the client must act on or remember. */
const IcAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.3 3.3 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Icon>
);
/* Process breakdowns — a stack of steps with their durations. */
const IcList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);
/* A government officer visiting in person (Sri Lanka development office). */
const IcOfficer = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 21a6.5 6.5 0 0 1 13 0" />
    <path d="m16.5 12.5 1.8 1.8 3.2-3.4" />
  </Icon>
);
/* Biometrics at an embassy. */
const IcFingerprint = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
    <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
    <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
    <path d="M2 12a10 10 0 0 1 18-6" />
    <path d="M2 16h.01" />
    <path d="M21.8 16c.2-2 .131-5.354 0-6" />
    <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
    <path d="M8.65 22c.21-.66.45-1.32.57-2" />
    <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
  </Icon>
);
/* Hardcopy documents going out by courier. */
const IcSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 11.5 21 3l-8.5 18-2.5-7-6.5-2.5Z" />
    <path d="M21 3l-10.5 10.5" />
  </Icon>
);
/* An issued certificate. */
const IcCertificate = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 14-1.5 7 5-3 5 3-1.5-7" />
    <path d="m10 9 1.5 1.5L15 7" />
  </Icon>
);

const ICONS: Record<IconName, (p: IconProps) => ReactNode> = {
  shield: IcShield,
  doc: IcDoc,
  plane: IcPlane,
  clock: IcClock,
  training: IcTraining,
  stamp: IcStamp,
  permit: IcPermit,
  refresh: IcRefresh,
  check: IcCheck,
  money: IcMoney,
  clipboard: IcClipboard,
  info: IcInfo,
  alert: IcAlert,
  list: IcList,
  officer: IcOfficer,
  fingerprint: IcFingerprint,
  send: IcSend,
  certificate: IcCertificate,
};

/* ------------------------------- rich text -------------------------------- */

/**
 * Interpolate {placeholders} from the terms vocabulary, then render the two bits
 * of markup the content uses: `**bold**` and `[label](url)` links. Split on the
 * delimiters rather than pulling in a markdown parser — the content is ours, so
 * the grammar is known and closed.
 */
const RICH_TOKEN = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

function Rich({ text, t }: { text: string; t: Terms }) {
  const parts = fill(text, t).split(RICH_TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-bold text-[#111827]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <a
              key={i}
              href={link[2]}
              target="_blank"
              rel="noreferrer noopener"
              className="font-bold text-[#4878BC] underline decoration-[#B9CCE6] underline-offset-2"
            >
              {link[1]}
            </a>
          );
        }
        return part;
      })}
    </>
  );
}

/* ------------------------------- primitives ------------------------------- */

/** Numbered circle on the process timeline. Colors alternate blue/orange. */
function StageBadge({ n, icon, color }: { n: number; icon: IconName; color: "blue" | "orange" }) {
  const I = ICONS[icon] ?? IcDoc;
  const bg = color === "orange" ? "bg-[#F6891E]" : "bg-[#4878BC]";
  return (
    <div className="relative z-10 shrink-0">
      <div
        className={`${bg} flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md ring-4 ring-white`}
      >
        <I className="h-5 w-5" />
      </div>
      <div className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[#B9CCE6] bg-white text-[11px] font-bold text-[#4878BC]">
        {n}
      </div>
    </div>
  );
}

/** A timeline row carrying its own connector, hidden on the last row so the
    line ends cleanly at the final bubble instead of trailing past it. */
function TimelineRow({
  badge,
  last,
  children,
}: {
  badge: ReactNode;
  last: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center self-stretch">
        {badge}
        {last ? null : <div className="mt-1 w-0.5 flex-1 rounded bg-[#4878BC]/45" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "pb-0" : "pb-10"}`}>{children}</div>
    </div>
  );
}

/**
 * A duration marker, and the one place any duration is styled — stage headings,
 * process-breakdown rows and timeline steps all use it, so every duration on the
 * page looks and sits the same.
 *
 * PLACEMENT: a right float, emitted as the LAST child of its label. That single
 * choice gets both things we want, which neither inline flow nor flexbox manages
 * on its own:
 *   • A label that wrapped leaves empty space on its last line — often most of
 *     the line — and the float settles into it, hard against the right edge. No
 *     extra vertical space at all.
 *   • When the last line has no room, the float drops to its own line and STAYS
 *     right-aligned, instead of stranding itself on the left the way inline flow
 *     would.
 * Flexbox can do neither, because it treats the whole wrapped label as one
 * atomic box and cannot see the free space inside it.
 *
 * The label needs `flow-root` (see DURATION_HOST) so it contains the float.
 */
function DurationChip({ value, t }: { value: string; t?: Terms }) {
  return (
    <span className="float-right mt-[3px] ml-2 inline-flex items-center gap-[3px] rounded-full bg-[#EEF3FB] px-1.5 py-[2px] text-[10px] leading-none font-bold whitespace-nowrap text-[#4878BC]">
      <IcClock className="h-2.5 w-2.5 shrink-0" />
      {t ? <Rich text={value} t={t} /> : value}
    </span>
  );
}

/** Any element hosting a DurationChip must establish a block formatting context,
    or it won't grow to contain the float on the line-drop path. */
const DURATION_HOST = "flow-root";

/** Each major part of the page is its own card so they read as separate sections. */
function SectionCard({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-3xl border border-[#B9CCE6]/70 bg-white p-4 shadow-[0_10px_30px_-18px_rgba(72,120,188,0.45)] sm:p-7"
    >
      <h2 className="text-[24px] font-extrabold text-[#4878BC]">{title}</h2>
      {children}
    </section>
  );
}

/* Justified only from sm up. These paragraphs are long and the phone column is
   ~330px wide, where justification opens rivers between words; left-aligned
   stays readable there and the editorial feel is kept on wider screens. */
function Paragraph({ text, t }: { text: string; t: Terms }) {
  return (
    <p className="mt-2 text-[15px] leading-relaxed sm:text-justify text-[#374151]">
      <Rich text={text} t={t} />
    </p>
  );
}

/** Bulleted or numbered. The source document numbers its document checklists —
    which matters, because a client on the phone to an agent reads item numbers
    back — so those render as an <ol> with the numbers shown. */
function BulletList({
  items,
  t,
  ordered = false,
}: {
  items: (string | Bullet)[];
  t: Terms;
  ordered?: boolean;
}) {
  const List = ordered ? "ol" : "ul";
  return (
    <List className="mt-2.5 space-y-2">
      {items.map((raw, i) => {
        const item: Bullet = typeof raw === "string" ? { text: raw } : raw;
        return (
          <li key={i} className="flex gap-2.5">
            {ordered ? (
              <span className="mt-[1px] w-[1.15rem] shrink-0 text-[14px] font-bold text-[#4878BC] tabular-nums">
                {i + 1}.
              </span>
            ) : (
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#4878BC]" />
            )}
            <div className="min-w-0 flex-1">
              <span className="text-[15px] leading-relaxed text-[#374151]">
                <Rich text={item.text} t={t} />
              </span>
              {item.sub?.length ? (
                <ul className="mt-1.5 space-y-1">
                  {item.sub.map((s, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-[#6B7280]" />
                      <span className="text-[14px] leading-relaxed text-[#6B7280]">
                        <Rich text={s} t={t} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </List>
  );
}

/* -------------------------------- callouts -------------------------------- */

/* Per-tone visual treatment and the FALLBACK icon. A callout can override the
   icon (Callout.icon) and its footnote icon (Callout.noteIcon) — worth doing
   whenever the default would repeat the icon of the stage it sits under, since
   two identical glyphs stacked on top of each other read as a rendering bug. */
const CALLOUT_STYLE: Record<Callout["tone"], { box: string; chip: string; icon: IconName }> = {
  documents: {
    box: "border-[#B9CCE6] bg-[#EEF3FB]",
    chip: "bg-[#4878BC]",
    icon: "clipboard",
  },
  info: {
    box: "border-[#F6891E]/40 bg-[#FFF6EC]",
    chip: "bg-[#F6891E]",
    icon: "info",
  },
  breakdown: {
    box: "border-[#B9CCE6] bg-white",
    chip: "bg-[#4878BC]",
    icon: "list",
  },
  timeline: {
    box: "border-[#B9CCE6] bg-white",
    chip: "bg-[#4878BC]",
    icon: "clock",
  },
};

function CalloutBox({ callout, t }: { callout: Callout; t: Terms }) {
  const style = CALLOUT_STYLE[callout.tone];
  const I = ICONS[callout.icon ?? style.icon] ?? IcClipboard;
  const NoteIcon = ICONS[callout.noteIcon ?? "alert"] ?? IcAlert;
  return (
    <div className={`mt-3.5 overflow-hidden rounded-xl border ${style.box}`}>
      {callout.title ? (
        <div className="flex items-start gap-2.5 px-3.5 pt-3.5 sm:px-4">
          <span
            className={`${style.chip} flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white`}
          >
            <I className="h-3.5 w-3.5" />
          </span>
          <h4 className="mt-0.5 text-[14px] leading-snug font-bold text-[#111827]">
            <Rich text={callout.title} t={t} />
          </h4>
        </div>
      ) : null}
      <div className="px-3.5 pt-1 pb-3.5 sm:px-4">
        {callout.body?.map((p, i) => (
          <p
            key={i}
            className={`text-[14px] leading-relaxed sm:text-justify text-[#374151] ${i === 0 && !callout.title ? "" : "mt-2"}`}
          >
            <Rich text={p} t={t} />
          </p>
        ))}

        {callout.items?.length ? (
          <BulletList items={callout.items} t={t} ordered={callout.ordered} />
        ) : null}

        {callout.rows?.length ? (
          callout.tone === "timeline" ? (
            <CalloutTimeline rows={callout.rows} t={t} />
          ) : (
            <div className="mt-2.5 overflow-hidden rounded-lg bg-white ring-1 ring-[#B9CCE6]/70">
              {callout.rows.map((row, i) => (
                <p
                  key={i}
                  className={`${DURATION_HOST} px-3 py-2.5 text-[13px] leading-relaxed font-semibold text-[#374151] ${
                    i === 0 ? "" : "border-t border-[#B9CCE6]/50"
                  }`}
                >
                  <Rich text={row.label} t={t} />
                  {row.value ? <DurationChip value={row.value} t={t} /> : null}
                </p>
              ))}
            </div>
          )
        ) : null}

        {callout.note ? (
          <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-white px-3 py-2.5 text-[13px] leading-relaxed font-semibold text-[#111827] ring-1 ring-[#B9CCE6]/60">
            <NoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#F6891E]" />
            <span className="sm:text-justify">
              <Rich text={callout.note} t={t} />
            </span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A callout's rows drawn as a numbered vertical timeline instead of a table —
 * for sequences where the ORDER is the point (each step only starts once the
 * previous one is done), not just a list of durations.
 */
function CalloutTimeline({ rows, t }: { rows: { label: string; value?: string }[]; t: Terms }) {
  return (
    <ol className="mt-3">
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center self-stretch">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#4878BC] text-[11px] font-bold text-white ring-2 ring-white">
                {i + 1}
              </span>
              {last ? null : <div className="my-1 w-0.5 flex-1 rounded bg-[#4878BC]/35" />}
            </div>
            <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
              <p
                className={`${DURATION_HOST} text-[13px] leading-relaxed font-semibold text-[#374151]`}
              >
                <Rich text={row.label} t={t} />
                {row.value ? <DurationChip value={row.value} t={t} /> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------- private entry permit fees ---------------------- */

/**
 * The Filipina entry permit fee. When the sponsor's emirate is known, that
 * option is marked as theirs; when it isn't, both are shown side by side
 * exactly as the source document lists them — never a guessed amount.
 */
function FeeBlock({ emirate }: { emirate: Emirate | null }) {
  const resolved = entryPermitFeeFor(emirate);
  const isDubai = resolved?.emirate === "dubai";
  const known = resolved != null;

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <FeeCard
        title="Dubai-issued Emirates ID"
        total={ENTRY_PERMIT_FEES.dubai.total}
        active={known && isDubai}
        rows={[
          {
            label: "Refundable security deposit",
            value: aed(ENTRY_PERMIT_FEES.dubai.deposit),
            hint: "refunded after your {role} arrives in the UAE",
          },
          {
            label: "Non-refundable government fees",
            value: aed(ENTRY_PERMIT_FEES.dubai.government),
          },
        ]}
      />
      <FeeCard
        title="All other emirates"
        total={ENTRY_PERMIT_FEES.other.total}
        active={known && !isDubai}
        rows={[
          {
            label: "Non-refundable government fees",
            value: aed(ENTRY_PERMIT_FEES.other.government),
          },
        ]}
      />
    </div>
  );
}

function FeeCard({
  title,
  total,
  rows,
  active,
}: {
  title: string;
  total: number;
  rows: { label: string; value: string; hint?: string }[];
  active: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${
        active
          ? "border-[#4878BC] bg-[#EEF3FB] ring-2 ring-[#4878BC]/30"
          : "border-[#E5E7EB] bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[13px] leading-snug font-bold text-[#111827]">{title}</h4>
        {active ? (
          <span className="shrink-0 rounded-full bg-[#4878BC] px-2 py-0.5 text-[10px] font-bold text-white">
            Your file
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[22px] font-extrabold text-[#4878BC]">{aed(total)}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="text-[#6B7280]">{r.label}</span>
            <span className="font-bold whitespace-nowrap text-[#374151]">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------- a stage -------------------------------- */

function StageBody({ stage, t, emirate }: { stage: Stage; t: Terms; emirate: Emirate | null }) {
  const showDeposit = hasDepositRefund(emirate);
  const visible = (list: typeof stage.callouts) =>
    (list ?? []).filter((c) => !c.onlyWithDeposit || showDeposit);
  const midCallouts = visible(stage.midCallouts);
  const callouts = visible(stage.callouts);

  return (
    <div className="pt-2.5">
      <h3 className={`${DURATION_HOST} text-[18px] leading-snug font-bold text-[#111827]`}>
        <Rich text={stage.title} t={t} />
        {stage.duration ? <DurationChip value={stage.duration} /> : null}
      </h3>

      {stage.body?.map((p, i) => (
        <Paragraph key={i} text={p} t={t} />
      ))}
      {stage.bullets?.length ? (
        <BulletList items={stage.bullets} t={t} ordered={stage.bulletsOrdered} />
      ) : null}
      {midCallouts.map((c, i) => (
        <CalloutBox key={i} callout={c} t={t} />
      ))}
      {stage.bodyAfter?.map((p, i) => (
        <Paragraph key={i} text={p} t={t} />
      ))}
      {callouts.map((c, i) => (
        <CalloutBox key={i} callout={c} t={t} />
      ))}

      {stage.subsections?.map((sub, i) => (
        <div key={i} className="mt-5 border-t border-[#E5E7EB] pt-4">
          <h4 className="text-[15px] font-extrabold text-[#F6891E]">
            <Rich text={sub.title} t={t} />
          </h4>
          {sub.body?.map((p, j) => (
            <Paragraph key={j} text={p} t={t} />
          ))}
          {sub.feeBlock ? <FeeBlock emirate={emirate} /> : null}
          {sub.callouts?.map((c, j) => (
            <CalloutBox key={j} callout={c} t={t} />
          ))}
        </div>
      ))}

      {stage.parallel ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-[#EAF7F1] px-3 py-2.5 text-[13px] leading-relaxed font-semibold text-[#0A7C5A]">
          <IcRefresh className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="sm:text-justify">
            <Rich text={stage.parallel} t={t} />
          </span>
        </p>
      ) : null}
    </div>
  );
}

/* --------------------------------- the page ------------------------------- */

const SECTIONS = [
  { id: "process", label: "The Process" },
  { id: "timeline", label: "Timeline" },
  { id: "guarantee", label: "Guarantee" },
] as const;

export function ServiceGuide({ config }: { config: VariantConfig }) {
  const content = useMemo(() => contentFor(config.serviceGuide), [config.serviceGuide]);
  const t = useMemo(() => makeTerms(config.role, config.gender), [config.role, config.gender]);
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  /* keep the wash color under overscroll */
  useEffect(() => {
    document.documentElement.style.backgroundColor = "#EEF3FB";
    document.body.style.backgroundColor = "#EEF3FB";
  }, []);

  /* scroll-spy for the sticky nav. No run-once ref guard: the effect must
     re-attach whenever it is cleaned up and re-run (variant `key` remounts,
     HMR) — a ref surviving that cycle would leave the nav with no observer. */
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    }
    const firstId = SECTIONS[0].id;
    const lastId = SECTIONS[SECTIONS.length - 1].id;
    const onScroll = () => {
      const nearBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
      if (nearBottom) setActive(lastId);
      /* above the first section nothing intersects the observer band, which
         would otherwise leave a stale highlight after scrolling back up */
      const first = document.getElementById(firstId);
      if (first && first.getBoundingClientRect().top > window.innerHeight * 0.4) {
        setActive(firstId);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#EEF3FB] font-sans text-[#111827] antialiased">
      {/* hero — maids.cc logo + title + which guide this is */}
      <header className="bg-white px-5 pt-8 pb-14 shadow-sm">
        <div className="mx-auto max-w-xl">
          <img
            src="/assets/maids-logo.png"
            alt="maids.cc"
            className="h-10 w-auto"
            width={247}
            height={83}
          />
          <h1 className="mt-4 text-[32px] leading-tight font-extrabold text-[#111827]">
            Your {t.Role} <span className="text-[#4878BC]">Service Guide</span>
          </h1>
          <p className="mt-2.5 inline-block rounded-full bg-[#EEF3FB] px-3 py-1 text-[12px] font-bold text-[#4878BC]">
            {content.label}
          </p>
        </div>
      </header>

      {/* sticky nav — 3 sections, so full labels always fit on a phone */}
      <nav className="sticky top-0 z-20 -mt-7 px-4">
        <div className="mx-auto flex max-w-xl gap-1 rounded-2xl border border-[#B9CCE6]/70 bg-white p-1.5 shadow-lg">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(s.id)}
              className={`flex-auto rounded-xl px-2 py-2.5 text-[12px] font-bold whitespace-nowrap transition-colors duration-200 sm:text-[13px] ${
                active === s.id
                  ? "bg-[#4878BC] text-white shadow"
                  : "text-[#6B7280] hover:bg-[#EEF3FB]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-xl space-y-8 px-3 pt-10 pb-12 sm:px-5">
        {/* opening note — the document's centered italic preamble */}
        <div className="text-center">
          <div className="mx-auto h-px w-12 bg-[#B9CCE6]" />
          <p className="mt-4 text-[15px] leading-relaxed font-semibold text-[#374151] italic">
            {INTRO_LEAD}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#6B7280] italic">
            <Rich text={content.introDetail} t={t} />
          </p>
        </div>

        {/* ------------------------------ the process ------------------------------ */}
        <SectionCard id="process" title="The Process">
          <div className="mt-7">
            {content.stages.map((stage, i) => (
              <TimelineRow
                key={`${stage.sourceLabel}-${stage.title}`}
                last={i === content.stages.length - 1}
                badge={
                  <StageBadge n={i + 1} icon={stage.icon} color={i % 2 === 0 ? "blue" : "orange"} />
                }
              >
                <StageBody stage={stage} t={t} emirate={config.emirate} />
              </TimelineRow>
            ))}
          </div>
        </SectionCard>

        {/* ---------------------------- timeline at a glance ---------------------- */}
        <SectionCard id="timeline" title="Your Timeline at a Glance">
          {content.glance ? (
            <div className="mt-5 rounded-2xl bg-[#EEF3FB] p-5 text-center ring-1 ring-[#B9CCE6]">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#4878BC] text-white">
                <IcClock className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[16px] leading-relaxed font-semibold text-[#111827]">
                <Rich text={content.glance.body} t={t} />
              </p>
              {content.glance.note ? (
                <p className="mt-2.5 text-[13px] leading-relaxed text-[#6B7280] italic">
                  <Rich text={content.glance.note} t={t} />
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-[15px] text-[#6B7280]">
              Your dedicated team will confirm the expected timeline with you directly.
            </p>
          )}
        </SectionCard>

        {/* -------------------------------- guarantee ---------------------------- */}
        <SectionCard id="guarantee" title={GUARANTEE.title}>
          <div className="mt-5 rounded-2xl bg-[#EAF7F1] p-5 ring-1 ring-[#15B886]/35">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#15B886] text-white">
              <IcShield className="h-5 w-5" />
            </span>
            {GUARANTEE.body.map((p, i) => (
              <p
                key={i}
                className="mt-3 text-[15px] leading-relaxed sm:text-justify font-semibold text-[#0A7C5A]"
              >
                <Rich text={p} t={t} />
              </p>
            ))}
          </div>
        </SectionCard>

        {/* closing note */}
        <div className="text-center">
          <div className="mx-auto h-px w-12 bg-[#B9CCE6]" />
          <p className="mt-4 text-[15px] leading-relaxed text-[#6B7280] italic">{OUTRO}</p>
          <img
            src="/assets/maids-logo.png"
            alt="maids.cc"
            className="mx-auto mt-6 h-7 w-auto opacity-60"
            width={247}
            height={83}
          />
        </div>
      </main>
    </div>
  );
}
