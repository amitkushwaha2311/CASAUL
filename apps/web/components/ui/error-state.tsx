/**
 * CAUSAL — ErrorState primitive.
 */

interface ErrorStateProps {
  title?: string;
  message?: string;
  code?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  code,
  onRetry,
}: ErrorStateProps) {
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
      {/* Error icon */}
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-status-failed-bg)",
          border: "1px solid var(--color-status-failed-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="var(--color-status-failed)" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      </div>

      <div>
        <h3
          style={{
            fontSize: "1rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
            marginBottom: "0.375rem",
          }}
        >
          {title}
        </h3>
        <p style={{ fontSize: "0.875rem", color: "var(--color-text-tertiary)", maxWidth: "380px" }}>
          {message}
        </p>
        {code && (
          <p
            className="causal-text-mono"
            style={{ color: "var(--color-status-failed)", marginTop: "0.5rem", fontSize: "0.75rem" }}
          >
            {code}
          </p>
        )}
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
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
          Try again
        </button>
      )}
    </div>
  );
}
