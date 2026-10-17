/**
 * CAUSAL — Panel primitive.
 *
 * Surface container for content grouping.
 * Supports elevation levels: base | elevated | interactive
 */

type PanelElevation = "base" | "elevated" | "interactive";

interface PanelProps {
  id?: string;
  children: React.ReactNode;
  elevation?: PanelElevation;
  padding?: string;
  style?: React.CSSProperties;
  className?: string;
}

const elevationBg: Record<PanelElevation, string> = {
  base: "var(--color-bg-surface)",
  elevated: "var(--color-bg-elevated)",
  interactive: "var(--color-bg-interactive)",
};

export function Panel({
  id,
  children,
  elevation = "base",
  padding = "1.25rem",
  style,
  className,
}: PanelProps) {
  return (
    <div
      id={id}
      className={className}
      style={{
        backgroundColor: elevationBg[elevation],
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-lg)",
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
