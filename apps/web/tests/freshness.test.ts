/**
 * CAUSAL — Frontend Tests: Telemetry Freshness & Timestamp Handling
 *
 * Verifies:
 * - Fresh observations (< 5m old) classified as live
 * - Delayed observations (5m to 24h) classified as delayed
 * - Stale observations (>= 24h old, e.g. 15 Oct on 19 Oct) classified as stale with honest labels
 * - Missing/null/invalid timestamps handled safely with explicit no-data states
 * - Genuine historical records retain accurate timestamps without fabrication
 * - Timezone boundaries (UTC parsing, UTC formatting, cross-day shifts)
 * - Separation between client polling interval (30s) and observation telemetry freshness
 */

import { describe, it, expect } from "vitest";
import {
  classifyTelemetryFreshness,
  formatHistoricalEventTime,
  formatUtcDateTime,
  formatShortDateUtc,
} from "@/lib/telemetry-freshness";

describe("Telemetry Freshness Classification", () => {
  // Reference time: 2026-10-19T12:00:00.000Z
  const refNow = new Date("2026-10-19T12:00:00.000Z");

  describe("Fresh Observations (< 5 minutes)", () => {
    it("classifies observation from 5 seconds ago as fresh / live", () => {
      const ts = new Date("2026-10-19T11:59:55.000Z").toISOString();
      const freshness = classifyTelemetryFreshness(ts, refNow);

      expect(freshness.status).toBe("fresh");
      expect(freshness.isLive).toBe(true);
      expect(freshness.isStale).toBe(false);
      expect(freshness.hasData).toBe(true);
      expect(freshness.label).toBe("Live (Just now)");
      expect(freshness.shortLabel).toBe("Live");
      expect(freshness.statusColor).toBe("text-[#82977D]");
    });

    it("classifies observation from 45 seconds ago as fresh / live", () => {
      const ts = new Date("2026-10-19T11:59:15.000Z").toISOString();
      const freshness = classifyTelemetryFreshness(ts, refNow);

      expect(freshness.status).toBe("fresh");
      expect(freshness.isLive).toBe(true);
      expect(freshness.label).toBe("Live (45s ago)");
    });

    it("classifies observation from 3 minutes ago as fresh / live", () => {
      const ts = new Date("2026-10-19T11:57:00.000Z").toISOString();
      const freshness = classifyTelemetryFreshness(ts, refNow);

      expect(freshness.status).toBe("fresh");
      expect(freshness.isLive).toBe(true);
      expect(freshness.label).toBe("Live (3m ago)");
    });
  });

  describe("Delayed Observations (5 minutes to 24 hours)", () => {
    it("classifies observation from 20 minutes ago as delayed", () => {
      const ts = new Date("2026-10-19T11:40:00.000Z").toISOString();
      const freshness = classifyTelemetryFreshness(ts, refNow);

      expect(freshness.status).toBe("delayed");
      expect(freshness.isLive).toBe(false);
      expect(freshness.isStale).toBe(false);
      expect(freshness.label).toBe("Delayed (20m ago)");
      expect(freshness.shortLabel).toBe("Delayed");
      expect(freshness.statusColor).toBe("text-[#A99A80]");
    });

    it("classifies observation from 6 hours ago as delayed", () => {
      const ts = new Date("2026-10-19T06:00:00.000Z").toISOString();
      const freshness = classifyTelemetryFreshness(ts, refNow);

      expect(freshness.status).toBe("delayed");
      expect(freshness.isLive).toBe(false);
      expect(freshness.label).toBe("Delayed (6h ago)");
    });
  });

  describe("Stale Observations (>= 24 hours)", () => {
    it("classifies 15 October observation on 19 October (4 days ago) as explicitly STALE", () => {
      const ts = "2026-10-15T04:48:35.000Z";
      const freshness = classifyTelemetryFreshness(ts, refNow);

      expect(freshness.status).toBe("stale");
      expect(freshness.isLive).toBe(false);
      expect(freshness.isStale).toBe(true);
      expect(freshness.hasData).toBe(true);
      // Confirms label explicitly includes elapsed days and historical date
      expect(freshness.label).toContain("Stale");
      expect(freshness.label).toContain("4d ago");
      expect(freshness.label).toContain("15 Oct 2026");
      expect(freshness.statusColor).toBe("text-[#9B4540]");
      // Confirms formatted UTC includes full date, time, and timezone
      expect(freshness.formattedUtc).toBe("15 Oct 2026, 04:48:35 UTC");
    });

    it("classifies observation from 1 day ago as stale", () => {
      const ts = new Date("2026-10-18T11:00:00.000Z").toISOString();
      const freshness = classifyTelemetryFreshness(ts, refNow);

      expect(freshness.status).toBe("stale");
      expect(freshness.isStale).toBe(true);
      expect(freshness.label).toContain("Stale (1d ago");
    });
  });

  describe("Missing, Null, and Invalid Timestamps", () => {
    it("handles null timestamp as no data without throwing or claiming live", () => {
      const freshness = classifyTelemetryFreshness(null, refNow);

      expect(freshness.status).toBe("no_data");
      expect(freshness.isLive).toBe(false);
      expect(freshness.isStale).toBe(false);
      expect(freshness.hasData).toBe(false);
      expect(freshness.label).toBe("No observations ingested");
      expect(freshness.formattedUtc).toBeNull();
    });

    it("handles undefined timestamp as no data", () => {
      const freshness = classifyTelemetryFreshness(undefined, refNow);

      expect(freshness.status).toBe("no_data");
      expect(freshness.label).toBe("No observations ingested");
    });

    it("handles invalid date string gracefully", () => {
      const freshness = classifyTelemetryFreshness("not-a-valid-date", refNow);

      expect(freshness.status).toBe("no_data");
      expect(freshness.label).toBe("Invalid timestamp");
      expect(freshness.hasData).toBe(false);
    });
  });

  describe("Timezone Boundaries & Formatting", () => {
    it("formats 04:48:35 UTC unambiguously with date and timezone indicator", () => {
      const d = new Date("2026-10-15T04:48:35.000Z");
      const formatted = formatUtcDateTime(d);
      expect(formatted).toBe("15 Oct 2026, 04:48:35 UTC");
    });

    it("formats midnight UTC correctly", () => {
      const d = new Date("2026-10-19T00:00:00.000Z");
      expect(formatUtcDateTime(d)).toBe("19 Oct 2026, 00:00:00 UTC");
    });

    it("handles cross-day timezone offset consistently in UTC", () => {
      // 23:30 UTC on Oct 14 is 05:00 on Oct 15 in IST (+05:30)
      const d = new Date("2026-10-14T23:30:00.000Z");
      expect(formatUtcDateTime(d)).toBe("14 Oct 2026, 23:30:00 UTC");
      expect(formatShortDateUtc(d, true)).toBe("14 Oct 2026");
    });
  });

  describe("Historical Incident Records", () => {
    it("preserves genuine historical incident event dates", () => {
      // Event from 11 October 2026, 12:04 when now is 19 October 2026, 12:00 (7d 23h 56m ago)
      const eventTs = "2026-10-11T12:04:00.000Z";
      const formatted = formatHistoricalEventTime(eventTs, refNow);
      expect(formatted).toContain("7d ago (11 Oct)");
    });

    it("formats recent incidents with relative elapsed time", () => {
      const recentEventTs = new Date("2026-10-19T11:45:00.000Z").toISOString();
      const formatted = formatHistoricalEventTime(recentEventTs, refNow);
      expect(formatted).toBe("15m ago");
    });

    it("handles missing event timestamp gracefully", () => {
      expect(formatHistoricalEventTime(null)).toBe("—");
      expect(formatHistoricalEventTime(undefined)).toBe("—");
    });
  });
});
