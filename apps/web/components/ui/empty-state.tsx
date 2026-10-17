/**
 * CAUSAL — EmptyState primitive.
 */

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon = "◈", action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "3rem 2rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-bg-elevated)",
          border: "1px solid var(--color-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.25rem",
          color: "var(--color-text-disabled)",
        }}
      >
        {icon}
      </div>

      <div>
        <h3
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--color-text-secondary)",
            marginBottom: "0.375rem",
          }}
        >
          {title}
        </h3>
        {description && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-text-tertiary)", maxWidth: "340px" }}>
            {description}
          </p>
        )}
      </div>

      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: "0.5rem 1.25rem",
            backgroundColor: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-default)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text-primary)",
            fontSize: "0.8125rem",
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
