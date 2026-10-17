/**
 * CAUSAL — Sign In page (/login)
 *
 * Split-screen layout:
 *   Left  — infrastructure-inspired animated visual (obsidian/charcoal)
 *   Right — editorial login form (warm ivory / muted bronze palette)
 *
 * On success: redirects to ?redirect= or /app
 * On failure: shows inline error with animation
 */

"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// ── Infrastructure Visual (Left Panel) ───────────────────────

function InfrastructureVisual() {
  return (
    <div className="relative w-full h-full overflow-hidden bg-[#111210] flex flex-col justify-between p-10">
      {/* Grid overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(240,237,229,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(240,237,229,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Gradient orb */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "25%",
          left: "30%",
          width: "340px",
          height: "340px",
          background:
            "radial-gradient(circle, rgba(169,154,128,0.12) 0%, rgba(130,151,125,0.06) 45%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(40px)",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Wordmark */}
      <div className="relative z-10">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div
            style={{
              width: 32,
              height: 32,
              border: "1px solid rgba(240,237,229,0.18)",
              background: "#191A17",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
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
              }}
            >
              CAUSAL
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#736F66",
                marginTop: 1,
              }}
            >
              Resilience Engine
            </div>
          </div>
        </Link>
      </div>

      {/* SVG Network */}
      <div className="relative z-10 flex-1 flex items-center justify-center py-12">
        <svg
          width="360"
          height="280"
          viewBox="0 0 360 280"
          fill="none"
          aria-hidden="true"
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
          <circle cx="180" cy="140" r="8" fill="#A99A80" opacity="0.8" />

          {/* Peripheral nodes */}
          <circle cx="80" cy="60" r="10" fill="rgba(130,151,125,0.15)" stroke="rgba(130,151,125,0.6)" strokeWidth="1" />
          <circle cx="80" cy="60" r="4" fill="#82977D" opacity="0.7" />

          <circle cx="280" cy="60" r="10" fill="rgba(169,154,128,0.1)" stroke="rgba(169,154,128,0.4)" strokeWidth="1" />
          <circle cx="280" cy="60" r="4" fill="#A99A80" opacity="0.5" />

          <circle cx="60" cy="200" r="10" fill="rgba(169,154,128,0.1)" stroke="rgba(169,154,128,0.4)" strokeWidth="1" />
          <circle cx="60" cy="200" r="4" fill="#A99A80" opacity="0.5" />

          <circle cx="300" cy="200" r="10" fill="rgba(130,151,125,0.12)" stroke="rgba(130,151,125,0.5)" strokeWidth="1" />
          <circle cx="300" cy="200" r="4" fill="#82977D" opacity="0.6" />

          {/* Node labels */}
          <text x="80" y="45" textAnchor="middle" fill="rgba(240,237,229,0.4)" fontSize="9" fontFamily="monospace">API-GATEWAY</text>
          <text x="280" y="45" textAnchor="middle" fill="rgba(240,237,229,0.4)" fontSize="9" fontFamily="monospace">AUTH-SVC</text>
          <text x="50" y="222" textAnchor="middle" fill="rgba(240,237,229,0.4)" fontSize="9" fontFamily="monospace">DB-PRIMARY</text>
          <text x="312" y="222" textAnchor="middle" fill="rgba(240,237,229,0.4)" fontSize="9" fontFamily="monospace">CACHE</text>
          <text x="180" y="167" textAnchor="middle" fill="rgba(240,237,229,0.5)" fontSize="9" fontFamily="monospace" fontWeight="bold">CAUSAL</text>

          {/* Animated pulse ring */}
          <circle cx="180" cy="140" r="18" fill="none" stroke="#A99A80" strokeWidth="1" opacity="0.3">
            <animate attributeName="r" from="18" to="36" dur="2.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.3" to="0" dur="2.5s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {/* Footer quote */}
      <div className="relative z-10">
        <blockquote
          style={{
            borderLeft: "2px solid rgba(169,154,128,0.35)",
            paddingLeft: 16,
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-serif)",
              fontStyle: "italic",
              fontSize: 14,
              lineHeight: 1.6,
              color: "rgba(240,237,229,0.55)",
            }}
          >
            &ldquo;See the cascade before it happens.&rdquo;
          </p>
          <cite
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "#736F66",
              marginTop: 6,
              display: "block",
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
      <div className="flex items-center justify-center h-full">
        <div
          style={{
            width: 24,
            height: 24,
            border: "2px solid rgba(169,154,128,0.2)",
            borderTopColor: "#A99A80",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center h-full px-8 py-12 max-w-[440px] mx-auto w-full">
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: "-0.03em",
            color: "#F0EDE5",
            margin: 0,
          }}
        >
          Sign in
        </h1>
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "#736F66",
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          Access the CAUSAL Resilience Platform
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          id="login-error-alert"
          style={{
            background: "rgba(200,80,60,0.1)",
            border: "1px solid rgba(200,80,60,0.35)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 24,
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(220,80,60)" strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "rgb(220,80,60)", lineHeight: 1.5 }}>
            {error}
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Email field */}
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="login-email"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#A7A398",
              display: "block",
              marginBottom: 7,
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
              background: "#191A17",
              border: "1px solid rgba(240,237,229,0.14)",
              borderRadius: 8,
              padding: "11px 14px",
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "#F0EDE5",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "rgba(169,154,128,0.6)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(240,237,229,0.14)";
            }}
          />
        </div>

        {/* Password field */}
        <div style={{ marginBottom: 28 }}>
          <label
            htmlFor="login-password"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#A7A398",
              display: "block",
              marginBottom: 7,
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
                background: "#191A17",
                border: "1px solid rgba(240,237,229,0.14)",
                borderRadius: 8,
                padding: "11px 44px 11px 14px",
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "#F0EDE5",
                outline: "none",
                boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(169,154,128,0.6)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(240,237,229,0.14)";
              }}
            />
            <button
              type="button"
              id="login-toggle-password"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#736F66",
                padding: 4,
                display: "flex",
                alignItems: "center",
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          id="login-submit-btn"
          disabled={isSubmitting || !email || !password}
          style={{
            width: "100%",
            background: isSubmitting || !email || !password ? "rgba(240,237,229,0.12)" : "#F0EDE5",
            color: isSubmitting || !email || !password ? "#736F66" : "#111210",
            border: "none",
            borderRadius: 8,
            padding: "12px 20px",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 600,
            cursor: isSubmitting || !email || !password ? "not-allowed" : "pointer",
            transition: "all 0.15s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          {isSubmitting ? (
            <>
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(17,18,16,0.2)",
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

      {/* Footer */}
      <p
        style={{
          marginTop: 28,
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "#736F66",
          textAlign: "center",
        }}
      >
        No account?{" "}
        <Link
          href="/signup"
          id="login-signup-link"
          style={{ color: "#A99A80", textDecoration: "none" }}
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
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: "#111210",
        }}
      >
        {/* Left: Infrastructure Visual */}
        <div
          style={{
            flex: "0 0 520px",
            display: "none",
          }}
          className="auth-left-panel"
        >
          <InfrastructureVisual />
        </div>

        {/* Right: Login Form */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            background: "#111210",
            borderLeft: "1px solid rgba(240,237,229,0.08)",
            minHeight: "100vh",
          }}
        >
          <Suspense fallback={<div />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>

      <style>{`
        @media (min-width: 900px) {
          .auth-left-panel {
            display: flex !important;
            flex-direction: column;
          }
        }
      `}</style>
    </>
  );
}
