/**
 * CAUSAL — Sign Up page (/signup)
 *
 * Split-screen layout matching /login:
 *   Left  — infrastructure-inspired animated visual
 *   Right — registration form with password strength and confirm validation
 *
 * On success: redirects to /app
 */

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
          top: "35%",
          left: "40%",
          width: "300px",
          height: "300px",
          background:
            "radial-gradient(circle, rgba(130,151,125,0.14) 0%, rgba(169,154,128,0.06) 50%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(40px)",
          transform: "translate(-50%, -50%)",
        }}
      />

      {/* Wordmark */}
      <div className="relative z-10">
        <Link href="/" className="inline-flex items-center gap-3">
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

      {/* SVG diagram */}
      <div className="relative z-10 flex-1 flex items-center justify-center py-12">
        <svg width="340" height="260" viewBox="0 0 340 260" fill="none" aria-hidden="true">
          {/* Concentric rings */}
          <circle cx="170" cy="130" r="100" stroke="rgba(240,237,229,0.04)" strokeWidth="1" />
          <circle cx="170" cy="130" r="70" stroke="rgba(169,154,128,0.08)" strokeWidth="1" />
          <circle cx="170" cy="130" r="40" stroke="rgba(169,154,128,0.15)" strokeWidth="1" />

          {/* Spokes */}
          <line x1="170" y1="30" x2="170" y2="60" stroke="rgba(169,154,128,0.3)" strokeWidth="1" />
          <line x1="170" y1="200" x2="170" y2="230" stroke="rgba(169,154,128,0.2)" strokeWidth="1" />
          <line x1="70" y1="130" x2="100" y2="130" stroke="rgba(169,154,128,0.2)" strokeWidth="1" />
          <line x1="240" y1="130" x2="270" y2="130" stroke="rgba(169,154,128,0.3)" strokeWidth="1" />

          {/* Diagonal spokes */}
          <line x1="100" y1="60" x2="142" y2="102" stroke="rgba(169,154,128,0.15)" strokeWidth="1" />
          <line x1="240" y1="60" x2="198" y2="102" stroke="rgba(169,154,128,0.15)" strokeWidth="1" />
          <line x1="100" y1="200" x2="142" y2="158" stroke="rgba(169,154,128,0.15)" strokeWidth="1" />
          <line x1="240" y1="200" x2="198" y2="158" stroke="rgba(169,154,128,0.15)" strokeWidth="1" />

          {/* Peripheral nodes */}
          {[
            [170, 30], [270, 130], [170, 230], [70, 130],
            [100, 60], [240, 60], [240, 200], [100, 200],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="6" fill="rgba(169,154,128,0.15)" stroke="rgba(169,154,128,0.4)" strokeWidth="1" />
          ))}

          {/* Inner ring nodes */}
          {[
            [170, 60], [240, 130], [170, 200], [100, 130],
          ].map(([cx, cy], i) => (
            <circle key={`inner-${i}`} cx={cx} cy={cy} r="4" fill="rgba(130,151,125,0.2)" stroke="rgba(130,151,125,0.5)" strokeWidth="1" />
          ))}

          {/* Core */}
          <circle cx="170" cy="130" r="16" fill="rgba(169,154,128,0.12)" stroke="#A99A80" strokeWidth="1.5" />
          <circle cx="170" cy="130" r="7" fill="#A99A80" />

          {/* Pulse */}
          <circle cx="170" cy="130" r="16" fill="none" stroke="#A99A80" strokeWidth="1" opacity="0.25">
            <animate attributeName="r" from="16" to="40" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" from="0.25" to="0" dur="3s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>

      {/* Footer text */}
      <div className="relative z-10">
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.06em",
            color: "#736F66",
            lineHeight: 1.6,
          }}
        >
          Join the CAUSAL platform. Your account will be set up with{" "}
          <span style={{ color: "#A99A80" }}>Viewer access</span>.
          <br />
          Contact your administrator to request elevated permissions.
        </p>
      </div>
    </div>
  );
}

// ── Password Strength ─────────────────────────────────────────

function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!password) return { score: 0, label: "", color: "transparent" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: "Weak", color: "rgba(200,80,60,0.8)" };
  if (score === 2) return { score, label: "Fair", color: "rgba(200,160,60,0.8)" };
  if (score === 3) return { score, label: "Good", color: "rgba(130,151,125,0.9)" };
  return { score, label: "Strong", color: "#82977D" };
}

// ── Sign-up Form ──────────────────────────────────────────────

function SignupForm() {
  const { register, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(password);
  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const canSubmit =
    displayName.trim().length >= 1 &&
    email.trim().length >= 3 &&
    password.length >= 8 &&
    password === confirmPassword &&
    !isSubmitting;

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/app");
    }
  }, [isAuthenticated, isLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);

    try {
      await register(email.trim(), displayName.trim(), password);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
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
      <div style={{ marginBottom: 36 }}>
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
          Create account
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
          Register for CAUSAL Resilience Platform access
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          id="signup-error-alert"
          style={{
            background: "rgba(200,80,60,0.1)",
            border: "1px solid rgba(200,80,60,0.35)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 22,
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
        {/* Display Name */}
        <div style={{ marginBottom: 18 }}>
          <label
            htmlFor="signup-display-name"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#A7A398", display: "block", marginBottom: 7 }}
          >
            Display Name
          </label>
          <input
            id="signup-display-name"
            type="text"
            autoComplete="name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={isSubmitting}
            placeholder="Your Name"
            style={{
              width: "100%", background: "#191A17", border: "1px solid rgba(240,237,229,0.14)", borderRadius: 8,
              padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#F0EDE5",
              outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.target.style.borderColor = "rgba(169,154,128,0.6)"; }}
            onBlur={(e) => { e.target.style.borderColor = "rgba(240,237,229,0.14)"; }}
          />
        </div>

        {/* Email */}
        <div style={{ marginBottom: 18 }}>
          <label
            htmlFor="signup-email"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#A7A398", display: "block", marginBottom: 7 }}
          >
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            placeholder="you@organization.com"
            style={{
              width: "100%", background: "#191A17", border: "1px solid rgba(240,237,229,0.14)", borderRadius: 8,
              padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#F0EDE5",
              outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.target.style.borderColor = "rgba(169,154,128,0.6)"; }}
            onBlur={(e) => { e.target.style.borderColor = "rgba(240,237,229,0.14)"; }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 8 }}>
          <label
            htmlFor="signup-password"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#A7A398", display: "block", marginBottom: 7 }}
          >
            Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="signup-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              placeholder="Min. 8 characters"
              style={{
                width: "100%", background: "#191A17", border: "1px solid rgba(240,237,229,0.14)", borderRadius: 8,
                padding: "11px 44px 11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#F0EDE5",
                outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.target.style.borderColor = "rgba(169,154,128,0.6)"; }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(240,237,229,0.14)"; }}
            />
            <button
              type="button"
              id="signup-toggle-password"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#736F66", padding: 4, display: "flex", alignItems: "center" }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>

          {/* Password strength bar */}
          {password.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i <= strength.score ? strength.color : "rgba(240,237,229,0.08)",
                      transition: "background 0.2s",
                    }}
                  />
                ))}
              </div>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: strength.color, margin: 0 }}>
                {strength.label}
              </p>
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div style={{ marginBottom: 26 }}>
          <label
            htmlFor="signup-confirm-password"
            style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#A7A398", display: "block", marginBottom: 7, marginTop: 14 }}
          >
            Confirm Password
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="signup-confirm-password"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
              placeholder="Re-enter password"
              style={{
                width: "100%", background: "#191A17",
                border: `1px solid ${confirmPassword && !passwordsMatch ? "rgba(200,80,60,0.5)" : "rgba(240,237,229,0.14)"}`,
                borderRadius: 8, padding: "11px 44px 11px 14px",
                fontFamily: "var(--font-mono)", fontSize: 13, color: "#F0EDE5",
                outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
              }}
              onFocus={(e) => { e.target.style.borderColor = passwordsMatch ? "rgba(169,154,128,0.6)" : "rgba(200,80,60,0.5)"; }}
              onBlur={(e) => { e.target.style.borderColor = confirmPassword && !passwordsMatch ? "rgba(200,80,60,0.5)" : "rgba(240,237,229,0.14)"; }}
            />
            <button
              type="button"
              id="signup-toggle-confirm"
              tabIndex={-1}
              onClick={() => setShowConfirm(!showConfirm)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#736F66", padding: 4, display: "flex", alignItems: "center" }}
              aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
            >
              {showConfirm ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(200,80,60,0.9)", marginTop: 5, marginBottom: 0 }}>
              Passwords do not match
            </p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          id="signup-submit-btn"
          disabled={!canSubmit}
          style={{
            width: "100%",
            background: canSubmit ? "#F0EDE5" : "rgba(240,237,229,0.12)",
            color: canSubmit ? "#111210" : "#736F66",
            border: "none", borderRadius: 8, padding: "12px 20px",
            fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
            transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {isSubmitting ? (
            <>
              <div style={{ width: 14, height: 14, border: "2px solid rgba(17,18,16,0.2)", borderTopColor: "#111210", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      {/* Footer */}
      <p
        style={{ marginTop: 28, fontFamily: "var(--font-mono)", fontSize: 12, color: "#736F66", textAlign: "center" }}
      >
        Already have an account?{" "}
        <Link
          href="/login"
          id="signup-login-link"
          style={{ color: "#A99A80", textDecoration: "none" }}
          onMouseEnter={(e) => { (e.target as HTMLAnchorElement).style.color = "#F0EDE5"; }}
          onMouseLeave={(e) => { (e.target as HTMLAnchorElement).style.color = "#A99A80"; }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function SignupPage() {
  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ minHeight: "100vh", display: "flex", background: "#111210" }}>
        {/* Left: Visual */}
        <div
          style={{ flex: "0 0 520px", display: "none" }}
          className="auth-left-panel"
        >
          <InfrastructureVisual />
        </div>

        {/* Right: Form */}
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column", justifyContent: "center",
            background: "#111210", borderLeft: "1px solid rgba(240,237,229,0.08)", minHeight: "100vh",
          }}
        >
          <SignupForm />
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
