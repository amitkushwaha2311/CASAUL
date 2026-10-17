/**
 * CAUSAL — StatusIndicator primitive.
 *
 * Dot + label combination for semantic operational status.
 */

import type { NodeState } from "@causal/shared/src/index";

interface StatusIndicatorProps {
  status: NodeState;
  label?: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

const statusColor: Record<NodeState, string> = {
  normal: "var(--color-status-normal)",
  degraded: "var(--color-status-degraded)",
  critical: "var(--color-status-critical)",
  failed: "var(--color-status-failed)",
  recovering: "var(--color-status-recovering)",
  simulation: "var(--color-status-simulation)",
  unknown: "var(--color-status-unknown)",
};

const statusLabel: Record<NodeState, string> = {
  normal: "Normal",
  degraded: "Degraded",
  critical: "Critical",
  failed: "Failed",
  recovering: "Recovering",
  simulation: "Simulation",
  unknown: "Unknown",
};

const dotSize: Record<"sm" | "md", number> = {
  sm: 6,
  md: 8,
};

export function StatusIndicator({
  status,
  label,
  size = "md",
  pulse = false,
}: StatusIndicatorProps) {
  const color = statusColor[status];
  const d = dotSize[size];

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <span
        className={pulse && status !== "normal" ? "causal-pulse" : undefined}
        style={{
          width: `${d}px`,
          height: `${d}px`,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 ${d + 2}px ${color}60`,
          display: "block",
          flexShrink: 0,
        }}
      />
      {label !== undefined ? (
        <span
          style={{
            fontSize: size === "sm" ? "0.75rem" : "0.8125rem",
            color: "var(--color-text-secondary)",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
      ) : (
        <span
          style={{
            fontSize: size === "sm" ? "0.75rem" : "0.8125rem",
            color: color,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.04em",
            fontWeight: 500,
          }}
        >
          {statusLabel[status]}
        </span>
      )}
    </div>
  );
}
