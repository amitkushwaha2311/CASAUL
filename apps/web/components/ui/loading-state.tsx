/**
 * CAUSAL — LoadingState primitive.
 */

interface LoadingStateProps {
  message?: string;
  fullHeight?: boolean;
}

export function LoadingState({
  message = "Loading…",
  fullHeight = false,
}: LoadingStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "3rem 2rem",
        ...(fullHeight ? { minHeight: "100%" } : {}),
      }}
    >
      {/* Spinner */}
      <div
        style={{
          width: "32px",
          height: "32px",
          border: "2px solid var(--color-border-default)",
          borderTopColor: "var(--color-accent)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p
        className="causal-text-mono"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {message}
      </p>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
