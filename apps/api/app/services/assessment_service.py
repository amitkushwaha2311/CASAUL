"""
CAUSAL API — Phase 10: Resilience Assessment Service.

Assembles a ResilienceAssessment from existing Phase 2–9 persisted records.

Design constraints:
  - NEVER reruns inference, forecasting, counterfactual, or recommendation engines.
  - NEVER fabricates metrics — all unavailable values are explicitly surfaced.
  - NEVER silently combines incompatible records (cross-graph, cross-run, etc.).
  - Does NOT modify any Phase 1–9 tables (nodes, events, state_history, etc.).
  - Uses paginated queries to avoid N+1 patterns.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.assessment_models import AssessmentStatus, ResilienceAssessment
from app.models.causal_models import (
    CausalHypothesis,
    CausalInferenceRun,
    EvidenceDirection,
    HypothesisEvidence,
    HypothesisStatus,
)
from app.models.cascade_models import (
    CascadeForecastRun,
    CascadeNodeForecastStatus,
)
from app.models.counterfactual_models import (
    CounterfactualComparison,
    CounterfactualExperiment,
)
from app.models.event_models import Event, EventStatus
from app.models.graph_models import Dependency, InfrastructureGraph, Node, NodeState
from app.models.recommendation_models import (
    CandidateIntervention,
    DecisionStatus,
    EligibilityStatus,
    InterventionRecommendationRun,
    SafetyStatus,
)
from app.models.state_models import StateBaseline, StateSnapshot
from app.models.user import User
from app.schemas.assessment import (
    AssessmentCreate,
    AssessmentDecisions,
    AssessmentEvidenceLineage,
    AssessmentGraphSummary,
    AssessmentImpactSummary,
    AssessmentListItem,
    AssessmentListResponse,
    AssessmentResponse,
    CandidateSummary,
    CounterfactualSummaryItem,
    EvidenceLineageItem,
    ForecastNodeSummary,
    HypothesisSummary,
    SourceReference,
)

logger = get_logger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

_MODEL_VERSION = "10.0.0"
_ASSESSMENT_LIMITATIONS = [
    "Assessments are assembled from persisted records at creation time. "
    "They do not update automatically if upstream records change.",
    "Heuristic scores and propagation probabilities are estimates, "
    "not calibrated probabilities.",
    "Causal hypotheses are model-generated inferences. "
    "They may be incorrect and should be verified by domain experts.",
    "Counterfactual outcomes are simulation estimates under idealized assumptions.",
]

# ── Internal helpers ──────────────────────────────────────────────────────────


def _ref(record_type: str, record_id: Any, description: str, timestamp: datetime | None = None) -> SourceReference:
    return SourceReference(
        record_type=record_type,
        record_id=str(record_id),
        description=description,
        timestamp=timestamp,
    )


async def _validate_graph_ownership(
    db: AsyncSession,
    graph_id: uuid.UUID,
    record_type: str,
    record_id: uuid.UUID,
    actual_graph_id: uuid.UUID,
) -> list[str]:
    """Return a warning list if record does not belong to the expected graph."""
    if actual_graph_id != graph_id:
        return [
            f"{record_type} {record_id} belongs to graph {actual_graph_id}, "
            f"not {graph_id}. This reference has been excluded."
        ]
    return []


# ── Public service ────────────────────────────────────────────────────────────


class AssessmentService:
    """Assembles and retrieves resilience assessments."""

    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── CREATE ──────────────────────────────────────────────────────────────

    async def create_assessment(
        self,
        graph_id: uuid.UUID,
        data: AssessmentCreate,
        actor: User,
    ) -> ResilienceAssessment:
        """
        Assemble a new ResilienceAssessment from existing records.

        Validates graph ownership for every referenced record.
        Returns a PARTIAL assessment if some sources are missing/incompatible.
        Returns a FAILED assessment only on unrecoverable errors.
        """
        missing: list[str] = []
        warnings: list[str] = []
        limitations: list[str] = list(_ASSESSMENT_LIMITATIONS)

        # Validate each referenced record belongs to this graph
        baseline_id = await self._validate_baseline(
            graph_id, data.baseline_id, missing, warnings
        )
        snapshot_id = await self._validate_snapshot(
            graph_id, data.snapshot_id, missing, warnings
        )
        causal_run_id = await self._validate_causal_run(
            graph_id, data.causal_run_id, missing, warnings
        )
        forecast_run_id = await self._validate_forecast_run(
            graph_id, data.forecast_run_id, missing, warnings
        )
        cf_exp_id = await self._validate_counterfactual(
            graph_id, data.counterfactual_experiment_id, missing, warnings
        )
        rec_run_id = await self._validate_recommendation_run(
            graph_id, data.recommendation_run_id, missing, warnings
        )

        # Assemble per-section summaries from DB (no engine re-execution)
        graph_summary = await self._build_graph_summary(graph_id)
        impact_summary = await self._build_impact_summary(
            graph_id, causal_run_id, forecast_run_id, cf_exp_id, rec_run_id
        )
        uncertainty_summary = await self._build_uncertainty_summary(
            graph_id, forecast_run_id, cf_exp_id
        )
        recommendation_summary = await self._build_recommendation_summary(
            graph_id, rec_run_id
        )

        status = (
            AssessmentStatus.PARTIAL
            if (missing or warnings)
            else AssessmentStatus.READY
        )

        assessment = ResilienceAssessment(
            graph_id=graph_id,
            name=data.name,
            description=data.description,
            status=status,
            baseline_id=baseline_id,
            snapshot_id=snapshot_id,
            causal_run_id=causal_run_id,
            forecast_run_id=forecast_run_id,
            counterfactual_experiment_id=cf_exp_id,
            recommendation_run_id=rec_run_id,
            graph_summary=graph_summary,
            impact_summary=impact_summary,
            uncertainty_summary=uncertainty_summary,
            recommendation_summary=recommendation_summary,
            missing_sources=missing,
            warnings=warnings,
            limitations=limitations,
            model_versions={"assessment": _MODEL_VERSION},
            created_by_email=actor.email,
            created_by_id=actor.id,
            assembled_at=datetime.now(UTC),
        )
        self._db.add(assessment)
        await self._db.flush()
        return assessment

    # ── LIST ────────────────────────────────────────────────────────────────

    async def list_assessments(
        self,
        graph_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20,
    ) -> AssessmentListResponse:
        """Paginated list of assessments for a graph."""
        offset = (page - 1) * page_size

        count_stmt = select(func.count()).where(
            ResilienceAssessment.graph_id == graph_id
        )
        total = (await self._db.execute(count_stmt)).scalar_one()

        stmt = (
            select(ResilienceAssessment)
            .where(ResilienceAssessment.graph_id == graph_id)
            .order_by(ResilienceAssessment.created_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        rows = (await self._db.execute(stmt)).scalars().all()

        items = [
            AssessmentListItem(
                id=a.id,
                graph_id=a.graph_id,
                name=a.name,
                description=a.description,
                status=a.status,
                created_by_email=a.created_by_email,
                assembled_at=a.assembled_at,
                created_at=a.created_at,
                has_causal=a.causal_run_id is not None,
                has_forecast=a.forecast_run_id is not None,
                has_counterfactual=a.counterfactual_experiment_id is not None,
                has_recommendation=a.recommendation_run_id is not None,
                warning_count=len(a.warnings),
                missing_source_count=len(a.missing_sources),
            )
            for a in rows
        ]

        return AssessmentListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_next=(offset + page_size) < total,
        )

    # ── GET SINGLE ──────────────────────────────────────────────────────────

    async def get_assessment(self, assessment_id: uuid.UUID) -> ResilienceAssessment | None:
        result = await self._db.execute(
            select(ResilienceAssessment).where(ResilienceAssessment.id == assessment_id)
        )
        return result.scalar_one_or_none()

    # ── EVIDENCE LINEAGE ────────────────────────────────────────────────────

    async def get_evidence_lineage(
        self, assessment: ResilienceAssessment
    ) -> AssessmentEvidenceLineage:
        """
        Assemble full evidence lineage from Phase 5 causal records.

        Returns explicit unavailability if no causal run is linked.
        Does NOT re-run inference.
        """
        if not assessment.causal_run_id:
            return AssessmentEvidenceLineage(
                assessment_id=str(assessment.id),
                graph_id=str(assessment.graph_id),
                causal_available=False,
                warnings=["No causal inference run linked to this assessment."],
            )

        # Fetch the run
        run_result = await self._db.execute(
            select(CausalInferenceRun).where(
                CausalInferenceRun.id == assessment.causal_run_id
            )
        )
        run = run_result.scalar_one_or_none()
        if not run:
            return AssessmentEvidenceLineage(
                assessment_id=str(assessment.id),
                graph_id=str(assessment.graph_id),
                causal_run_id=str(assessment.causal_run_id),
                causal_available=False,
                warnings=["Causal inference run record not found (may have been deleted)."],
            )

        # Fetch hypotheses (paginated: max 200 for assembly; UI paginates separately)
        hyp_result = await self._db.execute(
            select(CausalHypothesis)
            .where(CausalHypothesis.run_id == run.id)
            .limit(200)
        )
        hypotheses = hyp_result.scalars().all()

        summaries: list[HypothesisSummary] = []
        completeness_values: list[float] = []
        missing_evidence_all: list[str] = []

        for h in hypotheses:
            # Fetch evidence items
            ev_result = await self._db.execute(
                select(HypothesisEvidence).where(
                    HypothesisEvidence.hypothesis_id == h.id
                )
            )
            evidence = ev_result.scalars().all()

            supporting = sum(1 for e in evidence if e.direction == EvidenceDirection.SUPPORTING)
            contradicting = sum(1 for e in evidence if e.direction == EvidenceDirection.CONTRADICTING)
            neutral = sum(1 for e in evidence if e.direction == EvidenceDirection.NEUTRAL)

            # Fetch node names
            affected_node_name = await self._get_node_name(h.affected_node_id)
            cause_node_name = (
                await self._get_node_name(h.candidate_cause_node_id)
                if h.candidate_cause_node_id
                else None
            )

            completeness_values.append(h.evidence_completeness_ratio)
            missing_evidence_all.extend(h.missing_evidence)

            summaries.append(
                HypothesisSummary(
                    hypothesis_id=str(h.id),
                    hypothesis_type=h.hypothesis_type,
                    status=h.status,
                    explanation=h.explanation,
                    inference_rule=h.inference_rule,
                    evidence_completeness_ratio=h.evidence_completeness_ratio,
                    supporting_count=supporting,
                    contradicting_count=contradicting,
                    neutral_count=neutral,
                    missing_evidence=h.missing_evidence,
                    unresolved_assumptions=h.unresolved_assumptions,
                    affected_node_id=str(h.affected_node_id),
                    affected_node_name=affected_node_name,
                    candidate_cause_node_id=str(h.candidate_cause_node_id) if h.candidate_cause_node_id else None,
                    candidate_cause_node_name=cause_node_name,
                )
            )

        avg_completeness = (
            sum(completeness_values) / len(completeness_values)
            if completeness_values
            else None
        )

        return AssessmentEvidenceLineage(
            assessment_id=str(assessment.id),
            graph_id=str(assessment.graph_id),
            causal_run_id=str(run.id),
            analyzed_at=run.analyzed_at,
            rule_version=run.rule_version,
            hypotheses=summaries,
            total_hypotheses=len(summaries),
            evidence_completeness_avg=avg_completeness,
            missing_evidence_summary=list(set(missing_evidence_all))[:20],
            causal_available=True,
        )

    # ── IMPACTS ─────────────────────────────────────────────────────────────

    async def get_impacts(
        self, assessment: ResilienceAssessment
    ) -> AssessmentImpactSummary:
        """
        Return the structured impact and uncertainty summary assembled at creation.

        Pulls data from stored summaries; does NOT re-run engines.
        """
        from app.schemas.assessment import AssessmentImpactSummary

        if assessment.impact_summary is None:
            return AssessmentImpactSummary(
                missing_sources=assessment.missing_sources,
                data_freshness_warning=bool(assessment.warnings),
            )

        raw = assessment.impact_summary

        # Reconstruct typed summary from stored dict
        return AssessmentImpactSummary(
            hypotheses_total=raw.get("hypotheses_total"),
            hypotheses_supported=raw.get("hypotheses_supported"),
            hypotheses_contradicted=raw.get("hypotheses_contradicted"),
            hypotheses_unresolved=raw.get("hypotheses_unresolved"),
            causal_available=raw.get("causal_available", False),
            forecast_horizon_minutes=raw.get("forecast_horizon_minutes"),
            forecast_already_affected=raw.get("forecast_already_affected"),
            forecast_predicted_affected=raw.get("forecast_predicted_affected"),
            forecast_critical_affected=raw.get("forecast_critical_affected"),
            forecast_calibration_status=raw.get("forecast_calibration_status"),
            forecast_available=raw.get("forecast_available", False),
            counterfactual_summary=(
                CounterfactualSummaryItem(**raw["counterfactual_summary"])
                if raw.get("counterfactual_summary")
                else None
            ),
            counterfactual_available=raw.get("counterfactual_available", False),
            recommendation_eligible_count=raw.get("recommendation_eligible_count"),
            recommendation_ineligible_count=raw.get("recommendation_ineligible_count"),
            recommendation_approved_count=raw.get("recommendation_approved_count"),
            recommendation_rejected_count=raw.get("recommendation_rejected_count"),
            recommendation_pending_count=raw.get("recommendation_pending_count"),
            recommendation_available=raw.get("recommendation_available", False),
            data_freshness_warning=bool(assessment.warnings),
            missing_sources=assessment.missing_sources,
        )

    # ── DECISIONS ───────────────────────────────────────────────────────────

    async def get_decisions(
        self, assessment: ResilienceAssessment
    ) -> AssessmentDecisions:
        """
        Return linked recommendation decisions.

        Human decisions are immutable through this interface.
        """
        if not assessment.recommendation_run_id:
            return AssessmentDecisions(
                assessment_id=str(assessment.id),
                graph_id=str(assessment.graph_id),
                recommendation_available=False,
                limitations=["No recommendation run linked to this assessment."],
            )

        run_result = await self._db.execute(
            select(InterventionRecommendationRun).where(
                InterventionRecommendationRun.id == assessment.recommendation_run_id
            )
        )
        run = run_result.scalar_one_or_none()
        if not run:
            return AssessmentDecisions(
                assessment_id=str(assessment.id),
                graph_id=str(assessment.graph_id),
                recommendation_run_id=str(assessment.recommendation_run_id),
                recommendation_available=False,
                limitations=["Recommendation run record not found (may have been deleted)."],
            )

        cand_result = await self._db.execute(
            select(CandidateIntervention)
            .where(CandidateIntervention.run_id == run.id)
            .order_by(CandidateIntervention.rank_position)
            .limit(100)
        )
        candidates = cand_result.scalars().all()

        approved = sum(1 for c in candidates if c.decision_status == DecisionStatus.APPROVED)
        rejected = sum(1 for c in candidates if c.decision_status == DecisionStatus.REJECTED)
        pending = sum(1 for c in candidates if c.decision_status == DecisionStatus.PENDING)

        return AssessmentDecisions(
            assessment_id=str(assessment.id),
            graph_id=str(assessment.graph_id),
            recommendation_run_id=str(run.id),
            run_name=run.name,
            run_status=run.status,
            candidates=[
                CandidateSummary(
                    candidate_id=str(c.id),
                    title=c.title,
                    intervention_type=c.intervention_type,
                    safety_status=c.safety_status,
                    eligibility_status=c.eligibility_status,
                    rank_position=c.rank_position,
                    rank_score=c.rank_score,
                    decision_status=c.decision_status,
                    decided_by=c.decided_by,
                    decided_at=c.decided_at,
                )
                for c in candidates
            ],
            total_candidates=len(candidates),
            approved_count=approved,
            rejected_count=rejected,
            pending_count=pending,
            recommendation_available=True,
            limitations=run.limitations or [],
        )

    # ── Private helpers ──────────────────────────────────────────────────────

    async def _get_node_name(self, node_id: uuid.UUID | None) -> str | None:
        if not node_id:
            return None
        result = await self._db.execute(
            select(Node.name).where(Node.id == node_id)
        )
        return result.scalar_one_or_none()

    async def _validate_baseline(
        self,
        graph_id: uuid.UUID,
        baseline_id: uuid.UUID | None,
        missing: list[str],
        warnings: list[str],
    ) -> uuid.UUID | None:
        if baseline_id is None:
            return None
        result = await self._db.execute(
            select(StateBaseline).where(StateBaseline.id == baseline_id)
        )
        bl = result.scalar_one_or_none()
        if bl is None:
            missing.append(f"baseline:{baseline_id}")
            return None
        if bl.graph_id != graph_id:
            missing.append(f"baseline:{baseline_id}")
            warnings.append(f"Baseline {baseline_id} belongs to a different graph; excluded.")
            return None
        return baseline_id

    async def _validate_snapshot(
        self,
        graph_id: uuid.UUID,
        snapshot_id: uuid.UUID | None,
        missing: list[str],
        warnings: list[str],
    ) -> uuid.UUID | None:
        if snapshot_id is None:
            return None
        result = await self._db.execute(
            select(StateSnapshot).where(StateSnapshot.id == snapshot_id)
        )
        ss = result.scalar_one_or_none()
        if ss is None:
            missing.append(f"snapshot:{snapshot_id}")
            return None
        if ss.graph_id != graph_id:
            missing.append(f"snapshot:{snapshot_id}")
            warnings.append(f"Snapshot {snapshot_id} belongs to a different graph; excluded.")
            return None
        return snapshot_id

    async def _validate_causal_run(
        self,
        graph_id: uuid.UUID,
        run_id: uuid.UUID | None,
        missing: list[str],
        warnings: list[str],
    ) -> uuid.UUID | None:
        if run_id is None:
            return None
        result = await self._db.execute(
            select(CausalInferenceRun).where(CausalInferenceRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if run is None:
            missing.append(f"causal_run:{run_id}")
            return None
        if run.graph_id != graph_id:
            missing.append(f"causal_run:{run_id}")
            warnings.append(f"Causal run {run_id} belongs to a different graph; excluded.")
            return None
        return run_id

    async def _validate_forecast_run(
        self,
        graph_id: uuid.UUID,
        run_id: uuid.UUID | None,
        missing: list[str],
        warnings: list[str],
    ) -> uuid.UUID | None:
        if run_id is None:
            return None
        result = await self._db.execute(
            select(CascadeForecastRun).where(CascadeForecastRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if run is None:
            missing.append(f"forecast_run:{run_id}")
            return None
        if run.graph_id != graph_id:
            missing.append(f"forecast_run:{run_id}")
            warnings.append(f"Forecast run {run_id} belongs to a different graph; excluded.")
            return None
        return run_id

    async def _validate_counterfactual(
        self,
        graph_id: uuid.UUID,
        exp_id: uuid.UUID | None,
        missing: list[str],
        warnings: list[str],
    ) -> uuid.UUID | None:
        if exp_id is None:
            return None
        result = await self._db.execute(
            select(CounterfactualExperiment).where(CounterfactualExperiment.id == exp_id)
        )
        exp = result.scalar_one_or_none()
        if exp is None:
            missing.append(f"counterfactual_experiment:{exp_id}")
            return None
        if exp.graph_id != graph_id:
            missing.append(f"counterfactual_experiment:{exp_id}")
            warnings.append(f"Counterfactual {exp_id} belongs to a different graph; excluded.")
            return None
        return exp_id

    async def _validate_recommendation_run(
        self,
        graph_id: uuid.UUID,
        run_id: uuid.UUID | None,
        missing: list[str],
        warnings: list[str],
    ) -> uuid.UUID | None:
        if run_id is None:
            return None
        result = await self._db.execute(
            select(InterventionRecommendationRun).where(
                InterventionRecommendationRun.id == run_id
            )
        )
        run = result.scalar_one_or_none()
        if run is None:
            missing.append(f"recommendation_run:{run_id}")
            return None
        if run.graph_id != graph_id:
            missing.append(f"recommendation_run:{run_id}")
            warnings.append(f"Recommendation run {run_id} belongs to a different graph; excluded.")
            return None
        return run_id

    async def _build_graph_summary(self, graph_id: uuid.UUID) -> dict[str, Any]:
        """Assemble Phase 2 graph topology + Phase 3 event summary."""
        graph_result = await self._db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        graph = graph_result.scalar_one_or_none()
        if graph is None:
            return {"available": False}

        node_count = (await self._db.execute(
            select(func.count()).where(Node.graph_id == graph_id)
        )).scalar_one()

        dep_count = (await self._db.execute(
            select(func.count()).where(Dependency.graph_id == graph_id)
        )).scalar_one()

        # Count degraded/critical/failed nodes
        degraded = (await self._db.execute(
            select(func.count()).where(Node.graph_id == graph_id, Node.state == NodeState.DEGRADED)
        )).scalar_one()
        critical_nodes = (await self._db.execute(
            select(func.count()).where(Node.graph_id == graph_id, Node.state == NodeState.CRITICAL)
        )).scalar_one()
        failed = (await self._db.execute(
            select(func.count()).where(Node.graph_id == graph_id, Node.state == NodeState.FAILED)
        )).scalar_one()

        # Phase 3: active events
        active_events = (await self._db.execute(
            select(func.count()).where(
                Event.graph_id == graph_id,
                Event.status.in_([EventStatus.OPEN, EventStatus.ACKNOWLEDGED]),
            )
        )).scalar_one()
        critical_events = (await self._db.execute(
            select(func.count()).where(
                Event.graph_id == graph_id,
                Event.status.in_([EventStatus.OPEN, EventStatus.ACKNOWLEDGED]),
                Event.severity == "CRITICAL",
            )
        )).scalar_one()

        return {
            "available": True,
            "data_available": True,
            "graph_id": str(graph_id),
            "graph_name": graph.name,
            "node_count": node_count,
            "dependency_count": dep_count,
            "degraded_node_count": degraded,
            "critical_node_count": critical_nodes,
            "failed_node_count": failed,
            "active_event_count": active_events,
            "critical_event_count": critical_events,
            "source_record_type": "infrastructure_graph",
            "source_record_id": str(graph_id),
        }

    async def _build_impact_summary(
        self,
        graph_id: uuid.UUID,
        causal_run_id: uuid.UUID | None,
        forecast_run_id: uuid.UUID | None,
        cf_exp_id: uuid.UUID | None,
        rec_run_id: uuid.UUID | None,
    ) -> dict[str, Any]:
        """Build impact summary dict from persisted records."""
        summary: dict[str, Any] = {}

        # Phase 5
        if causal_run_id:
            run_result = await self._db.execute(
                select(CausalInferenceRun).where(CausalInferenceRun.id == causal_run_id)
            )
            run = run_result.scalar_one_or_none()
            if run:
                supported = (await self._db.execute(
                    select(func.count()).where(
                        CausalHypothesis.run_id == causal_run_id,
                        CausalHypothesis.status == HypothesisStatus.SUPPORTED,
                    )
                )).scalar_one()
                contradicted = (await self._db.execute(
                    select(func.count()).where(
                        CausalHypothesis.run_id == causal_run_id,
                        CausalHypothesis.status == HypothesisStatus.CONTRADICTED,
                    )
                )).scalar_one()
                total_hyp = run.total_hypotheses_generated
                unresolved = total_hyp - supported - contradicted
                summary.update({
                    "causal_available": True,
                    "hypotheses_total": total_hyp,
                    "hypotheses_supported": supported,
                    "hypotheses_contradicted": contradicted,
                    "hypotheses_unresolved": max(unresolved, 0),
                    "causal_source_id": str(causal_run_id),
                })

        # Phase 6
        if forecast_run_id:
            fc_result = await self._db.execute(
                select(CascadeForecastRun).where(CascadeForecastRun.id == forecast_run_id)
            )
            fc = fc_result.scalar_one_or_none()
            if fc:
                summary.update({
                    "forecast_available": True,
                    "forecast_horizon_minutes": fc.horizon_minutes,
                    "forecast_already_affected": fc.total_already_affected,
                    "forecast_predicted_affected": fc.total_predicted_affected,
                    "forecast_critical_affected": fc.total_critical_affected,
                    "forecast_calibration_status": fc.calibration_status,
                    "forecast_source_id": str(forecast_run_id),
                })

        # Phase 7
        if cf_exp_id:
            comp_result = await self._db.execute(
                select(CounterfactualComparison).where(
                    CounterfactualComparison.experiment_id == cf_exp_id
                )
            )
            comp = comp_result.scalar_one_or_none()
            if comp:
                metrics = comp.comparison_metrics or {}
                cf_summary = {
                    "prevented_node_count": len(comp.nodes_affected_baseline_only),
                    "newly_introduced_node_count": len(comp.nodes_affected_counterfactual_only),
                    "shared_affected_node_count": len(comp.nodes_affected_both),
                    "timing_differences_count": len(comp.nodes_timing_differ),
                    "has_critical_prevention": metrics.get("critical_nodes_prevented", 0) > 0,
                    "warnings": comp.warnings,
                    "limitations": comp.limitations,
                }
                summary["counterfactual_available"] = True
                summary["counterfactual_summary"] = cf_summary
                summary["counterfactual_source_id"] = str(cf_exp_id)

        # Phase 8
        if rec_run_id:
            rec_result = await self._db.execute(
                select(InterventionRecommendationRun).where(
                    InterventionRecommendationRun.id == rec_run_id
                )
            )
            rec_run = rec_result.scalar_one_or_none()
            if rec_run:
                eligible = (await self._db.execute(
                    select(func.count()).where(
                        CandidateIntervention.run_id == rec_run_id,
                        CandidateIntervention.eligibility_status == EligibilityStatus.ELIGIBLE,
                    )
                )).scalar_one()
                ineligible = (await self._db.execute(
                    select(func.count()).where(
                        CandidateIntervention.run_id == rec_run_id,
                        CandidateIntervention.eligibility_status == EligibilityStatus.INELIGIBLE,
                    )
                )).scalar_one()
                approved = (await self._db.execute(
                    select(func.count()).where(
                        CandidateIntervention.run_id == rec_run_id,
                        CandidateIntervention.decision_status == DecisionStatus.APPROVED,
                    )
                )).scalar_one()
                rejected = (await self._db.execute(
                    select(func.count()).where(
                        CandidateIntervention.run_id == rec_run_id,
                        CandidateIntervention.decision_status == DecisionStatus.REJECTED,
                    )
                )).scalar_one()
                pending = (await self._db.execute(
                    select(func.count()).where(
                        CandidateIntervention.run_id == rec_run_id,
                        CandidateIntervention.decision_status == DecisionStatus.PENDING,
                    )
                )).scalar_one()
                summary.update({
                    "recommendation_available": True,
                    "recommendation_eligible_count": eligible,
                    "recommendation_ineligible_count": ineligible,
                    "recommendation_approved_count": approved,
                    "recommendation_rejected_count": rejected,
                    "recommendation_pending_count": pending,
                    "recommendation_source_id": str(rec_run_id),
                })

        return summary

    async def _build_uncertainty_summary(
        self,
        graph_id: uuid.UUID,
        forecast_run_id: uuid.UUID | None,
        cf_exp_id: uuid.UUID | None,
    ) -> dict[str, Any]:
        """Uncertainty summary from Phase 6 and Phase 7 records."""
        summary: dict[str, Any] = {"available": False}

        if forecast_run_id:
            fc_result = await self._db.execute(
                select(CascadeForecastRun).where(CascadeForecastRun.id == forecast_run_id)
            )
            fc = fc_result.scalar_one_or_none()
            if fc:
                summary.update({
                    "available": True,
                    "calibration_status": fc.calibration_status,
                    "simulation_mode": fc.simulation_mode,
                    "limitations": (fc.simulation_settings or {}).get("limitations", []),
                    "label": "heuristic" if fc.calibration_status == "HEURISTIC_ESTIMATE" else "calibrated",
                    "forecast_source_id": str(forecast_run_id),
                })

        if cf_exp_id:
            comp_result = await self._db.execute(
                select(CounterfactualComparison).where(
                    CounterfactualComparison.experiment_id == cf_exp_id
                )
            )
            comp = comp_result.scalar_one_or_none()
            if comp:
                summary["counterfactual_uncertainty"] = comp.uncertainty_differences

        return summary

    async def _build_recommendation_summary(
        self,
        graph_id: uuid.UUID,
        rec_run_id: uuid.UUID | None,
    ) -> dict[str, Any] | None:
        if not rec_run_id:
            return None
        rec_result = await self._db.execute(
            select(InterventionRecommendationRun).where(
                InterventionRecommendationRun.id == rec_run_id
            )
        )
        run = rec_result.scalar_one_or_none()
        if not run:
            return None
        return {
            "run_id": str(rec_run_id),
            "run_name": run.name,
            "status": run.status,
            "ranking_policy": run.ranking_policy,
            "limitations": run.limitations,
            "summary": run.summary,
        }
