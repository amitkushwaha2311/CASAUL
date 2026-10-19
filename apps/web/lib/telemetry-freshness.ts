/**
 * CAUSAL — Telemetry Freshness & Timestamp Utilities
 *
 * Provides honest, unambiguous classification and formatting of telemetry observation timestamps,
 * client polling status, and historical incident records.
 */

export type TelemetryFreshnessStatus = "fresh" | "delayed" | "stale" | "no_data";

export interface TelemetryFreshnessInfo {
  status: TelemetryFreshnessStatus;
  /** High-level badge/metric label (e.g. "Live (45s ago)", "Delayed (2h ago)", "Stale (4d ago · 15 Oct)") */
  label: string;
  /** Short status tag (e.g. "Live", "Delayed", "Stale", "No Data") */
  shortLabel: string;
  /** Detailed audit label with explicit date and context */
  detailedLabel: string;
  /** Age in elapsed seconds from reference time, or null if no timestamp */
  ageSeconds: number | null;
  /** Parsed Date object or null */
  timestamp: Date | null;
  /** ISO string representation */
  formattedIso: string | null;
  /** Explicit UTC timestamp (e.g. "15 Oct 2026, 04:48:35 UTC") */
  formattedUtc: string | null;
  /** Local timezone string with explicit time zone indicator */
  formattedLocal: string | null;
  /** Color class for status text */
  statusColor: string;
  /** Border color class */
  statusBorder: string;
  /** Background color class */
  statusBg: string;
  /** True strictly when fresh (< 5m old) */
  isLive: boolean;
  /** True when telemetry is older than 24h */
  isStale: boolean;
  /** True when a valid timestamp was provided */
  hasData: boolean;
}

/**
 * Format a Date into an unambiguous UTC date-time string.
 * e.g. "15 Oct 2026, 04:48:35 UTC"
 */
export function formatUtcDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = pad(date.getUTCDate());
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${day} ${month} ${year}, ${hours}:${minutes}:${seconds} UTC`;
}

/**
 * Format a Date into short date format (e.g. "15 Oct 2026" or "15 Oct")
 */
export function formatShortDateUtc(date: Date, includeYear = true): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = pad(date.getUTCDate());
  const month = months[date.getUTCMonth()];
  const year = date.getUTCFullYear();
  return includeYear ? `${day} ${month} ${year}` : `${day} ${month}`;
}

/**
 * Classify telemetry freshness from an observation timestamp.
 *
 * Telemetry freshness criteria:
 * - Fresh (Live): < 300 seconds (< 5 minutes). Telemetry stream is active and timely.
 * - Delayed: 300s to 86400s (5m to 24 hours). Telemetry stream is behind or lagging.
 * - Stale: >= 86400s (>= 24 hours). Telemetry stream has stopped or observations are historical.
 * - No Data: null/undefined/invalid date. No observations have been ingested.
 */
export function classifyTelemetryFreshness(
  timestampStr?: string | null,
  referenceNow?: Date
): TelemetryFreshnessInfo {
  if (!timestampStr) {
    return {
      status: "no_data",
      label: "No observations ingested",
      shortLabel: "No Data",
      detailedLabel: "No telemetry observations recorded for this entity",
      ageSeconds: null,
      timestamp: null,
      formattedIso: null,
      formattedUtc: null,
      formattedLocal: null,
      statusColor: "text-[#736F66]",
      statusBorder: "border-[#736F66]/30",
      statusBg: "bg-[#736F66]/10",
      isLive: false,
      isStale: false,
      hasData: false,
    };
  }

  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) {
    return {
      status: "no_data",
      label: "Invalid timestamp",
      shortLabel: "Invalid",
      detailedLabel: "Telemetry timestamp could not be parsed",
      ageSeconds: null,
      timestamp: null,
      formattedIso: null,
      formattedUtc: null,
      formattedLocal: null,
      statusColor: "text-[#9B4540]",
      statusBorder: "border-[#9B4540]/30",
      statusBg: "bg-[#9B4540]/10",
      isLive: false,
      isStale: true,
      hasData: false,
    };
  }

  const now = referenceNow || new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  const ageSeconds = Math.max(0, diffSec);
  const formattedUtc = formatUtcDateTime(date);
  const formattedIso = date.toISOString();
  let formattedLocal: string;
  try {
    formattedLocal = `${date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}, ${date.toLocaleTimeString([], { hour12: false })}`;
  } catch {
    formattedLocal = formattedUtc;
  }

  // 1. Fresh (< 5 minutes)
  if (ageSeconds < 300) {
    let ageStr: string;
    if (ageSeconds < 10) {
      ageStr = "Just now";
    } else if (ageSeconds < 60) {
      ageStr = `${ageSeconds}s ago`;
    } else {
      const min = Math.floor(ageSeconds / 60);
      ageStr = `${min}m ago`;
    }

    return {
      status: "fresh",
      label: `Live (${ageStr})`,
      shortLabel: "Live",
      detailedLabel: `Live telemetry (${ageStr} · Observed ${formattedUtc})`,
      ageSeconds,
      timestamp: date,
      formattedIso,
      formattedUtc,
      formattedLocal,
      statusColor: "text-[#82977D]",
      statusBorder: "border-[#82977D]/40",
      statusBg: "bg-[#82977D]/15",
      isLive: true,
      isStale: false,
      hasData: true,
    };
  }

  // 2. Delayed (5 minutes to 24 hours)
  if (ageSeconds < 86400) {
    let ageStr: string;
    const min = Math.floor(ageSeconds / 60);
    if (min < 60) {
      ageStr = `${min}m ago`;
    } else {
      const hr = Math.floor(min / 60);
      ageStr = `${hr}h ago`;
    }

    return {
      status: "delayed",
      label: `Delayed (${ageStr})`,
      shortLabel: "Delayed",
      detailedLabel: `Delayed telemetry (${ageStr} · Observed ${formattedUtc})`,
      ageSeconds,
      timestamp: date,
      formattedIso,
      formattedUtc,
      formattedLocal,
      statusColor: "text-[#A99A80]",
      statusBorder: "border-[#A99A80]/40",
      statusBg: "bg-[#A99A80]/15",
      isLive: false,
      isStale: false,
      hasData: true,
    };
  }

  // 3. Stale (>= 24 hours)
  const days = Math.floor(ageSeconds / 86400);
  const shortDate = formatShortDateUtc(date, true);
  return {
    status: "stale",
    label: `Stale (${days}d ago · ${shortDate})`,
    shortLabel: "Stale",
    detailedLabel: `Stale telemetry (${days}d ago · Observed ${formattedUtc})`,
    ageSeconds,
    timestamp: date,
    formattedIso,
    formattedUtc,
    formattedLocal,
    statusColor: "text-[#9B4540]",
    statusBorder: "border-[#9B4540]/40",
    statusBg: "bg-[#9B4540]/15",
    isLive: false,
    isStale: true,
    hasData: true,
  };
}

/**
 * Format an incident or historical event timestamp with honest context.
 * Genuine historical events retain their historical date.
 */
export function formatHistoricalEventTime(
  timestampStr?: string | null,
  referenceNow?: Date
): string {
  if (!timestampStr) return "—";
  const date = new Date(timestampStr);
  if (isNaN(date.getTime())) return "Invalid date";

  const now = referenceNow || new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 0) {
    return formatUtcDateTime(date);
  }
  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const days = Math.floor(diffHr / 24);
  const shortDate = formatShortDateUtc(date, false);
  if (days < 30) {
    return `${days}d ago (${shortDate})`;
  }
  return formatShortDateUtc(date, true);
}
