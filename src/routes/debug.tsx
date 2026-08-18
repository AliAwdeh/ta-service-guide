import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { ServiceGuide as ServiceGuideView } from "../components/service-guide";
import { TokenGate } from "../components/token-gate";
import {
  EMIRATES,
  LOCATIONS,
  LOCATION_SPLIT_NATIONALITIES,
  NATIONALITIES,
  PACKAGES,
  PASSPORT_TYPES,
  SERVICE_GUIDES,
  parseGuideToken,
  resolveServiceGuide,
  type ApiPackage,
  type Emirate,
  type Gender,
  type MaidLocation,
  type Nationality,
  type PassportType,
  type ServiceGuide,
} from "../lib/guide-config";
import { DOC_ISSUES, contentFor, docNotesFor } from "../lib/guide-content";

export const Route = createFileRoute("/debug")({
  component: DebugPage,
});

/* ═══════════════════════════════════════════════════════════════════════════
   /debug — internal, token-gated. Three jobs:
     1. Preview any of the 14 guides instantly, without generating a link.
     2. Generate a real client link (POST /api/guides) and see exactly which
        guide the discriminators resolved to.
     3. Load an existing link and correct it in place (PATCH), so the client's
        link keeps working.
   It also surfaces the known defects in the source document for whichever guide
   is on screen — those notes never appear on a client page.
   ═══════════════════════════════════════════════════════════════════════════ */

type Mode = "resolve" | "pick";

type FormState = {
  clientId: string;
  contractId: string;
  ref: string;
  pkg: ApiPackage;
  nationality: Nationality;
  location: MaidLocation | "";
  passportType: PassportType | "";
  gender: Gender | "";
  role: string;
  emirate: Emirate | "";
  /** Used in "pick" mode: render this guide directly. */
  picked: ServiceGuide;
};

const INITIAL: FormState = {
  clientId: "1001",
  contractId: "",
  ref: "debug",
  pkg: "full",
  nationality: "filipino",
  location: "in-country",
  passportType: "",
  gender: "female",
  role: "maid",
  emirate: "dubai",
  picked: "filipina-philippines",
};

function DebugPage() {
  return (
    <TokenGate
      title="Service Guide · Debug"
      subtitle="Enter the API token to generate and preview guides."
    >
      {(token, clear) => <Debug token={token} clear={clear} />}
    </TokenGate>
  );
}

function Debug({ token, clear }: { token: string; clear: () => void }) {
  const [mode, setMode] = useState<Mode>("resolve");
  const [f, setF] = useState<FormState>(INITIAL);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [loadInput, setLoadInput] = useState("");
  const [loadedToken, setLoadedToken] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.style.backgroundColor = "#EEF3FB";
    document.body.style.backgroundColor = "#EEF3FB";
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  /* What the current form resolves to — the same function the API runs, so the
     preview cannot drift from what a generated link would show. */
  const resolved: ServiceGuide = useMemo(
    () =>
      mode === "pick"
        ? f.picked
        : resolveServiceGuide({
            pkg: f.pkg,
            nationality: f.nationality,
            location: f.location || null,
            passportType: f.passportType || null,
            gender: f.gender || null,
          }),
    [mode, f],
  );

  /* Which fields the API will insist on for the current nationality. Mirrors the
     refinements in GuideInputSchema so /debug fails the same way the API does. */
  const required = useMemo(() => {
    if (mode === "pick" || f.pkg === "visa-only") return [] as string[];
    const out: string[] = [];
    if (LOCATION_SPLIT_NATIONALITIES.includes(f.nationality) && !f.location) {
      out.push("MAID_LOCATION");
    }
    if (f.nationality === "indian") {
      if (!f.passportType) out.push("PASSPORT_TYPE");
      else if (f.passportType === "ECR" && !f.gender) out.push("GENDER");
    }
    return out;
  }, [mode, f]);

  const content = contentFor(resolved);
  /* Two sources of known defects: per-stage notes (plus display renumbering) and
     the guide-level DOC_ISSUES entries that aren't tied to one stage. Merge them
     so the panel count is the whole story. */
  const docNotes = useMemo(
    () => [
      ...DOC_ISSUES.filter((d) => d.guide === resolved).map((d) => ({
        stage: "This guide",
        note: d.issue,
      })),
      ...docNotesFor(resolved),
    ],
    [resolved],
  );

  /** The request body, built the way the maids.cc backend would build it. */
  const body = useMemo(() => {
    const b: Record<string, unknown> = { CLIENT_ID: f.clientId, ROLE: f.role };
    if (mode === "pick") {
      b.SERVICE_GUIDE = f.picked;
    } else {
      b.PACKAGE = f.pkg;
      b.NATIONALITY = f.nationality;
      if (f.location) b.MAID_LOCATION = f.location;
      if (f.passportType) b.PASSPORT_TYPE = f.passportType;
    }
    if (f.gender) b.GENDER = f.gender;
    if (f.emirate) b.EMIRATE = f.emirate;
    if (f.contractId) b.contract_id = f.contractId;
    if (f.ref) b.ref = f.ref;
    return b;
  }, [mode, f]);

  async function call(method: "POST" | "PATCH", payload: Record<string, unknown>) {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/guides", {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
      if (json?.url) setLink(json.url as string);
      if (json?.token) setLoadedToken(json.token as string);
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    const t = parseGuideToken(loadInput);
    if (!t) {
      setResult(`could not read a token from "${loadInput}"`);
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/guides?token=${encodeURIComponent(t)}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
      if (json?.ok && json.data) {
        const d = json.data as Record<string, string | null>;
        setLoadedToken(json.token as string);
        setLink(`/v/${json.token}`);
        setMode(d.explicitGuide ? "pick" : "resolve");
        setF((prev) => ({
          ...prev,
          clientId: String(json.clientId ?? prev.clientId),
          contractId: d.contractId ?? "",
          ref: d.ref ?? "",
          pkg: (d.pkg as ApiPackage) ?? "full",
          nationality: (d.nationality as Nationality) ?? "other",
          location: (d.maidLocation as MaidLocation) ?? "",
          passportType: (d.passportType as PassportType) ?? "",
          gender: (d.gender as Gender) ?? "",
          role: d.role ?? "maid",
          emirate: (d.emirate as Emirate) ?? "",
          picked: (d.serviceGuide as ServiceGuide) ?? prev.picked,
        }));
      }
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh bg-[#EEF3FB] font-sans text-[#111827]">
      <div className="mx-auto max-w-[1500px] px-4 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-extrabold">Service Guide · Debug</h1>
            <p className="text-[13px] text-[#6B7280]">
              Generate client links, correct existing ones, and preview all 14 guides.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/admin/admin"
              className="rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-[13px] font-bold text-[#4878BC]"
            >
              Analytics
            </a>
            <button
              onClick={clear}
              className="rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-[13px] font-bold text-[#6B7280]"
            >
              Lock
            </button>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[400px_1fr]">
          {/* ------------------------------- controls ------------------------------ */}
          <div className="space-y-4">
            <Panel title="How to choose the guide">
              <div className="flex gap-1 rounded-xl bg-[#EEF3FB] p-1">
                {(
                  [
                    ["resolve", "From client data"],
                    ["pick", "Pick directly"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-lg px-2 py-2 text-[12px] font-bold transition-colors ${
                      mode === m ? "bg-[#4878BC] text-white shadow" : "text-[#6B7280]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#6B7280]">
                {mode === "resolve"
                  ? "Send the ERP's own fields and let the API resolve the guide — this is what production does."
                  : "Pin a guide with SERVICE_GUIDE. It sticks even if the discriminators change later."}
              </p>
            </Panel>

            {mode === "pick" ? (
              <Panel title="Guide">
                <Select
                  label="SERVICE_GUIDE"
                  value={f.picked}
                  options={SERVICE_GUIDES.map((s) => [s, contentFor(s).label])}
                  onChange={(v) => set("picked", v as ServiceGuide)}
                />
              </Panel>
            ) : (
              <Panel title="Client data">
                <Select
                  label="PACKAGE"
                  value={f.pkg}
                  options={PACKAGES.map((p) => [
                    p,
                    p === "visa-only" ? "Visa only" : "Full service",
                  ])}
                  onChange={(v) => set("pkg", v as ApiPackage)}
                />
                <Select
                  label="NATIONALITY"
                  value={f.nationality}
                  options={NATIONALITIES.map((n) => [n, n])}
                  onChange={(v) => set("nationality", v as Nationality)}
                  disabled={f.pkg === "visa-only"}
                />
                <Select
                  label="MAID_LOCATION"
                  value={f.location}
                  options={[
                    ["", "— not stated —"],
                    ...LOCATIONS.map((l) => [l, l] as [string, string]),
                  ]}
                  onChange={(v) => set("location", v as MaidLocation | "")}
                  disabled={f.pkg === "visa-only"}
                  warn={required.includes("MAID_LOCATION")}
                />
                <Select
                  label="PASSPORT_TYPE"
                  value={f.passportType}
                  options={[
                    ["", "— not stated —"],
                    ...PASSPORT_TYPES.map((p) => [p, p] as [string, string]),
                  ]}
                  onChange={(v) => set("passportType", v as PassportType | "")}
                  disabled={f.pkg === "visa-only" || f.nationality !== "indian"}
                  warn={required.includes("PASSPORT_TYPE")}
                />
              </Panel>
            )}

            <Panel title="Wording">
              <Field label="ROLE" value={f.role} onChange={(v) => set("role", v)} />
              <Select
                label="GENDER"
                value={f.gender}
                options={[
                  ["", "— not stated (she/her) —"],
                  ["female", "female"],
                  ["male", "male"],
                ]}
                onChange={(v) => set("gender", v as Gender | "")}
                warn={required.includes("GENDER")}
              />
              <Select
                label="EMIRATE"
                value={f.emirate}
                options={[
                  ["", "— not stated (shows both fees) —"],
                  ...EMIRATES.map((e) => [e, e] as [string, string]),
                ]}
                onChange={(v) => set("emirate", v as Emirate | "")}
              />
              <p className="mt-1 text-[11px] leading-relaxed text-[#6B7280]">
                EMIRATE only affects the Filipina guide (private entry permit fee + the AED 2,000
                deposit refund, which is Dubai-only).
              </p>
            </Panel>

            <Panel title="Identifiers">
              <Field label="CLIENT_ID" value={f.clientId} onChange={(v) => set("clientId", v)} />
              <Field
                label="contract_id"
                value={f.contractId}
                onChange={(v) => set("contractId", v)}
              />
              <Field label="ref" value={f.ref} onChange={(v) => set("ref", v)} />
            </Panel>

            <Panel title="Resolves to">
              <p className="text-[15px] font-extrabold text-[#4878BC]">{content.label}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[#6B7280]">{resolved}</p>
              <p className="mt-1 text-[11px] text-[#6B7280] italic">
                Document tab: {content.tabTitle}
              </p>
              {required.length > 0 ? (
                <p className="mt-2.5 rounded-lg bg-[#FFF1F1] px-3 py-2 text-[12px] leading-relaxed font-semibold text-[#B42318]">
                  The API will reject this: {required.join(", ")} still needed. Until then the
                  preview falls back to the generic guide.
                </p>
              ) : null}

              <div className="mt-3 space-y-2">
                <button
                  disabled={busy || required.length > 0}
                  onClick={() => call("POST", body)}
                  className="w-full rounded-xl bg-[#4878BC] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
                >
                  {busy ? "Working…" : "Generate a new link"}
                </button>
                <button
                  disabled={busy || !loadedToken || required.length > 0}
                  onClick={() => call("PATCH", { ...body, token: loadedToken })}
                  className="w-full rounded-xl border border-[#4878BC] bg-white px-3 py-2.5 text-[13px] font-bold text-[#4878BC] disabled:opacity-40"
                >
                  Update {loadedToken ? loadedToken : "the loaded link"} in place
                </button>
              </div>

              {link ? (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2.5 block truncate rounded-lg bg-[#EEF3FB] px-3 py-2 font-mono text-[12px] text-[#4878BC] underline"
                >
                  {link}
                </a>
              ) : null}
            </Panel>

            <Panel title="Load an existing link">
              <div className="flex gap-2">
                <input
                  value={loadInput}
                  onChange={(e) => setLoadInput(e.target.value)}
                  placeholder="paste a /v/ link or token"
                  className="min-w-0 flex-1 rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#4878BC]"
                />
                <button
                  onClick={load}
                  disabled={busy}
                  className="shrink-0 rounded-xl bg-[#4878BC] px-3 py-2 text-[13px] font-bold text-white disabled:opacity-40"
                >
                  Load
                </button>
              </div>
            </Panel>

            {docNotes.length > 0 ? (
              <Panel title={`Source document notes (${docNotes.length})`} tone="warn">
                <p className="text-[12px] leading-relaxed text-[#92400E]">
                  Defects in the source document for this guide. Transcribed as-is rather than
                  silently corrected. Never shown to clients.
                </p>
                <ul className="mt-2.5 space-y-2">
                  {docNotes.map((n, i) => (
                    <li key={i} className="rounded-lg bg-white/70 px-3 py-2">
                      <p className="text-[11px] font-bold text-[#92400E]">{n.stage}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[#78350F]">{n.note}</p>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}

            <Panel title="Request body">
              <pre className="overflow-x-auto rounded-lg bg-[#111827] p-3 font-mono text-[11px] leading-relaxed text-[#E5E7EB]">
                {JSON.stringify(body, null, 2)}
              </pre>
            </Panel>

            {result ? (
              <Panel title="API response">
                <pre className="max-h-72 overflow-auto rounded-lg bg-[#111827] p-3 font-mono text-[11px] leading-relaxed text-[#E5E7EB]">
                  {result}
                </pre>
              </Panel>
            ) : null}
          </div>

          {/* ------------------------------- preview ------------------------------- */}
          <div className="min-w-0">
            <div className="overflow-hidden rounded-3xl border border-[#B9CCE6]/70 bg-white shadow-lg">
              <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] px-4 py-2.5">
                <span className="text-[12px] font-bold text-[#6B7280]">Live preview</span>
                <span className="font-mono text-[11px] text-[#6B7280]">{resolved}</span>
              </div>
              {/* key forces a clean remount so the scroll-spy observer re-attaches
                  when the variant changes. */}
              <div className="max-h-[80vh] overflow-y-auto">
                <ServiceGuideView
                  key={`${resolved}-${f.role}-${f.gender}-${f.emirate}`}
                  config={{
                    serviceGuide: resolved,
                    role: f.role || "maid",
                    gender: f.gender || "female",
                    emirate: f.emirate || null,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- form bits -------------------------------- */

function Panel({
  title,
  children,
  tone = "plain",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "plain" | "warn";
}) {
  return (
    <section
      className={`rounded-2xl border p-4 ${
        tone === "warn" ? "border-[#F6891E]/40 bg-[#FFFBEB]" : "border-[#B9CCE6]/70 bg-white"
      }`}
    >
      <h2 className="text-[13px] font-extrabold tracking-wide text-[#111827] uppercase">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[11px] font-bold text-[#6B7280]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#4878BC]"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
  disabled,
  warn,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (v: string) => void;
  disabled?: boolean;
  warn?: boolean;
}) {
  return (
    <label className={`block ${disabled ? "opacity-40" : ""}`}>
      <span className="font-mono text-[11px] font-bold text-[#6B7280]">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none focus:border-[#4878BC] ${
          warn ? "border-[#B42318] ring-1 ring-[#B42318]/30" : "border-[#B9CCE6]"
        }`}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
