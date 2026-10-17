/**
 * CAUSAL — Badge primitive.
 *
 * Semantic status badge for NodeState, EventSeverity, etc.
 * Uses master editorial color tokens: Sage, Amber, Oxide Red, Bronze, Stone.
 */

type BadgeVariant =
  | "normal"
  | "degraded"
  | "critical"
  | "failed"
  | "recovering"
  | "simulation"
  | "unknown"
  | "info"
  | "success"
  | "error"
  | "outline";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  dot?: boolean;
}

const badgeStyles: Record<BadgeVariant, { color: string; bg: string; border: string }> = {
  normal:     { color: "var(--color-status-normal)",     bg: "var(--color-status-normal-bg)",     border: "var(--color-status-normal-border)" },
  degraded:   { color: "var(--color-status-degraded)",   bg: "var(--color-status-degraded-bg)",   border: "var(--color-status-degraded-border)" },
  critical:   { color: "var(--color-status-critical)",   bg: "var(--color-status-critical-bg)",   border: "var(--color-status-critical-border)" },
  failed:     { color: "var(--color-status-failed)",     bg: "var(--color-status-failed-bg)",     border: "var(--color-status-failed-border)" },
  recovering: { color: "var(--color-status-recovering)", bg: "var(--color-status-recovering-bg)", border: "var(--color-status-recovering-border)" },
  simulation: { color: "var(--color-status-simulation)", bg: "var(--color-status-simulation-bg)", border: "var(--color-status-simulation-border)" },
  unknown:    { color: "var(--color-status-unknown)",    bg: "var(--color-status-unknown-bg)",    border: "var(--color-status-unknown-border)" },
  info:       { color: "var(--color-accent)",            bg: "var(--color-accent-muted)",         border: "rgba(169, 154, 128, 0.28)" },
  success:    { color: "var(--color-status-normal)",     bg: "var(--color-status-normal-bg)",     border: "var(--color-status-normal-border)" },
  error:      { color: "var(--color-status-failed)",     bg: "var(--color-status-failed-bg)",     border: "var(--color-status-failed-border)" },
  outline:    { color: "var(--color-text-secondary)",    bg: "transparent",                       border: "var(--color-border-default)" },
};

export function Badge({ variant = "unknown", children, dot = false }: BadgeProps) {
  const s = badgeStyles[variant] || badgeStyles.unknown;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.15rem 0.5rem",
        borderRadius: "var(--radius-full)",
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        fontFamily: "var(--font-mono)",
        lineHeight: 1.5,
      }}
    >
      {dot && (
        <span
          style={{
            width: "5px",
            height: "5px",
            borderRadius: "50%",
            backgroundColor: s.color,
            display: "block",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
