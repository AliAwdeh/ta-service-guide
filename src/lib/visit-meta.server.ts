/* Server-only helpers to derive visitor metadata from the request. Everything
   sensitive (IP, UA, device, Dubai time) is computed here — never trusted from
   the client beacon. */

export function clientIp(request: Request): string | null {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || null;
  const real = request.headers.get("x-real-ip");
  return real ? real.trim() : null;
}

/** 2-letter country from Cloudflare's edge header (passed through the tunnel). */
export function country(request: Request): string | null {
  const cc = request.headers.get("cf-ipcountry");
  if (!cc) return null;
  const up = cc.trim().toUpperCase();
  // Cloudflare uses "XX"/"T1" for unknown/Tor; treat as no location.
  return up && up !== "XX" && up !== "T1" ? up : null;
}

/** Dubai wall-clock timestamp, e.g. "23/07/2026, 14:05:33". */
export function dubaiTime(d = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export type DeviceInfo = { device: string; os: string; browser: string };

/** Light UA parse (no dependency). Good enough for an analytics dashboard. */
export function parseUserAgent(ua: string | null): DeviceInfo {
  if (!ua) return { device: "unknown", os: "unknown", browser: "unknown" };
  const s = ua.toLowerCase();

  const isTablet = /ipad|tablet|(android(?!.*mobile))/.test(s);
  const isMobile = /iphone|ipod|android.*mobile|windows phone|mobile/.test(s);
  const device = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  let os = "unknown";
  if (/iphone|ipad|ipod/.test(s)) os = "iOS";
  else if (/android/.test(s)) os = "Android";
  else if (/windows/.test(s)) os = "Windows";
  else if (/mac os x|macintosh/.test(s)) os = "macOS";
  else if (/linux/.test(s)) os = "Linux";
  else if (/cros/.test(s)) os = "ChromeOS";

  let browser = "unknown";
  if (/edg\//.test(s)) browser = "Edge";
  else if (/samsungbrowser/.test(s)) browser = "Samsung Internet";
  else if (/opr\/|opera/.test(s)) browser = "Opera";
  else if (/firefox|fxios/.test(s)) browser = "Firefox";
  else if (/chrome|crios/.test(s)) browser = "Chrome";
  else if (/safari/.test(s)) browser = "Safari";

  return { device, os, browser };
}
