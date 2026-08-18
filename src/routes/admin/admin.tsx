import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useState } from "react";

import { TokenGate } from "../../components/token-gate";
import { parseGuideToken } from "../../lib/guide-config";

export const Route = createFileRoute("/admin/admin")({
  component: AdminPage,
});

/* ─────────────────────────────────────────────────────────────────────────
   /admin/admin — internal, token-gated visitor analytics for the generated
   guides. Everything is logged server-side per visit: Dubai time, IP, device,
   dwell, scroll depth, sections viewed.
   ───────────────────────────────────────────────────────────────────────── */

type GuideRow = {
  token: string;
  clientId: string;
  contractId: string | null;
  /** Which of the 14 guides this link renders. */
  serviceGuide: string;
  /** Non-null when the caller pinned the guide with SERVICE_GUIDE rather than
      letting the discriminators resolve it. */
  explicitGuide: string | null;
  pkg: string;
  nationality: string;
  maidLocation: string | null;
  passportType: string | null;
  gender: string | null;
  role: string;
  emirate: string | null;
  ref: string | null;
  createdAt: string;
  createdAtDubai: string;
  visitCount: number;
  lastVisitDubai: string | null;
};

type VisitRow = {
  id: number;
  guideToken: string | null;
  clientId: string | null;
  contractId: string | null;
  serviceGuide: string | null;
  sessionId: string;
  path: string | null;
  ip: string | null;
  country: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  userAgent: string | null;
  referrer: string | null;
  language: string | null;
  screen: string | null;
  timezone: string | null;
  startedAtDubai: string;
  lastSeenDubai: string;
  dwellMs: number;
  maxScrollPct: number;
  sectionsViewed: string[];
  visitorId: string | null;
  live: boolean;
  status: "live" | "closed";
  visitorSessionCount: number;
  secondsSinceLastSeen: number;
};

type Feed = { ok: true; guides: GuideRow[]; visits: VisitRow[] };

function fmtDwell(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/** The inputs the guide was resolved from — so a row explains itself without
    having to re-run the resolver by hand. */
function inputSummary(g: GuideRow): string {
  if (g.explicitGuide) return "pinned via SERVICE_GUIDE";
  const parts: string[] = [];
  if (g.pkg === "visa-only") return "visa-only package";
  parts.push(g.nationality);
  if (g.maidLocation) parts.push(g.maidLocation);
  if (g.passportType) parts.push(g.passportType);
  if (g.gender) parts.push(g.gender);
  return parts.join(" · ");
}

/** Role + emirate — the two things that change wording inside a guide. */
function wordingSummary(g: GuideRow): string {
  const parts = [g.role];
  if (g.emirate) parts.push(g.emirate);
  return parts.join(" · ");
}

/** "AE" → "🇦🇪 AE"; null → "—" */
function flag(code: string | null): string {
  if (!code || code.length !== 2) return code || "—";
  const base = 0x1f1e6;
  const emoji = String.fromCodePoint(
    base + (code.charCodeAt(0) - 65),
    base + (code.charCodeAt(1) - 65),
  );
  return `${emoji} ${code}`;
}

/** Distinct, sorted, non-null values of a visit field — for filter dropdowns. */
function distinct(visits: VisitRow[], pick: (v: VisitRow) => string | null): string[] {
  return [...new Set(visits.map(pick).filter((x): x is string => !!x))].sort();
}

/** Everything we hold on one session, as a plain object (for view + export). */
function sessionRecord(v: VisitRow) {
  return {
    status: v.status,
    secondsSinceLastSeen: v.secondsSinceLastSeen,
    clientId: v.clientId,
    contractId: v.contractId,
    serviceGuide: v.serviceGuide,
    guideToken: v.guideToken,
    guideLink: v.guideToken ? `/v/${v.guideToken}` : null,
    sessionId: v.sessionId,
    visitorId: v.visitorId,
    visitorSessionCount: v.visitorSessionCount,
    startedAtDubai: v.startedAtDubai,
    lastSeenDubai: v.lastSeenDubai,
    dwellMs: v.dwellMs,
    maxScrollPct: v.maxScrollPct,
    sectionsViewed: v.sectionsViewed,
    country: v.country,
    ip: v.ip,
    device: v.device,
    os: v.os,
    browser: v.browser,
    userAgent: v.userAgent,
    language: v.language,
    timezone: v.timezone,
    screen: v.screen,
    referrer: v.referrer,
    path: v.path,
  };
}

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (x: unknown) => {
    const s = Array.isArray(x) ? x.join(" ") : x == null ? "" : String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function AdminPage() {
  return (
    <TokenGate title="Admin · Analytics" subtitle="Enter the API token to view visitor logs.">
      {(token, clear) => <Dashboard token={token} onClear={clear} />}
    </TokenGate>
  );
}

function Dashboard({ token, onClear }: { token: string; onClear: () => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // filters (client-side over the fetched feed)
  const [q, setQ] = useState(""); // client id / contract id / link / token
  const [fCountry, setFCountry] = useState("");
  const [fDevice, setFDevice] = useState("");
  const [fReferrer, setFReferrer] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null); // expanded session
  const [autoRefresh, setAutoRefresh] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin", { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        setError("Token rejected. Lock and re-enter a valid token.");
        setFeed(null);
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "Failed to load");
        return;
      }
      setFeed(data as Feed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /* Live sessions go stale within seconds, so poll while auto-refresh is on. */
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const allVisits = feed?.visits ?? [];
  const term = q.trim().toLowerCase();
  /* A pasted link/token is matched against the guide token exactly; plain text
     is matched against client id / contract id / token as a substring. */
  const searchToken = term ? parseGuideToken(q.trim())?.toLowerCase() : null;
  const visits = allVisits.filter((v) => {
    if (term) {
      const hay =
        `${v.clientId ?? ""} ${v.contractId ?? ""} ${v.guideToken ?? ""} ${v.serviceGuide ?? ""}`.toLowerCase();
      const tokenHit = !!searchToken && (v.guideToken ?? "").toLowerCase() === searchToken;
      if (!tokenHit && !hay.includes(term)) return false;
    }
    if (liveOnly && !v.live) return false;
    if (fCountry && v.country !== fCountry) return false;
    if (fDevice && v.device !== fDevice) return false;
    if (fReferrer && (v.referrer ?? "direct") !== fReferrer) return false;
    return true;
  });
  const liveCount = allVisits.filter((v) => v.live).length;

  const filterSelect = (
    value: string,
    onChange: (v: string) => void,
    label: string,
    opts: string[],
  ) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-sm font-semibold text-[#374151] outline-none focus:border-[#4878BC]"
    >
      <option value="">{label}</option>
      {opts.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <div className="min-h-dvh bg-[#EEF3FB] px-4 py-6 font-sans text-[#111827]">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[22px] font-extrabold">
            Admin <span className="text-[#4878BC]">Analytics</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl bg-[#4878BC] px-3 py-2 text-sm font-bold text-white hover:bg-[#3a67a8]"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={onClear}
              className="rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-sm font-bold text-[#6B7280] hover:text-[#111827]"
            >
              Lock
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-xl bg-[#FEF2F2] px-3 py-2 text-sm font-semibold text-[#B91C1C]">
            {error}
          </p>
        ) : null}
        {loading && !feed ? <p className="mt-4 text-sm text-[#6B7280]">Loading…</p> : null}

        {feed ? (
          <>
            {/* filter bar */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search client ID, contract ID, token, or paste a full link…"
                className="min-w-[260px] flex-1 rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-sm font-semibold text-[#111827] outline-none focus:border-[#4878BC]"
              />
              <button
                type="button"
                onClick={() => setLiveOnly((v) => !v)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                  liveOnly
                    ? "border-[#15B886] bg-[#15B886] text-white"
                    : "border-[#B9CCE6] bg-white text-[#374151] hover:bg-[#EEF3FB]"
                }`}
                title="Show only sessions currently open"
              >
                <span
                  className={`h-2 w-2 rounded-full ${liveOnly ? "bg-white" : "bg-[#15B886]"} ${
                    liveCount ? "animate-pulse" : ""
                  }`}
                />
                Live only ({liveCount})
              </button>
              {filterSelect(
                fCountry,
                setFCountry,
                "All countries",
                distinct(allVisits, (v) => v.country),
              )}
              {filterSelect(
                fDevice,
                setFDevice,
                "All devices",
                distinct(allVisits, (v) => v.device),
              )}
              {filterSelect(
                fReferrer,
                setFReferrer,
                "All sources",
                distinct(allVisits, (v) => v.referrer ?? "direct"),
              )}
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className={`rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                  autoRefresh
                    ? "border-[#4878BC] bg-[#4878BC] text-white"
                    : "border-[#B9CCE6] bg-white text-[#6B7280] hover:text-[#111827]"
                }`}
                title="Reload every 10s so live sessions stay current"
              >
                {autoRefresh ? "Auto-refresh on" : "Auto-refresh off"}
              </button>
              {(q || fCountry || fDevice || fReferrer || liveOnly) && (
                <button
                  type="button"
                  onClick={() => {
                    setQ("");
                    setFCountry("");
                    setFDevice("");
                    setFReferrer("");
                    setLiveOnly(false);
                  }}
                  className="rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-sm font-bold text-[#6B7280] hover:text-[#111827]"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  download(
                    `sessions-${Date.now()}.csv`,
                    toCsv(visits.map(sessionRecord)),
                    "text/csv",
                  )
                }
                disabled={!visits.length}
                className="rounded-xl border border-[#B9CCE6] bg-white px-3 py-2 text-sm font-bold text-[#374151] hover:bg-[#EEF3FB] disabled:opacity-50"
                title="Download the sessions below as CSV"
              >
                Export CSV
              </button>
            </div>

            {/* sessions — status first, then location + client id. Click a row
                to open the full record for that visitor. */}
            <section className="mt-6 rounded-2xl border border-[#B9CCE6]/70 bg-white p-4 shadow-sm">
              <h2 className="text-[16px] font-extrabold text-[#4878BC]">
                Sessions ({visits.length}
                {visits.length !== allVisits.length ? ` of ${allVisits.length}` : ""}) ·{" "}
                <span className="text-[#15B886]">{liveCount} live</span>
              </h2>
              {visits.length === 0 ? (
                <p className="mt-3 text-sm text-[#6B7280]">
                  No sessions match the current filters.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] text-xs tracking-wide text-[#6B7280] uppercase">
                        {[
                          "Status",
                          "Location",
                          "Client ID",
                          "Contract ID",
                          "Visitor",
                          "Started (Dubai)",
                          "Last seen",
                          "Device",
                          "Dwell",
                          "Scroll",
                          "Source",
                          "",
                        ].map((c, i) => (
                          <th key={i} className="px-2 py-2 font-bold whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visits.map((v) => (
                        <Fragment key={v.id}>
                          <tr
                            onClick={() => setOpenRow(openRow === v.id ? null : v.id)}
                            className="cursor-pointer border-b border-[#F1F5F9] align-top hover:bg-[#F8FAFC]"
                          >
                            <td className="px-2 py-2 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                  v.live
                                    ? "bg-[#E9FBF4] text-[#0A7C5A]"
                                    : "bg-[#F1F5F9] text-[#6B7280]"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    v.live ? "animate-pulse bg-[#15B886]" : "bg-[#9CA3AF]"
                                  }`}
                                />
                                {v.live ? "LIVE" : "closed"}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{flag(v.country)}</td>
                            <td className="px-2 py-2 font-semibold whitespace-nowrap text-[#111827]">
                              {v.clientId ?? "—"}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{v.contractId ?? "—"}</td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {v.visitorId ? (
                                <span title={v.visitorId}>
                                  {v.visitorSessionCount > 1
                                    ? `returning ×${v.visitorSessionCount}`
                                    : "new"}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{v.startedAtDubai}</td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {v.live ? `${v.secondsSinceLastSeen}s ago` : v.lastSeenDubai}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {v.device ?? "—"} · {v.os ?? "?"}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">{fmtDwell(v.dwellMs)}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{v.maxScrollPct}%</td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {v.referrer ?? "direct"}
                            </td>
                            <td className="px-2 py-2 text-[#4878BC] whitespace-nowrap">
                              {openRow === v.id ? "▲ close" : "▼ open"}
                            </td>
                          </tr>
                          {openRow === v.id ? (
                            <tr className="border-b border-[#E5E7EB]">
                              <td colSpan={12} className="bg-[#F8FAFC] px-3 py-3">
                                <div className="mb-2 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      download(
                                        `session-${v.sessionId.slice(0, 8)}.json`,
                                        JSON.stringify(sessionRecord(v), null, 2),
                                        "application/json",
                                      )
                                    }
                                    className="rounded-lg bg-[#4878BC] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#3a67a8]"
                                  >
                                    Download JSON
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      download(
                                        `session-${v.sessionId.slice(0, 8)}.csv`,
                                        toCsv([sessionRecord(v)]),
                                        "text/csv",
                                      )
                                    }
                                    className="rounded-lg border border-[#B9CCE6] bg-white px-3 py-1.5 text-xs font-bold text-[#374151] hover:bg-[#EEF3FB]"
                                  >
                                    Download CSV
                                  </button>
                                  {v.guideToken ? (
                                    <a
                                      href={`/v/${v.guideToken}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="rounded-lg border border-[#B9CCE6] bg-white px-3 py-1.5 text-xs font-bold text-[#4878BC] hover:bg-[#EEF3FB]"
                                    >
                                      Open their guide ↗
                                    </a>
                                  ) : null}
                                </div>
                                <pre className="max-h-80 overflow-auto rounded-lg bg-white p-3 text-[11px] leading-relaxed text-[#374151]">
                                  {JSON.stringify(sessionRecord(v), null, 2)}
                                </pre>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* generated guides */}
            <Section
              title={`Generated guides (${feed.guides.length})`}
              columns={[
                "Created (Dubai)",
                "Client ID",
                "Contract ID",
                "Guide",
                "Resolved from",
                "Wording",
                "Source",
                "Visits",
                "Link",
              ]}
              rows={feed.guides.map((g) => [
                g.createdAtDubai,
                g.clientId,
                g.contractId ?? "—",
                g.serviceGuide,
                inputSummary(g),
                wordingSummary(g),
                g.ref ?? "—",
                String(g.visitCount),
                <a
                  key="l"
                  href={`/v/${g.token}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#4878BC] hover:underline"
                >
                  /v/{g.token}
                </a>,
              ])}
              empty="No guides generated yet."
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function Section({
  title,
  columns,
  rows,
  empty,
}: {
  title: string;
  columns: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <section className="mt-6 rounded-2xl border border-[#B9CCE6]/70 bg-white p-4 shadow-sm">
      <h2 className="text-[16px] font-extrabold text-[#4878BC]">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[#6B7280]">{empty}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E5E7EB] text-xs tracking-wide text-[#6B7280] uppercase">
                {columns.map((c) => (
                  <th key={c} className="whitespace-nowrap px-2 py-2 font-bold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-[#F1F5F9] align-top">
                  {r.map((cell, j) => (
                    <td key={j} className="px-2 py-2 whitespace-nowrap text-[#374151]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
