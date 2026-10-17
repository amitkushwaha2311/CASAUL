/**
 * CAUSAL — Placeholder page component.
 *
 * Shared component for Phase 1 feature placeholder pages.
 * Clean, professional indicator that this feature is under construction.
 */

interface PlaceholderPageProps {
  feature: string;
  phase: string;
  description: string;
  icon: string;
}

export function PlaceholderPage({
  feature,
  phase,
  description,
  icon,
}: PlaceholderPageProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        gap: "1.5rem",
        textAlign: "center",
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: "64px",
          height: "64px",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-bg-surface)",
          border: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.75rem",
        }}
      >
        {icon}
      </div>

      {/* Product name */}
      <div>
        <p className="causal-label" style={{ marginBottom: "0.5rem" }}>
          CAUSAL
        </p>
        <h1
          style={{
            fontSize: "1.875rem",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: "0.5rem",
          }}
        >
          {feature}
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-text-tertiary)",
            maxWidth: "420px",
          }}
        >
          {description}
        </p>
      </div>

      {/* Phase badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.375rem 1rem",
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--color-border-default)",
          backgroundColor: "var(--color-bg-surface)",
        }}
      >
        <svg
          width="12"
          height="12"
          fill="none"
          viewBox="0 0 24 24"
          stroke="var(--color-text-tertiary)"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <span
          className="causal-text-mono"
          style={{ color: "var(--color-text-tertiary)", fontSize: "0.75rem" }}
        >
          {phase} · Under Construction
        </span>
      </div>
    </div>
  );
}
