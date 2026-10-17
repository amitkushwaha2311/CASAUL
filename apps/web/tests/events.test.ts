/**
 * CAUSAL — Phase 3 Frontend Tests: Event Timeline and API client
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "../lib/api-client";

const mockEventResponse = {
  id: "evt-001",
  graph_id: "g1",
  event_type: "degradation",
  severity: "HIGH",
  status: "OPEN",
  source: "sensor",
  timestamp: "2026-10-01T08:10:00Z",
  received_at: "2026-10-01T08:10:01Z",
  description: "Power Station degradation",
  confidence: 0.85,
  evidence: null,
  metadata_: null,
  created_at: "2026-10-01T08:10:01Z",
  updated_at: "2026-10-01T08:10:01Z",
};

const mockObsResponse = {
  id: "obs-001",
  graph_id: "g1",
  node_id: "n1",
  event_id: "evt-001",
  observation_type: "measurement",
  metric: "health",
  value_numeric: 0.78,
  value_text: null,
  value_boolean: null,
  value_json: null,
  unit: "ratio",
  confidence: 0.90,
  timestamp: "2026-10-01T08:10:00Z",
  source: "sensor",
  metadata_: null,
  created_at: "2026-10-01T08:10:01Z",
};

function mockFetch(data: unknown) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    text: async () => JSON.stringify(data),
    json: async () => data,
  } as unknown as Response);
}

describe("apiClient — Event API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("should list events", async () => {
    const spy = mockFetch([mockEventResponse]);
    const result = await apiClient.listEvents("g1");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/events"),
      expect.anything()
    );
    expect(result).toEqual([mockEventResponse]);
  });

  it("should list events with severity filter", async () => {
    const spy = mockFetch([mockEventResponse]);
    await apiClient.listEvents("g1", { severity: "HIGH" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("severity=HIGH"),
      expect.anything()
    );
  });

  it("should get a single event", async () => {
    const spy = mockFetch(mockEventResponse);
    const result = await apiClient.getEvent("g1", "evt-001");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/events/evt-001"),
      expect.anything()
    );
    expect(result.severity).toBe("HIGH");
  });

  it("should get event statistics", async () => {
    const stats = {
      total_events: 10,
      open_events: 5,
      acknowledged_events: 2,
      resolved_events: 2,
      dismissed_events: 1,
      count_by_severity: { HIGH: 4, CRITICAL: 2, MEDIUM: 4 },
      count_by_type: { degradation: 5, failure: 5 },
      observation_count: 25,
    };
    const spy = mockFetch(stats);
    const result = await apiClient.getEventStatistics("g1");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/event-statistics"),
      expect.anything()
    );
    expect(result.total_events).toBe(10);
  });

  it("should get timeline", async () => {
    const spy = mockFetch([mockEventResponse]);
    await apiClient.getTimeline("g1");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/timeline"),
      expect.anything()
    );
  });
});

describe("apiClient — Observation API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("should list observations", async () => {
    const spy = mockFetch([mockObsResponse]);
    const result = await apiClient.listObservations("g1");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/observations"),
      expect.anything()
    );
    expect(result).toEqual([mockObsResponse]);
  });

  it("should list observations filtered by node_id", async () => {
    const spy = mockFetch([mockObsResponse]);
    await apiClient.listObservations("g1", { node_id: "n1" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("node_id=n1"),
      expect.anything()
    );
  });

  it("should get node events (history)", async () => {
    const spy = mockFetch([mockEventResponse]);
    await apiClient.getNodeEvents("g1", "n1");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/nodes/n1/events"),
      expect.anything()
    );
  });

  it("should get node observations (history)", async () => {
    const spy = mockFetch([mockObsResponse]);
    await apiClient.getNodeObservations("g1", "n1");
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/nodes/n1/observations"),
      expect.anything()
    );
  });
});
