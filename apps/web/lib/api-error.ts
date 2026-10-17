/**
 * CAUSAL — API error handling utility.
 *
 * Provides consistent error classification and message extraction
 * for all API calls throughout the frontend.
 */

import type { ApiErrorResponse } from "@causal/shared/src/index";

// ── Custom error class ─────────────────────────────────────────

export class CausalApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    details?: unknown
  ) {
    super(message);
    this.name = "CausalApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  /** True if this is a network failure (no response received). */
  get isNetworkError(): boolean {
    return this.statusCode === 0;
  }

  /** True if the server explicitly rejected the request. */
  get isServerError(): boolean {
    return this.statusCode >= 500;
  }

  /** True if the request was malformed on the client side. */
  get isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }
}

// ── Response parsing ───────────────────────────────────────────

/**
 * Parse an API response, throwing a CausalApiError for non-2xx responses.
 *
 * @example
 * const data = await parseApiResponse<HealthResponse>(response);
 */
export async function parseApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => "");
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // Ignore JSON parse error
    }
  }

  if (!response.ok) {
    // Try to parse structured error envelope
    const apiError = body as ApiErrorResponse | null;
    const code = apiError?.error?.code ?? "HTTP_ERROR";
    const message =
      apiError?.error?.message ?? `HTTP ${response.status}: ${response.statusText}`;
    const details = apiError?.error?.details;

    throw new CausalApiError(code, message, response.status, details);
  }

  return body as T;
}

/**
 * Extract a human-readable error message from any caught error.
 *
 * Safe to call with unknown error types.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof CausalApiError) {
    return error.message;
  }
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "Could not connect to the CAUSAL API. Is the server running?";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}
