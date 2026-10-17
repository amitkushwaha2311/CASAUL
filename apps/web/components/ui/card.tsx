/**
 * CAUSAL — Card primitive.
 *
 * Semantic card for infrastructure nodes, incidents, or data items.
 */

interface CardProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  headerRight?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Card({ title, subtitle, children, headerRight, style }: CardProps) {
  return (
    <div
      style={{
        backgroundColor: "var(--color-bg-surface)",
        border: "1px solid var(--color-border-subtle)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Card header */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderBottom: children ? "1px solid var(--color-border-subtle)" : "none",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <h3
            style={{
              fontSize: "0.9375rem",
              fontWeight: 600,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.01em",
              margin: 0,
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-tertiary)",
                marginTop: "0.125rem",
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {headerRight && <div style={{ flexShrink: 0 }}>{headerRight}</div>}
      </div>

      {/* Card body */}
      {children && (
        <div style={{ padding: "1rem 1.25rem" }}>{children}</div>
      )}
    </div>
  );
}
