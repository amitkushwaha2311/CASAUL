import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient } from "../lib/api-client";

describe("apiClient - Graphs API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch a list of graphs", async () => {
    const mockData = [{ id: "g1", name: "Graph 1" }];
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockData),
      json: async () => mockData,
    } as unknown as Response);

    const result = await apiClient.listGraphs();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs"),
      expect.anything()
    );
    expect(result).toEqual(mockData);
  });

  it("should fetch a single graph", async () => {
    const mockData = { id: "g1", name: "Graph 1" };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockData),
      json: async () => mockData,
    } as unknown as Response);

    const result = await apiClient.getGraph("g1");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1"),
      expect.anything()
    );
    expect(result).toEqual(mockData);
  });

  it("should fetch nodes for a graph", async () => {
    const mockData = [{ id: "n1", name: "Node 1" }];
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockData),
      json: async () => mockData,
    } as unknown as Response);

    const result = await apiClient.listNodes("g1");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/graphs/g1/nodes"),
      expect.anything()
    );
    expect(result).toEqual(mockData);
  });
});
