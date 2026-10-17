/**
 * CAUSAL — API client error handling tests.
 *
 * Tests the CausalApiError class, parseApiResponse, and getErrorMessage.
 * These tests do NOT require a running API server.
 */

import { describe, it, expect } from "vitest";
import { CausalApiError, parseApiResponse, getErrorMessage } from "../lib/api-error";

// ── parseApiResponse ───────────────────────────────────────────

describe("parseApiResponse", () => {
  it("returns parsed JSON for 2xx responses", async () => {
    const mockResponse = new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

    const result = await parseApiResponse<{ status: string }>(mockResponse);
    expect(result).toEqual({ status: "ok" });
  });

  it("throws CausalApiError for 4xx responses with error envelope", async () => {
    const errorBody = {
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "Resource not found",
      },
    };
    const mockResponse = () => new Response(JSON.stringify(errorBody), {
      status: 404,
    });

    await expect(parseApiResponse(mockResponse())).rejects.toThrow(CausalApiError);
    await expect(parseApiResponse(mockResponse())).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      statusCode: 404,
      message: "Resource not found",
    });
  });

  it("throws CausalApiError for 5xx responses", async () => {
    const mockResponse = new Response(JSON.stringify({ error: { code: "INTERNAL_SERVER_ERROR", message: "Server error" } }), {
      status: 500,
    });

    await expect(parseApiResponse(mockResponse)).rejects.toThrow(CausalApiError);
  });

  it("falls back to generic error code when body is not structured", async () => {
    const mockResponse = new Response("Internal Server Error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });

    await expect(parseApiResponse(mockResponse)).rejects.toMatchObject({
      code: "HTTP_ERROR",
      statusCode: 500,
    });
  });
});

// ── CausalApiError ─────────────────────────────────────────────

describe("CausalApiError", () => {
  it("correctly identifies network errors", () => {
    const error = new CausalApiError("NETWORK_ERROR", "Network failure", 0);
    expect(error.isNetworkError).toBe(true);
    expect(error.isServerError).toBe(false);
  });

  it("correctly identifies server errors", () => {
    const error = new CausalApiError("INTERNAL_SERVER_ERROR", "Server error", 500);
    expect(error.isServerError).toBe(true);
    expect(error.isClientError).toBe(false);
    expect(error.isNetworkError).toBe(false);
  });

  it("correctly identifies client errors", () => {
    const error = new CausalApiError("NOT_FOUND", "Not found", 404);
    expect(error.isClientError).toBe(true);
    expect(error.isServerError).toBe(false);
  });

  it("stores details correctly", () => {
    const details = [{ field: "email", message: "Invalid" }];
    const error = new CausalApiError("VALIDATION_ERROR", "Validation failed", 422, details);
    expect(error.details).toEqual(details);
  });
});

// ── getErrorMessage ────────────────────────────────────────────

describe("getErrorMessage", () => {
  it("extracts message from CausalApiError", () => {
    const error = new CausalApiError("NOT_FOUND", "Resource not found", 404);
    expect(getErrorMessage(error)).toBe("Resource not found");
  });

  it("returns friendly message for fetch TypeError", () => {
    const error = new TypeError("Failed to fetch");
    expect(getErrorMessage(error)).toContain("CAUSAL API");
  });

  it("extracts message from generic Error", () => {
    const error = new Error("Something broke");
    expect(getErrorMessage(error)).toBe("Something broke");
  });

  it("returns fallback for unknown error types", () => {
    expect(getErrorMessage(null)).toBe("An unexpected error occurred.");
    expect(getErrorMessage(42)).toBe("An unexpected error occurred.");
    expect(getErrorMessage("a string")).toBe("An unexpected error occurred.");
  });
});
