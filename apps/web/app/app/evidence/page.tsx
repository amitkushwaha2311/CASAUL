"use client";

/**
 * CAUSAL — /app/evidence
 *
 * Phase 5: Evidence Audit Trail Browser
 *
 * A forensic read-only view of the causal evidence record store.
 * Allows operators to:
 *   - Browse all persisted hypotheses across all graphs
 *   - Filter by graph, status, hypothesis type, and evidence direction
 *   - Inspect full traceable evidence chains (supporting + contradicting)
 *   - Audit evidence completeness, confidence, and unresolved assumptions
 *   - Review uncertainty notes and missing information records
 *
 * This is NOT the inference runner (see /app/causal) — it is the
 * read-only audit record of all previously generated and persisted hypotheses.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import type {
  GraphResponse,
  HypothesisResponse,
  EvidenceItemResponse,
  HypothesisStatus,
  HypothesisType,
  EvidenceDirection,
} from "@causal/shared/src/index";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  HypothesisStatus,
  { label: string; bg: string; text: string; border: string; icon: string; desc: string }
> = {
  SUPPORTED: {
    label: "Supported",
    bg: "rgba(16, 185, 129, 0.1)",
    text: "#10b981",
    border: "rgba(16, 185, 129, 0.3)",
    icon: "✓",
    desc: "Observed evidence is consistent with this causal mechanism.",
  },
  POSSIBLE: {
    label: "Possible",
    bg: "rgba(245, 158, 11, 0.1)",
    text: "#f59e0b",
    border: "rgba(245, 158, 11, 0.3)",
    icon: "?",
    desc: "Plausible mechanism; key telemetry or history is incomplete.",
  },
  CONTRADICTED: {
    label: "Contradicted",
    bg: "rgba(239, 68, 68, 0.1)",
    text: "#ef4444",
    border: "rgba(239, 68, 68, 0.3)",
    icon: "✗",
    desc: "Contradicted by direct observations confirming operational normality.",
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient",
    bg: "rgba(100, 116, 139, 0.12)",
    text: "#94a3b8",
    border: "rgba(100, 116, 139, 0.3)",
    icon: "—",
    desc: "Available observations do not contain enough data to evaluate.",
  },
};

const HYPOTHESIS_TYPE_LABELS: Record<HypothesisType, string> = {
  UPSTREAM_FAILURE: "Upstream Dependency Failure",
  LOCAL_FAILURE: "Local Internal Failure",
  TELEMETRY_ANOMALY: "Telemetry / Sensor Anomaly",
  UNKNOWN_CAUSE: "Unknown Cause",
};

const DIRECTION_CONFIG: Record<
  EvidenceDirection,
  { color: string; bg: string; label: string }
> = {
  SUPPORTING: { color: "#10b981", bg: "rgba(16,185,129,0.07)", label: "Supporting" },
  CONTRADICTING: { color: "#ef4444", bg: "rgba(239,68,68,0.07)", label: "Contradicting" },
  NEUTRAL: { color: "#94a3b8", bg: "transparent", label: "Neutral" },
};

// ── Utility Helpers ────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 10) return "Just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const m = Math.floor(diffSec / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function completenessColor(v: number): string {
  if (v >= 0.75) return "#10b981";
  if (v >= 0.45) return "#f59e0b";
  return "#ef4444";
}

function confidenceLabel(v: number | null): string {
  if (v === null || v === undefined) return "Unknown";
  if (v >= 0.8) return "Very High";
  if (v >= 0.6) return "High";
  if (v >= 0.4) return "Moderate";
  if (v >= 0.2) return "Low";
  return "Very Low";
}

// ── Sub-components ─────────────────────────────────────────────────────────

function HypothesisCard({
  hypothesis,
  graphName,
  selected,
  onClick,
}: {
  hypothesis: HypothesisResponse;
  graphName: string;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[hypothesis.status] ?? STATUS_CONFIG.INSUFFICIENT_EVIDENCE;
  const typeCfg = HYPOTHESIS_TYPE_LABELS[hypothesis.hypothesis_type] ?? hypothesis.hypothesis_type;

  return (
    <div
      onClick={onClick}
      style={{
        padding: "1rem 1.125rem",
        borderRadius: "var(--radius-md)",
        border: selected
          ? "1px solid var(--color-accent)"
          : "1px solid var(--color-border-subtle)",
        backgroundColor: selected
          ? "var(--color-bg-elevated)"
          : "var(--color-bg-surface)",
        cursor: "pointer",
        transition: "all 0.15s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = "var(--color-border-default)";
          e.currentTarget.style.backgroundColor = "var(--color-bg-elevated)";
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = "var(--color-border-subtle)";
          e.currentTarget.style.backgroundColor = "var(--color-bg-surface)";
        }
      }}
    >
      {/* Status stripe */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "3px",
          backgroundColor: cfg.text,
          borderRadius: "var(--radius-md) 0 0 var(--radius-md)",
        }}
      />

      <div style={{ paddingLeft: "0.5rem" }}>
        {/* Header Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "0.5rem",
            gap: "0.5rem",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--color-text-primary)",
                display: "block",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {hypothesis.candidate_cause_factor}
            </span>
            <span
              style={{
                fontSize: "0.6875rem",
                color: "var(--color-text-tertiary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {typeCfg}
            </span>
          </div>

          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "0.15rem 0.45rem",
              borderRadius: "var(--radius-sm)",
              backgroundColor: cfg.bg,
              color: cfg.text,
              border: `1px solid ${cfg.border}`,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {cfg.icon} {cfg.label}
          </span>
        </div>

        {/* Completeness bar */}
        <div
          style={{
            height: 3,
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--color-bg-base)",
            overflow: "hidden",
            marginBottom: "0.5rem",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${hypothesis.evidence_completeness * 100}%`,
              backgroundColor: completenessColor(hypothesis.evidence_completeness),
              transition: "width 0.4s ease",
            }}
          />
        </div>

        {/* Footer Row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: "0.6875rem",
            color: "var(--color-text-tertiary)",
          }}
        >
          <span>{graphName}</span>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {(hypothesis.evidence_completeness * 100).toFixed(0)}% complete
          </span>
        </div>
      </div>
    </div>
  );
}

function EvidenceDetailPanel({
  hypothesis,
  evidence,
  evidenceLoading,
  graphName,
}: {
  hypothesis: HypothesisResponse;
  evidence: EvidenceItemResponse[];
  evidenceLoading: boolean;
  graphName: string;
}) {
  const cfg = STATUS_CONFIG[hypothesis.status] ?? STATUS_CONFIG.INSUFFICIENT_EVIDENCE;
  const supporting = evidence.filter((e) => e.direction === "SUPPORTING");
  const contradicting = evidence.filter((e) => e.direction === "CONTRADICTING");
  const neutral = evidence.filter((e) => e.direction === "NEUTRAL");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              marginBottom: "0.375rem",
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                fontSize: "1.125rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                margin: 0,
                color: "var(--color-text-primary)",
              }}
            >
              {HYPOTHESIS_TYPE_LABELS[hypothesis.hypothesis_type] ??
                hypothesis.hypothesis_type}
            </h2>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "0.2rem 0.55rem",
                borderRadius: "var(--radius-sm)",
                backgroundColor: cfg.bg,
                color: cfg.text,
                border: `1px solid ${cfg.border}`,
              }}
            >
              {cfg.icon} {cfg.label}
            </span>
          </div>
          <div
            style={{
              fontSize: "0.6875rem",
              color: "var(--color-text-tertiary)",
              fontFamily: "var(--font-mono)",
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <span>ID: {hypothesis.id}</span>
            <span>Graph: {graphName}</span>
            <span>Rule: {hypothesis.inference_rule_id} v{hypothesis.rule_version}</span>
            <span>Created: {formatRelativeTime(hypothesis.created_at)}</span>
          </div>
        </div>

        {/* Completeness metric */}
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: completenessColor(hypothesis.evidence_completeness),
            }}
          >
            {(hypothesis.evidence_completeness * 100).toFixed(0)}%
          </div>
          <div
            style={{
              fontSize: "0.625rem",
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Completeness
          </div>
        </div>
      </div>

      {/* Candidate Cause */}
      <div
        style={{
          padding: "0.875rem 1rem",
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--color-bg-base)",
          border: "1px solid var(--color-border-subtle)",
        }}
      >
        <div
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginBottom: "0.375rem",
          }}
        >
          Candidate Cause Factor
        </div>
        <div
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          {hypothesis.candidate_cause_factor}
        </div>
      </div>

      {/* Explanation */}
      <div>
        <div
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: "var(--color-text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "0.375rem",
          }}
        >
          Inference Explanation
        </div>
        <p
          style={{
            fontSize: "0.875rem",
            color: "var(--color-text-secondary)",
            lineHeight: 1.6,
            margin: "0 0 0.5rem",
          }}
        >
          {hypothesis.explanation}
        </p>
        <div
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "rgba(59,130,246,0.07)",
            border: "1px solid rgba(59,130,246,0.2)",
            fontSize: "0.75rem",
            color: "var(--color-text-secondary)",
            fontStyle: "italic",
          }}
        >
          ℹ {cfg.desc}
        </div>
      </div>

      {/* Distinguishing Information */}
      {hypothesis.distinguishing_information && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-bg-base)",
            borderLeft: "3px solid var(--color-accent)",
            border: "1px solid var(--color-border-subtle)",
            borderLeftWidth: "3px",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.375rem",
            }}
          >
            Distinguishing Information
          </div>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {hypothesis.distinguishing_information}
          </p>
        </div>
      )}

      {/* Uncertainty Notes */}
      {hypothesis.uncertainty_notes && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "#f59e0b",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.375rem",
            }}
          >
            ⚠ Uncertainty Notes
          </div>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--color-text-secondary)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {hypothesis.uncertainty_notes}
          </p>
        </div>
      )}

      {/* Assumptions & Missing Evidence */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div
          style={{
            padding: "0.875rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-bg-base)",
            border: "1px solid var(--color-border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            Unresolved Assumptions
            <span
              style={{
                fontSize: "0.625rem",
                padding: "0.1rem 0.35rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-subtle)",
                color: "var(--color-text-secondary)",
              }}
            >
              {hypothesis.unresolved_assumptions.length}
            </span>
          </div>
          {hypothesis.unresolved_assumptions.length === 0 ? (
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
              None recorded.
            </span>
          ) : (
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.125rem",
                fontSize: "0.75rem",
                color: "var(--color-text-secondary)",
                lineHeight: 1.6,
              }}
            >
              {hypothesis.unresolved_assumptions.map((u, i) => (
                <li key={i}>{u}</li>
              ))}
            </ul>
          )}
        </div>

        <div
          style={{
            padding: "0.875rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-bg-base)",
            border: "1px solid var(--color-border-subtle)",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            Missing Evidence
            <span
              style={{
                fontSize: "0.625rem",
                padding: "0.1rem 0.35rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-subtle)",
                color: "var(--color-text-secondary)",
              }}
            >
              {hypothesis.missing_evidence.length}
            </span>
          </div>
          {hypothesis.missing_evidence.length === 0 ? (
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-tertiary)" }}>
              None recorded.
            </span>
          ) : (
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.125rem",
                fontSize: "0.75rem",
                color: "#f59e0b",
                lineHeight: 1.6,
              }}
            >
              {hypothesis.missing_evidence.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Evidence Items */}
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--color-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Traceable Evidence Records ({evidence.length})
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {supporting.length > 0 && (
              <span
                style={{
                  fontSize: "0.6875rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "rgba(16,185,129,0.1)",
                  color: "#10b981",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}
              >
                ✓ {supporting.length} Supporting
              </span>
            )}
            {contradicting.length > 0 && (
              <span
                style={{
                  fontSize: "0.6875rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "rgba(239,68,68,0.1)",
                  color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.25)",
                }}
              >
                ✗ {contradicting.length} Contradicting
              </span>
            )}
            {neutral.length > 0 && (
              <span
                style={{
                  fontSize: "0.6875rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "var(--color-bg-elevated)",
                  color: "var(--color-text-tertiary)",
                  border: "1px solid var(--color-border-subtle)",
                }}
              >
                — {neutral.length} Neutral
              </span>
            )}
          </div>
        </div>

        {evidenceLoading ? (
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              color: "var(--color-text-tertiary)",
              fontSize: "0.8125rem",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <span className="causal-pulse" style={{ display: "inline-block" }}>
              Loading evidence records...
            </span>
          </div>
        ) : evidence.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "2rem",
              color: "var(--color-text-tertiary)",
              fontSize: "0.8125rem",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-bg-base)",
            }}
          >
            No evidence records linked to this hypothesis.
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-md)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--color-border-subtle)",
                    backgroundColor: "var(--color-bg-base)",
                  }}
                >
                  {[
                    "Direction",
                    "Record Type",
                    "Record ID",
                    "Metric",
                    "Observed",
                    "Confidence",
                    "Relevance",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "0.5rem 0.75rem",
                        textAlign: "left",
                        color: "var(--color-text-tertiary)",
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        fontSize: "0.625rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evidence.map((ev, idx) => {
                  const dirCfg = DIRECTION_CONFIG[ev.direction] ?? DIRECTION_CONFIG.NEUTRAL;
                  return (
                    <tr
                      key={ev.id}
                      style={{
                        borderBottom:
                          idx < evidence.length - 1
                            ? "1px solid var(--color-border-subtle)"
                            : "none",
                        backgroundColor: dirCfg.bg,
                      }}
                    >
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: dirCfg.color,
                            fontSize: "0.6875rem",
                            letterSpacing: "0.02em",
                          }}
                        >
                          {dirCfg.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          fontFamily: "var(--font-mono)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {ev.record_type}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          fontFamily: "var(--font-mono)",
                          color: "var(--color-text-tertiary)",
                        }}
                        title={ev.record_id}
                      >
                        {ev.record_id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem", color: "var(--color-text-secondary)" }}>
                        {ev.metric_name ?? "—"}
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          color: "var(--color-text-secondary)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {ev.observed_at ? formatRelativeTime(ev.observed_at) : "—"}
                      </td>
                      <td style={{ padding: "0.5rem 0.75rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "4px",
                              borderRadius: "var(--radius-full)",
                              backgroundColor: "var(--color-bg-elevated)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${(ev.confidence ?? 0) * 100}%`,
                                backgroundColor:
                                  ev.confidence === null
                                    ? "var(--color-text-disabled)"
                                    : ev.confidence >= 0.6
                                    ? "#10b981"
                                    : ev.confidence >= 0.3
                                    ? "#f59e0b"
                                    : "#ef4444",
                              }}
                            />
                          </div>
                          <span style={{ color: "var(--color-text-secondary)", fontSize: "0.6875rem" }}>
                            {confidenceLabel(ev.confidence)}
                          </span>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "0.5rem 0.75rem",
                          color: "var(--color-text-secondary)",
                          maxWidth: "220px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={ev.relevance_explanation}
                      >
                        {ev.relevance_explanation}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function EvidenceAuditPage() {
  const router = useRouter();
  const [graphs, setGraphs] = useState<GraphResponse[]>([]);
  const [selectedGraphId, setSelectedGraphId] = useState<string | null>(null);

  const [hypotheses, setHypotheses] = useState<HypothesisResponse[]>([]);
  const [selectedHypothesis, setSelectedHypothesis] = useState<HypothesisResponse | null>(null);
  const [evidence, setEvidence] = useState<EvidenceItemResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [hypothesesLoading, setHypothesesLoading] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Load graphs
  useEffect(() => {
    apiClient
      .listGraphs()
      .then((gs) => {
        setGraphs(gs);
        if (gs.length > 0) setSelectedGraphId(gs[0].id);
      })
      .catch((err) => setError(err.message ?? "Failed to load graphs"))
      .finally(() => setLoading(false));
  }, []);

  // Load hypotheses when graph changes
  const loadHypotheses = useCallback(async (graphId: string) => {
    setHypothesesLoading(true);
    setHypotheses([]);
    setSelectedHypothesis(null);
    setEvidence([]);
    setError(null);
    try {
      const hs = await apiClient.listHypotheses(graphId);
      setHypotheses(hs);
      if (hs.length > 0) setSelectedHypothesis(hs[0]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load hypotheses");
    } finally {
      setHypothesesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedGraphId) loadHypotheses(selectedGraphId);
  }, [selectedGraphId, loadHypotheses]);

  // Load evidence when hypothesis changes
  useEffect(() => {
    if (!selectedGraphId || !selectedHypothesis) {
      setEvidence([]);
      return;
    }
    setEvidenceLoading(true);
    apiClient
      .getHypothesisEvidence(selectedGraphId, selectedHypothesis.id)
      .then((evs) => setEvidence(evs))
      .catch(() => setEvidence([]))
      .finally(() => setEvidenceLoading(false));
  }, [selectedGraphId, selectedHypothesis]);

  // Filtered hypotheses
  const filteredHypotheses = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return hypotheses.filter((h) => {
      if (filterStatus !== "ALL" && h.status !== filterStatus) return false;
      if (filterType !== "ALL" && h.hypothesis_type !== filterType) return false;
      if (
        q &&
        !h.candidate_cause_factor.toLowerCase().includes(q) &&
        !h.explanation.toLowerCase().includes(q)
      )
        return false;
      return true;
    });
  }, [hypotheses, filterStatus, filterType, searchQuery]);

  // Aggregate stats
  const stats = useMemo(() => {
    const supported = hypotheses.filter((h) => h.status === "SUPPORTED").length;
    const possible = hypotheses.filter((h) => h.status === "POSSIBLE").length;
    const contradicted = hypotheses.filter((h) => h.status === "CONTRADICTED").length;
    const insufficient = hypotheses.filter((h) => h.status === "INSUFFICIENT_EVIDENCE").length;
    const avgCompleteness =
      hypotheses.length > 0
        ? hypotheses.reduce((s, h) => s + h.evidence_completeness, 0) / hypotheses.length
        : 0;
    return { supported, possible, contradicted, insufficient, avgCompleteness };
  }, [hypotheses]);

  const selectedGraph = graphs.find((g) => g.id === selectedGraphId);

  // ── Render States ──────────────────────────────────────────────────────────

  if (loading) {
    return <LoadingState message="Loading evidence audit trail..." />;
  }

  if (error && graphs.length === 0) {
    return (
      <div style={{ padding: "3rem 1.5rem", maxWidth: 800, margin: "0 auto" }}>
        <ErrorState
          title="Evidence Audit Unavailable"
          message={error}
          code="ERR_EVIDENCE_LOAD_FAILED"
          onRetry={() => selectedGraphId && loadHypotheses(selectedGraphId)}
        />
      </div>
    );
  }

  if (!loading && graphs.length === 0) {
    return (
      <div style={{ padding: "3rem 1.5rem", maxWidth: 700, margin: "0 auto" }}>
        <EmptyState
          title="No Infrastructure Graphs"
          description="No graphs available to browse evidence records for. Register and configure infrastructure graphs first."
          icon="⊘"
        />
      </div>
    );
  }

  return (
    <div className="causal-fade-in" style={{ padding: "1.5rem", maxWidth: 1600, margin: "0 auto" }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}
          >
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
              Evidence Audit Trail
            </h1>
            <Badge variant="info">Phase 5</Badge>
          </div>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            Forensic read-only browser of persisted causal hypothesis evidence records.
          </p>
        </div>

        {/* Graph selector */}
        <select
          id="evidence-graph-select"
          value={selectedGraphId ?? ""}
          onChange={(e) => setSelectedGraphId(e.target.value)}
          style={{
            padding: "0.5rem 0.75rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-bg-surface)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-subtle)",
            fontSize: "0.875rem",
            minWidth: "180px",
          }}
        >
          {graphs.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Epistemological Disclaimer ───────────────────────────── */}
      <div
        style={{
          padding: "0.75rem 1rem",
          marginBottom: "1.25rem",
          backgroundColor: "rgba(59,130,246,0.07)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.625rem",
          fontSize: "0.8125rem",
          color: "var(--color-text-secondary)",
          lineHeight: 1.5,
        }}
      >
        <span style={{ fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}>ℹ</span>
        <span>
          <strong style={{ color: "var(--color-text-primary)" }}>Audit Record Notice: </strong>
          This view shows read-only evidence from previously executed causal inference runs.
          Hypotheses are candidate explanatory models — not confirmed root causes.
          To run new causal inference, use the{" "}
          <a href="/app/causal" style={{ color: "var(--color-accent)", textDecoration: "none" }}>
            Causal Reasoning Engine →
          </a>
        </span>
      </div>

      {/* ── Aggregate Stats ──────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.25rem",
        }}
      >
        {[
          { id: "stat-ev-total", label: "Total Hypotheses", value: hypotheses.length, color: "var(--color-text-primary)" },
          { id: "stat-ev-supported", label: "Supported", value: stats.supported, color: "#10b981" },
          { id: "stat-ev-possible", label: "Possible", value: stats.possible, color: "#f59e0b" },
          { id: "stat-ev-contradicted", label: "Contradicted", value: stats.contradicted, color: "#ef4444" },
          { id: "stat-ev-insufficient", label: "Insufficient", value: stats.insufficient, color: "var(--color-text-tertiary)" },
          { id: "stat-ev-completeness", label: "Avg. Completeness", value: `${(stats.avgCompleteness * 100).toFixed(0)}%`, color: completenessColor(stats.avgCompleteness) },
        ].map(({ id, label, value, color }) => (
          <div
            key={id}
            id={id}
            style={{
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-subtle)",
            }}
          >
            <div className="causal-label" style={{ fontSize: "0.6rem", marginBottom: "0.25rem" }}>
              {label}
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
                color,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: "0.625rem",
          marginBottom: "1.25rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          id="evidence-search"
          type="text"
          placeholder="Search cause factor or explanation..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            flex: 1,
            minWidth: "200px",
            padding: "0.5rem 0.75rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-bg-surface)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-subtle)",
            fontSize: "0.875rem",
            outline: "none",
          }}
        />

        <select
          id="evidence-filter-status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: "0.5rem 0.625rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-bg-surface)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-subtle)",
            fontSize: "0.8125rem",
          }}
        >
          <option value="ALL">All Statuses</option>
          <option value="SUPPORTED">Supported</option>
          <option value="POSSIBLE">Possible</option>
          <option value="CONTRADICTED">Contradicted</option>
          <option value="INSUFFICIENT_EVIDENCE">Insufficient Evidence</option>
        </select>

        <select
          id="evidence-filter-type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: "0.5rem 0.625rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "var(--color-bg-surface)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border-subtle)",
            fontSize: "0.8125rem",
          }}
        >
          <option value="ALL">All Types</option>
          <option value="UPSTREAM_FAILURE">Upstream Failure</option>
          <option value="LOCAL_FAILURE">Local Failure</option>
          <option value="TELEMETRY_ANOMALY">Telemetry Anomaly</option>
          <option value="UNKNOWN_CAUSE">Unknown Cause</option>
        </select>

        {(filterStatus !== "ALL" || filterType !== "ALL" || searchQuery !== "") && (
          <button
            id="evidence-clear-filters"
            onClick={() => {
              setFilterStatus("ALL");
              setFilterType("ALL");
              setSearchQuery("");
            }}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "transparent",
              color: "var(--color-text-tertiary)",
              border: "1px solid var(--color-border-subtle)",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            ✕ Clear
          </button>
        )}

        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.75rem",
            color: "var(--color-text-tertiary)",
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
          }}
        >
          {filteredHypotheses.length} / {hypotheses.length} shown
        </span>
      </div>

      {/* ── Main Split Layout ──────────────────────────────────────── */}
      {hypothesesLoading ? (
        <LoadingState message="Loading hypothesis records..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => selectedGraphId && loadHypotheses(selectedGraphId)}
        />
      ) : hypotheses.length === 0 ? (
        <EmptyState
          title="No Hypotheses on Record"
          description={`No causal hypotheses have been generated for "${selectedGraph?.name ?? "this graph"}" yet. Run causal analysis from the Causal Reasoning Engine to generate and persist evidence records.`}
          icon="⊘"
          action={{ label: "Go to Causal Engine →", onClick: () => { router.push("/app/causal"); } }}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "340px 1fr",
            gap: "1.25rem",
            alignItems: "start",
          }}
        >
          {/* Left: Hypothesis List */}
          <div
            style={{
              backgroundColor: "var(--color-bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-subtle)",
              overflow: "hidden",
              position: "sticky",
              top: "1.5rem",
              maxHeight: "calc(100vh - 3rem)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "1rem 1.125rem",
                borderBottom: "1px solid var(--color-border-subtle)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h2 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0 }}>
                Hypotheses
              </h2>
              <span
                style={{
                  fontSize: "0.6875rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-subtle)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {filteredHypotheses.length}
              </span>
            </div>

            <div
              style={{
                overflowY: "auto",
                padding: "0.75rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                flex: 1,
              }}
            >
              {filteredHypotheses.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem 1rem",
                    color: "var(--color-text-tertiary)",
                    fontSize: "0.8125rem",
                  }}
                >
                  No hypotheses match the current filters.
                </div>
              ) : (
                filteredHypotheses.map((h) => (
                  <HypothesisCard
                    key={h.id}
                    hypothesis={h}
                    graphName={selectedGraph?.name ?? "—"}
                    selected={selectedHypothesis?.id === h.id}
                    onClick={() => setSelectedHypothesis(h)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right: Evidence Detail */}
          <div
            style={{
              backgroundColor: "var(--color-bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--color-border-subtle)",
              padding: "1.5rem",
            }}
          >
            {selectedHypothesis ? (
              <EvidenceDetailPanel
                hypothesis={selectedHypothesis}
                evidence={evidence}
                evidenceLoading={evidenceLoading}
                graphName={selectedGraph?.name ?? "—"}
              />
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "4rem 2rem",
                  color: "var(--color-text-tertiary)",
                  fontSize: "0.875rem",
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>⊘</div>
                Select a hypothesis from the list to inspect its evidence trail.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
