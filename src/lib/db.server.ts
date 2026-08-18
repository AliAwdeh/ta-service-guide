import process from "node:process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type {
  ApiPackage,
  Emirate,
  Gender,
  GuideData,
  GuideRenderData,
  MaidLocation,
  Nationality,
  PassportType,
  ServiceGuide,
} from "./guide-config";
import { randomCode } from "./token.server";

/* ═══════════════════════════════════════════════════════════════════════════
   DB (server-only) — local SQLite, cross-runtime.
   ─────────────────────────────────────────────────────────────────────────
   Production serves the built bundle under Bun → bun:sqlite. The Vite dev
   server SSRs under Node → node:sqlite (Node ≥ 22.5). Neither builtin loads in
   the other runtime, so we pick at runtime behind a tiny adapter and speak
   positional `?` parameters (supported by both). Both are external in the Vite
   build (vite.config.ts). `.server.ts` keeps this out of the client bundle.
   ═══════════════════════════════════════════════════════════════════════════ */

type SqlValue = string | number | null;

interface Db {
  run(sql: string, ...params: SqlValue[]): void;
  get<T>(sql: string, ...params: SqlValue[]): T | null;
  all<T>(sql: string, ...params: SqlValue[]): T[];
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS guides (
    token TEXT PRIMARY KEY,
    client_id TEXT NOT NULL,
    contract_id TEXT,
    service_guide TEXT NOT NULL,
    explicit_guide TEXT,
    pkg TEXT NOT NULL,
    nationality TEXT NOT NULL,
    maid_location TEXT,
    passport_type TEXT,
    gender TEXT,
    role TEXT NOT NULL,
    emirate TEXT,
    ref TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_guides_client ON guides(client_id)`,
  `CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guide_token TEXT,
    session_id TEXT NOT NULL,
    path TEXT,
    ip TEXT,
    user_agent TEXT,
    device TEXT,
    os TEXT,
    browser TEXT,
    referrer TEXT,
    language TEXT,
    screen TEXT,
    timezone TEXT,
    started_at_utc TEXT NOT NULL,
    started_at_dubai TEXT NOT NULL,
    last_seen_utc TEXT NOT NULL,
    dwell_ms INTEGER NOT NULL DEFAULT 0,
    max_scroll_pct INTEGER NOT NULL DEFAULT 0,
    sections_viewed TEXT,
    country TEXT,
    visitor_id TEXT,
    events TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_visits_session ON visits(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_visits_guide ON visits(guide_token)`,
];

async function openBun(path: string): Promise<Db> {
  const { Database } = await import("bun:sqlite");
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL;");
  return {
    run: (sql, ...p) => {
      db.query(sql).run(...(p as never[]));
    },
    get: (sql, ...p) => (db.query(sql).get(...(p as never[])) as never) ?? null,
    all: (sql, ...p) => db.query(sql).all(...(p as never[])) as never,
  };
}

async function openNode(path: string): Promise<Db> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  return {
    run: (sql, ...p) => {
      db.prepare(sql).run(...(p as never[]));
    },
    get: (sql, ...p) => (db.prepare(sql).get(...(p as never[])) as never) ?? null,
    all: (sql, ...p) => db.prepare(sql).all(...(p as never[])) as never,
  };
}

let _dbPromise: Promise<Db> | null = null;

function getDb(): Promise<Db> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = (async () => {
    const path = process.env.DB_PATH || "./data/app.db";
    mkdirSync(dirname(path), { recursive: true });
    const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
    const db = isBun ? await openBun(path) : await openNode(path);
    for (const stmt of SCHEMA) db.run(stmt);
    migrate(db);
    return db;
  })();
  return _dbPromise;
}

/* Additive migration for databases created before a column existed
   (CREATE TABLE IF NOT EXISTS won't add columns to an existing table).
   Keep every change additive — this runs against live data. */
function migrate(db: Db): void {
  const addColumn = (table: string, column: string, decl: string) => {
    const cols = db.all<{ name: string }>(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    }
  };
  addColumn("guides", "explicit_guide", "TEXT");
  addColumn("guides", "emirate", "TEXT");
  addColumn("guides", "ref", "TEXT");
  addColumn("visits", "country", "TEXT");
  addColumn("visits", "visitor_id", "TEXT");
}

/** A session counts as live if its last heartbeat is within this window.
    The beacon heartbeats every 10s, so 30s = three missed beats. */
export const LIVE_WINDOW_MS = 30_000;

/* -------------------------------- guides --------------------------------- */

export type GuideRow = GuideData & {
  token: string;
  clientId: string;
  createdAt: string;
  /** The guide the caller pinned explicitly via SERVICE_GUIDE, or null when it
      was resolved from the discriminators. Kept so a later PATCH can tell the
      two apart: an explicit choice must survive a nationality change. */
  explicitGuide: ServiceGuide | null;
};

type RawGuide = {
  token: string;
  client_id: string;
  contract_id: string | null;
  service_guide: string;
  explicit_guide: string | null;
  pkg: string;
  nationality: string;
  maid_location: string | null;
  passport_type: string | null;
  gender: string;
  role: string;
  emirate: string | null;
  ref: string | null;
  created_at: string;
};

function mapGuide(r: RawGuide): GuideRow {
  return {
    token: r.token,
    clientId: r.client_id,
    contractId: r.contract_id ?? null,
    serviceGuide: r.service_guide as ServiceGuide,
    explicitGuide: (r.explicit_guide as ServiceGuide | null) ?? null,
    pkg: r.pkg as ApiPackage,
    nationality: r.nationality as Nationality,
    maidLocation: (r.maid_location as MaidLocation | null) ?? null,
    passportType: (r.passport_type as PassportType | null) ?? null,
    gender: (r.gender as Gender | null) ?? null,
    role: r.role || "maid",
    emirate: (r.emirate as Emirate | null) ?? null,
    ref: r.ref ?? null,
    createdAt: r.created_at,
  };
}

/**
 * A short (6 base62 char) token guaranteed free in the guides table. Widens by
 * one char in the unlikely event of repeated collisions, so it can never loop
 * forever.
 */
export async function newUniqueToken(): Promise<string> {
  const db = await getDb();
  let length = 6;
  for (let attempt = 0; attempt < 20; attempt++) {
    const token = randomCode(length);
    const hit = db.get<{ token: string }>("SELECT token FROM guides WHERE token = ?", token);
    if (!hit) return token;
    if (attempt >= 9) length++; // extremely unlikely; grow the space
  }
  return randomCode(length + 2); // last-resort, effectively collision-proof
}

export async function insertGuide(
  token: string,
  clientId: string,
  data: GuideData,
  explicitGuide: ServiceGuide | null,
): Promise<GuideRow> {
  const createdAt = new Date().toISOString();
  const db = await getDb();
  db.run(
    `INSERT INTO guides
       (token, client_id, contract_id, service_guide, explicit_guide, pkg, nationality,
        maid_location, passport_type, gender, role, emirate, ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    token,
    clientId,
    data.contractId,
    data.serviceGuide,
    explicitGuide,
    data.pkg,
    data.nationality,
    data.maidLocation,
    data.passportType,
    data.gender,
    data.role,
    data.emirate,
    data.ref,
    createdAt,
  );
  return { token, clientId, createdAt, explicitGuide, ...data };
}

/** Columns a PATCH may touch. `token` and `created_at` are deliberately absent
    so a link can never be repointed or back-dated. */
const UPDATABLE_COLUMNS = new Set([
  "client_id",
  "contract_id",
  "service_guide",
  "explicit_guide",
  "pkg",
  "nationality",
  "maid_location",
  "passport_type",
  "gender",
  "role",
  "emirate",
  "ref",
]);

/**
 * Update an existing guide in place. The token is never touched, so the link
 * already shared with the client keeps working and now shows the corrected
 * guide. `patch` holds only the columns the caller actually sent.
 * Returns false when the token doesn't exist.
 */
export async function updateGuide(
  token: string,
  patch: Record<string, string | number | null>,
): Promise<boolean> {
  // Allowlist the column names — they are the only part of the SQL that is not
  // a bound parameter, so they must never come from unchecked input.
  const keys = Object.keys(patch).filter((k) => UPDATABLE_COLUMNS.has(k));
  if (keys.length === 0) return true; // nothing to change
  const db = await getDb();
  const exists = db.get<{ token: string }>("SELECT token FROM guides WHERE token = ?", token);
  if (!exists) return false;
  const setSql = keys.map((k) => `${k} = ?`).join(", ");
  db.run(
    `UPDATE guides SET ${setSql} WHERE token = ?`,
    ...(keys.map((k) => patch[k]) as SqlValue[]),
    token,
  );
  return true;
}

/** Public render data for /v — never exposes client_id to the caller. */
export async function getGuideData(token: string): Promise<GuideRenderData | null> {
  const db = await getDb();
  const row = db.get<RawGuide>("SELECT * FROM guides WHERE token = ?", token);
  if (!row) return null;
  // Whatever this returns is serialised into the /v/ hydration payload, so
  // contractId and ref (internal metadata, never rendered) are dropped
  // alongside token / clientId / createdAt / explicitGuide.
  const {
    token: _t,
    clientId: _c,
    createdAt: _cr,
    contractId: _ct,
    ref: _rf,
    explicitGuide: _eg,
    ...data
  } = mapGuide(row);
  return data;
}

/**
 * Full row INCLUDING client_id — for bearer-gated internal tooling only
 * (/debug needs it so an edit doesn't overwrite the stored client id).
 * Never use this on the public /v/ render path.
 */
export async function getGuideRow(token: string): Promise<GuideRow | null> {
  const db = await getDb();
  const row = db.get<RawGuide>("SELECT * FROM guides WHERE token = ?", token);
  return row ? mapGuide(row) : null;
}

export type GuideListRow = GuideRow & {
  createdAtDubai: string;
  visitCount: number;
  lastVisitDubai: string | null;
};

export async function listGuides(): Promise<GuideListRow[]> {
  const db = await getDb();
  const rows = db.all<RawGuide & { visit_count: number; last_visit: string | null }>(
    `SELECT g.*,
       (SELECT COUNT(*) FROM visits v WHERE v.guide_token = g.token) AS visit_count,
       (SELECT MAX(v.last_seen_utc) FROM visits v WHERE v.guide_token = g.token) AS last_visit
     FROM guides g ORDER BY g.created_at DESC`,
  );
  return rows.map((r) => ({
    ...mapGuide(r),
    createdAtDubai: dubaiFromIso(r.created_at),
    visitCount: r.visit_count,
    lastVisitDubai: r.last_visit ? dubaiFromIso(r.last_visit) : null,
  }));
}

/* -------------------------------- visits --------------------------------- */

export type VisitRecord = {
  sessionId: string;
  guideToken: string | null;
  path: string | null;
  ip: string | null;
  userAgent: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  language: string | null;
  screen: string | null;
  timezone: string | null;
  startedAtUtc: string;
  startedAtDubai: string;
  lastSeenUtc: string;
  dwellMs: number;
  maxScrollPct: number;
  sectionsViewed: string[];
  country: string | null;
  /** First-party cookie id — same person across sessions. */
  visitorId: string | null;
};

export async function recordVisit(v: VisitRecord): Promise<void> {
  const db = await getDb();
  db.run(
    `INSERT INTO visits
       (guide_token, session_id, path, ip, user_agent, device, os, browser,
        referrer, language, screen, timezone, started_at_utc, started_at_dubai,
        last_seen_utc, dwell_ms, max_scroll_pct, sections_viewed, country, visitor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       last_seen_utc   = excluded.last_seen_utc,
       dwell_ms        = MAX(visits.dwell_ms, excluded.dwell_ms),
       max_scroll_pct  = MAX(visits.max_scroll_pct, excluded.max_scroll_pct),
       sections_viewed = excluded.sections_viewed,
       guide_token     = COALESCE(visits.guide_token, excluded.guide_token),
       country         = COALESCE(visits.country, excluded.country),
       visitor_id      = COALESCE(visits.visitor_id, excluded.visitor_id)`,
    v.guideToken,
    v.sessionId,
    v.path,
    v.ip,
    v.userAgent,
    v.device,
    v.os,
    v.browser,
    v.referrer,
    v.language,
    v.screen,
    v.timezone,
    v.startedAtUtc,
    v.startedAtDubai,
    v.lastSeenUtc,
    v.dwellMs,
    v.maxScrollPct,
    JSON.stringify(v.sectionsViewed ?? []),
    v.country,
    v.visitorId,
  );
}

export type VisitListRow = {
  id: number;
  guideToken: string | null;
  clientId: string | null;
  contractId: string | null;
  /** Which guide the visited link renders — so admin can read the log without
      cross-referencing the guides table. */
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
  /** First-party cookie id (same person across sessions), or null. */
  visitorId: string | null;
  /** true while the page is still open (last heartbeat within LIVE_WINDOW_MS). */
  live: boolean;
  /** "live" | "closed" — the same thing, ready to display. */
  status: "live" | "closed";
  /** How many sessions this visitor has had in total (1 = first visit). */
  visitorSessionCount: number;
  /** Seconds since the last heartbeat. */
  secondsSinceLastSeen: number;
};

type RawVisit = {
  id: number;
  guide_token: string | null;
  client_id: string | null;
  contract_id: string | null;
  service_guide: string | null;
  session_id: string;
  path: string | null;
  ip: string | null;
  country: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  user_agent: string | null;
  referrer: string | null;
  language: string | null;
  screen: string | null;
  timezone: string | null;
  started_at_dubai: string;
  last_seen_utc: string;
  dwell_ms: number;
  max_scroll_pct: number;
  sections_viewed: string | null;
  visitor_id: string | null;
  visitor_session_count: number | null;
};

export async function listVisits(limit = 500): Promise<VisitListRow[]> {
  const db = await getDb();
  // LEFT JOIN so each visit carries the client_id / contract_id / guide of its
  // link, plus a correlated count of how many sessions that visitor has had.
  const rows = db.all<RawVisit>(
    `SELECT v.*, g.client_id AS client_id, g.contract_id AS contract_id,
       g.service_guide AS service_guide,
       (SELECT COUNT(*) FROM visits v2 WHERE v2.visitor_id IS NOT NULL
          AND v2.visitor_id = v.visitor_id) AS visitor_session_count
     FROM visits v LEFT JOIN guides g ON g.token = v.guide_token
     ORDER BY v.last_seen_utc DESC LIMIT ?`,
    limit,
  );
  const now = Date.now();
  return rows.map((r) => {
    const sinceMs = now - new Date(r.last_seen_utc).getTime();
    const live = sinceMs >= 0 && sinceMs < LIVE_WINDOW_MS;
    return {
      id: r.id,
      guideToken: r.guide_token,
      clientId: r.client_id ?? null,
      contractId: r.contract_id ?? null,
      serviceGuide: r.service_guide ?? null,
      sessionId: r.session_id,
      path: r.path,
      ip: r.ip,
      country: r.country ?? null,
      device: r.device,
      os: r.os,
      browser: r.browser,
      userAgent: r.user_agent,
      referrer: r.referrer,
      language: r.language,
      screen: r.screen,
      timezone: r.timezone,
      startedAtDubai: r.started_at_dubai,
      lastSeenDubai: dubaiFromIso(r.last_seen_utc),
      dwellMs: r.dwell_ms,
      maxScrollPct: r.max_scroll_pct,
      sectionsViewed: safeParse(r.sections_viewed),
      visitorId: r.visitor_id ?? null,
      live,
      status: live ? "live" : "closed",
      visitorSessionCount: r.visitor_session_count ?? 1,
      secondsSinceLastSeen: Math.max(0, Math.round(sinceMs / 1000)),
    };
  });
}

function safeParse(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function dubaiFromIso(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
