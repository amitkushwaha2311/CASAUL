/**
 * CAUSAL — Sign In page (/login)
 *
 * Cast & Render Visual Reference applied to CAUSAL:
 *   - Fixed full-screen CloudFront video background with dark CAUSAL wash & grain
 *   - Inter Tight typography (weights 400 & 500)
 *   - Pill-shaped controls and restrained borders
 *   - Left  — cyber-physical infrastructure-network visual (obsidian / charcoal / muted bronze)
 *   - Right — editorial authentication card with frosted glass depth
 *
 * Preserves all authentication logic, tokens, redirect queries, route guards, and accessibility.
 */

"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { AuthShell } from "@/components/auth/auth-shell";

// ── Infrastructure Visual (Left Panel) ───────────────────────

function InfrastructureVisual() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "40px",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/* Subtle grid pattern */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(240, 237, 229, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(240, 237, 229, 0.035) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          pointerEvents: "none",
        }}
      />

      {/* Atmospheric radial glow */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "30%",
          left: "35%",
          width: "360px",
          height: "360px",
          background:
            "radial-gradient(circle, rgba(169, 154, 128, 0.12) 0%, rgba(130, 151, 125, 0.05) 50%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(48px)",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      {/* Header: Brand & Live Indicator Pill */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          {/* CAUSAL Wordmark */}
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              textDecoration: "none",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: "1px solid rgba(240, 237, 229, 0.18)",
                background: "#191A17",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.5)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 2,
                  background: "#A99A80",
                  display: "block",
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: 15,
                  letterSpacing: "-0.02em",
                  color: "#F0EDE5",
                  lineHeight: 1.1,
                }}
              >
                CAUSAL
              </div>
              <div
                style={{
                  fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#A7A398",
                  marginTop: 2,
                }}
              >
                Resilience Engine
              </div>
            </div>
          </Link>

          {/* Editorial Status Indicator */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 10px",
              background: "rgba(169, 154, 128, 0.08)",
              border: "1px solid rgba(169, 154, 128, 0.18)",
              borderRadius: 9999,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "#82977D",
                boxShadow: "0 0 6px rgba(130, 151, 125, 0.8)",
                display: "inline-block",
                animation: "pulseDot 2.4s ease-in-out infinite",
              }}
            />
            <span
              style={{
                fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "#A99A80",
              }}
            >
              Online
            </span>
          </div>
        </div>
      </div>

      {/* SVG Network Illustration */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px 0",
        }}
      >
        <svg
          width="360"
          height="280"
          viewBox="0 0 360 280"
          fill="none"
          aria-hidden="true"
          style={{ maxWidth: "100%", height: "auto" }}
        >
          {/* Connection lines */}
          <line x1="180" y1="140" x2="80" y2="60" stroke="rgba(169,154,128,0.25)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="180" y1="140" x2="280" y2="60" stroke="rgba(169,154,128,0.2)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="180" y1="140" x2="60" y2="200" stroke="rgba(169,154,128,0.2)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="180" y1="140" x2="300" y2="200" stroke="rgba(130,151,125,0.25)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="80" y1="60" x2="280" y2="60" stroke="rgba(240,237,229,0.08)" strokeWidth="1" />
          <line x1="60" y1="200" x2="300" y2="200" stroke="rgba(240,237,229,0.06)" strokeWidth="1" />
          <line x1="80" y1="60" x2="60" y2="200" stroke="rgba(240,237,229,0.06)" strokeWidth="1" />
          <line x1="280" y1="60" x2="300" y2="200" stroke="rgba(240,237,229,0.06)" strokeWidth="1" />

          {/* Central node */}
          <circle cx="180" cy="140" r="18" fill="rgba(169,154,128,0.12)" stroke="#A99A80" strokeWidth="1.5" />
          <circle cx="180" cy="140" r="8" fill="#A99A80" opacity="0.85" />

          {/* Peripheral nodes */}
          <circle cx="80" cy="60" r="10" fill="rgba(130,151,125,0.15)" stroke="rgba(130,151,125,0.6)" strokeWidth="1" />
          <circle cx="80" cy="60" r="4" fill="#82977D" opacity="0.75" />

          <circle cx="280" cy="60" r="10" fill="rgba(169,154,128,0.1)" stroke="rgba(169,154,128,0.4)" strokeWidth="1" />
          <circle cx="280" cy="60" r="4" fill="#A99A80" opacity="0.6" />

          <circle cx="60" cy="200" r="10" fill="rgba(169,154,128,0.1)" stroke="rgba(169,154,128,0.4)" strokeWidth="1" />
          <circle cx="60" cy="200" r="4" fill="#A99A80" opacity="0.6" />

          <circle cx="300" cy="200" r="10" fill="rgba(130,151,125,0.12)" stroke="rgba(130,151,125,0.5)" strokeWidth="1" />
          <circle cx="300" cy="200" r="4" fill="#82977D" opacity="0.7" />

          {/* Node labels */}
          <text x="80" y="44" textAnchor="middle" fill="rgba(240,237,229,0.45)" fontSize="9" fontFamily="var(--font-mono)">API-GATEWAY</text>
          <text x="280" y="44" textAnchor="middle" fill="rgba(240,237,229,0.45)" fontSize="9" fontFamily="var(--font-mono)">AUTH-SVC</text>
          <text x="50" y="222" textAnchor="middle" fill="rgba(240,237,229,0.45)" fontSize="9" fontFamily="var(--font-mono)">DB-PRIMARY</text>
          <text x="312" y="222" textAnchor="middle" fill="rgba(240,237,229,0.45)" fontSize="9" fontFamily="var(--font-mono)">CACHE</text>
          <text x="180" y="168" textAnchor="middle" fill="rgba(240,237,229,0.7)" fontSize="9" fontFamily="var(--font-mono)" fontWeight="bold">CAUSAL</text>

          {/* Animated pulse ring */}
          <circle cx="180" cy="140" r="18" fill="none" stroke="#A99A80" strokeWidth="1" opacity="0.3">
            <animate attributeName="r" from="18" to="38" dur="2.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.3" to="0" dur="2.8s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {/* Footer quote */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <blockquote
          style={{
            borderLeft: "2px solid rgba(169, 154, 128, 0.4)",
            paddingLeft: 16,
            margin: 0,
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.6,
              color: "rgba(240, 237, 229, 0.65)",
              margin: 0,
            }}
          >
            &ldquo;See the cascade before it happens.&rdquo;
          </p>
          <cite
            style={{
              fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#736F66",
              marginTop: 6,
              display: "block",
              fontStyle: "normal",
            }}
          >
            CAUSAL Platform
          </cite>
        </blockquote>
      </div>
    </div>
  );
}

// ── Login Form ────────────────────────────────────────────────

function LoginForm() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/app";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated — redirect
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirect);
    }
  }, [isAuthenticated, isLoading, router, redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || isAuthenticated) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
        <div
          style={{
            width: 24,
            height: 24,
            border: "2px solid rgba(169, 154, 128, 0.2)",
            borderTopColor: "#A99A80",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  const isFormValid = email.trim().length > 0 && password.length > 0;
  const isButtonDisabled = isSubmitting || !isFormValid;

  return (
    <div>
      {/* Editorial Category Pill & Heading */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "4px 12px",
            background: "rgba(169, 154, 128, 0.08)",
            border: "1px solid rgba(169, 154, 128, 0.18)",
            borderRadius: 9999,
            marginBottom: 16,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: "#82977D",
              boxShadow: "0 0 6px rgba(130, 151, 125, 0.8)",
              display: "inline-block",
            }}
          />
          <span
            style={{
              fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#A99A80",
            }}
          >
            Infrastructure Access
          </span>
        </div>

        <h1
          style={{
            fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
            fontWeight: 500,
            fontSize: 26,
            letterSpacing: "-0.025em",
            color: "#F0EDE5",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Sign in
        </h1>
        <p
          style={{
            fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
            fontSize: 13,
            color: "#A7A398",
            marginTop: 8,
            marginBottom: 0,
            lineHeight: 1.5,
          }}
        >
          Access the CAUSAL Resilience Platform
        </p>
      </div>

      {/* Error Alert (Oxide Red) */}
      {error && (
        <div
          role="alert"
          id="login-error-alert"
          style={{
            background: "rgba(155, 69, 64, 0.12)",
            border: "1px solid rgba(155, 69, 64, 0.35)",
            borderRadius: 12,
            padding: "11px 14px",
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9B4540"
            strokeWidth={2}
            style={{ marginTop: 2, flexShrink: 0 }}
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span
            style={{
              fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
              fontSize: 12,
              color: "#F0EDE5",
              lineHeight: 1.5,
            }}
          >
            {error}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Email Field */}
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="login-email"
            style={{
              fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#A7A398",
              display: "block",
              marginBottom: 8,
            }}
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            placeholder="you@organization.com"
            style={{
              width: "100%",
              background: "rgba(25, 26, 23, 0.88)",
              border: "1px solid rgba(240, 237, 229, 0.14)",
              borderRadius: 9999,
              padding: "12px 20px",
              fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
              fontSize: 13,
              color: "#F0EDE5",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s, box-shadow 0.2s, background-color 0.2s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#A99A80";
              e.target.style.boxShadow = "0 0 0 3px rgba(169, 154, 128, 0.2)";
              e.target.style.background = "#20211D";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(240, 237, 229, 0.14)";
              e.target.style.boxShadow = "none";
              e.target.style.background = "rgba(25, 26, 23, 0.88)";
            }}
          />
        </div>

        {/* Password Field */}
        <div style={{ marginBottom: 28 }}>
          <label
            htmlFor="login-password"
            style={{
              fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#A7A398",
              display: "block",
              marginBottom: 8,
            }}
          >
            Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              placeholder="••••••••"
              style={{
                width: "100%",
                background: "rgba(25, 26, 23, 0.88)",
                border: "1px solid rgba(240, 237, 229, 0.14)",
                borderRadius: 9999,
                padding: "12px 48px 12px 20px",
                fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
                fontSize: 13,
                color: "#F0EDE5",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.2s, box-shadow 0.2s, background-color 0.2s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#A99A80";
                e.target.style.boxShadow = "0 0 0 3px rgba(169, 154, 128, 0.2)";
                e.target.style.background = "#20211D";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(240, 237, 229, 0.14)";
                e.target.style.boxShadow = "none";
                e.target.style.background = "rgba(25, 26, 23, 0.88)";
              }}
            />
            <button
              type="button"
              id="login-toggle-password"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#736F66",
                padding: 0,
                transition: "color 0.15s, background-color 0.15s",
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#F0EDE5";
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(240, 237, 229, 0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#736F66";
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              {showPassword ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Pill Submit Button */}
        <button
          type="submit"
          id="login-submit-btn"
          disabled={isButtonDisabled}
          style={{
            width: "100%",
            background: isButtonDisabled ? "rgba(240, 237, 229, 0.10)" : "#F0EDE5",
            color: isButtonDisabled ? "#736F66" : "#111210",
            border: "none",
            borderRadius: 9999,
            padding: "13px 24px",
            fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "-0.01em",
            cursor: isButtonDisabled ? "not-allowed" : "pointer",
            boxShadow: isButtonDisabled ? "none" : "0 4px 16px rgba(0, 0, 0, 0.4)",
            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          onMouseEnter={(e) => {
            if (!isButtonDisabled) {
              (e.currentTarget as HTMLButtonElement).style.background = "#FFFFFF";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 20px rgba(240, 237, 229, 0.25)";
              (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isButtonDisabled) {
              (e.currentTarget as HTMLButtonElement).style.background = "#F0EDE5";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 16px rgba(0, 0, 0, 0.4)";
              (e.currentTarget as HTMLButtonElement).style.transform = "none";
            }
          }}
        >
          {isSubmitting ? (
            <>
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(17, 18, 16, 0.2)",
                  borderTopColor: "#111210",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      {/* Footer Navigation Link */}
      <p
        style={{
          marginTop: 26,
          marginBottom: 0,
          fontFamily: "'Inter Tight', var(--font-sans), sans-serif",
          fontSize: 12,
          color: "#736F66",
          textAlign: "center",
        }}
      >
        No account?{" "}
        <Link
          href="/signup"
          id="login-signup-link"
          style={{
            color: "#A99A80",
            textDecoration: "none",
            fontWeight: 500,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLAnchorElement).style.color = "#F0EDE5";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLAnchorElement).style.color = "#A99A80";
          }}
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function LoginPage() {
  return (
    <AuthShell visual={<InfrastructureVisual />}>
      <Suspense fallback={<div />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
