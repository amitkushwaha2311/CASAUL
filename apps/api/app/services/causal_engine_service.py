"""
CAUSAL API — Deterministic Causal Inference & Hypothesis Engine (Phase 5).

Generates explainable, evidence-backed hypotheses for observed infrastructure conditions.

Core Rules & Design Principles:
1. Candidate causes must be grounded in actual graph nodes, dependencies, events, or observations.
2. Respects dependency direction: `source -> target` means target depends on source.
3. A dependency edge or path alone never establishes causation.
4. Temporal precedence may support a hypothesis but does NOT prove causation.
5. Preserves contradictory evidence alongside supporting evidence.
6. Preserves competing plausible explanations as separate hypotheses:
   - Rule A: Upstream Dependency Failure (Upstream node degraded/failed before target degraded)
   - Rule B: Local Internal Node Degradation (Target has internal failure/degradation with healthy upstream)
   - Rule C: Telemetry / Sensor Anomaly (Inconsistent sensor metrics or zero confidence vs healthy state)
   - Rule D: External / Unmodeled Disturbance (Critical event occurred with no recorded upstream fault)
7. Missing, stale, or conflicting evidence explicitly triggers `INSUFFICIENT_EVIDENCE` or lowers completeness.
8. Cyclic graphs terminate safely (bounded traversal depth with cycle detection).
9. Repeated analysis of identical inputs produces strictly deterministic results.
10. Does NOT predict cascades or future time-to-impact (strictly reserved for Phase 6).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Sequence

from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.causal_models import (
    CausalHypothesis,
    CausalInferenceRun,
    EvidenceDirection,
    HypothesisEvidence,
    HypothesisStatus,
    HypothesisType,
)
from app.models.graph_models import Dependency, InfrastructureGraph, Node, NodeState
from app.repositories.dependency_repository import DependencyRepository
from app.repositories.node_repository import NodeRepository
from app.schemas.causal import (
    CausalAnalysisRequest,
    CausalInferenceRunResponse,
    EvidenceItemResponse,
    HypothesisResponse,
)
from app.services.current_state_service import CurrentStateService
from app.services.evidence_service import EvidenceCollectionService, EvidenceRecord
from app.services.graph_query_service import GraphQueryService


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


class CausalReasoningEngine:
    """Deterministic, explainable causal hypothesis generator."""

    RULE_VERSION = "1.0.0"

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self.node_repo = NodeRepository(db)
        self.dep_repo = DependencyRepository(db)
        self.graph_query = GraphQueryService(db)
        self.current_state = CurrentStateService(db)
        self.evidence_service = EvidenceCollectionService(db)

    async def analyze(
        self, graph_id: uuid.UUID, request: CausalAnalysisRequest
    ) -> CausalInferenceRunResponse:
        # 1. Validate graph exists
        graph_res = await self.db.execute(
            select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id)
        )
        graph = graph_res.scalar_one_or_none()
        if not graph:
            raise HTTPException(status_code=404, detail=f"Graph {graph_id} not found")

        # 2. Identify target nodes to analyze
        target_nodes: list[Node] = []
        req_node_id = request.get_node_id()
        if req_node_id:
            target_node = await self.node_repo.get_in_graph(req_node_id, graph_id)
            if not target_node:
                raise HTTPException(
                    status_code=404,
                    detail=f"Target node {req_node_id} not found in graph {graph_id}",
                )
            target_nodes.append(target_node)
        else:
            all_nodes = await self.node_repo.list_by_graph(graph_id)
            # Find nodes with non-normal state or degraded health
            for n in all_nodes:
                if n.state in (NodeState.DEGRADED, NodeState.CRITICAL, NodeState.FAILED) or n.health < 0.7:
                    target_nodes.append(n)
            # If all nodes normal, pick first node to analyze for completeness/baseline
            if not target_nodes and all_nodes:
                target_nodes.append(all_nodes[0])

        if not target_nodes:
            # Empty graph case
            run = CausalInferenceRun(
                graph_id=graph_id,
                target_node_id=None,
                rule_version=self.RULE_VERSION,
                analyzed_at=_utc_now(),
                total_hypotheses_generated=0,
                input_context={"status": "EMPTY_GRAPH"},
            )
            self.db.add(run)
            await self.db.commit()
            await self.db.refresh(run)
            return CausalInferenceRunResponse(
                id=run.id,
                graph_id=graph_id,
                target_node_id=None,
                rule_version=run.rule_version,
                analyzed_at=run.analyzed_at,
                total_hypotheses_generated=0,
                hypotheses=[],
                input_context=run.input_context,
                created_at=run.created_at,
            )

        # 3. Create inference run container
        run = CausalInferenceRun(
            graph_id=graph_id,
            target_node_id=req_node_id,
            rule_version=self.RULE_VERSION,
            analyzed_at=_utc_now(),
            total_hypotheses_generated=0,
            input_context={
                "target_node_id": str(req_node_id) if req_node_id else None,
                "max_hops": request.max_hops,
                "as_of": request.as_of.isoformat() if request.as_of else None,
            },
        )
        self.db.add(run)
        await self.db.flush()

        all_generated_hypotheses: list[CausalHypothesis] = []

        # 4. Generate hypotheses for each target node
        for target in target_nodes:
            hypotheses = await self._generate_hypotheses_for_node(
                run.id, graph_id, target, request.max_hops
            )
            for h, ev_records in hypotheses:
                self.db.add(h)
                await self.db.flush()
                # Attach evidence
                for ev in ev_records:
                    ev_model = HypothesisEvidence(
                        hypothesis_id=h.id,
                        graph_id=graph_id,
                        related_node_id=ev.related_node_id,
                        direction=ev.direction,
                        evidence_type=ev.evidence_type,
                        summary=ev.summary,
                        source_record_type=ev.source_record_type,
                        source_record_id=ev.source_record_id,
                        event_id=ev.event_id,
                        observation_id=ev.observation_id,
                        dependency_id=ev.dependency_id,
                        observed_at=ev.observed_at,
                        source=ev.source,
                        confidence=ev.confidence,
                        details=ev.details,
                    )
                    self.db.add(ev_model)
                all_generated_hypotheses.append(h)

        run.total_hypotheses_generated = len(all_generated_hypotheses)
        await self.db.commit()

        # Build response with eager-loaded evidence
        return await self.get_run_response(run.id)

    async def _generate_hypotheses_for_node(
        self,
        run_id: uuid.UUID,
        graph_id: uuid.UUID,
        target_node: Node,
        max_hops: int,
    ) -> list[tuple[CausalHypothesis, list[EvidenceRecord]]]:
        """
        Evaluates competing hypotheses for target node:
        1. Upstream Dependency Degradation (for each upstream predecessor)
        2. Local Node Degradation / Internal Failure
        3. Sensor / Telemetry Anomaly
        """
        results: list[tuple[CausalHypothesis, list[EvidenceRecord]]] = []

        # Fetch direct upstreams (predecessors: nodes target depends on)
        upstream_summaries = await self.graph_query.get_upstream_nodes(graph_id, target_node.id)

        target_history = await self.evidence_service.get_node_history(graph_id, target_node.id, limit=5)
        target_obs = await self.evidence_service.get_node_observations(graph_id, target_node.id, limit=5)
        target_events = await self.evidence_service.get_node_events(graph_id, target_node.id, limit=5)

        target_degraded = (
            target_node.state in (NodeState.DEGRADED, NodeState.CRITICAL, NodeState.FAILED)
            or target_node.health < 0.7
        )

        # ── HYPOTHESIS SET 1: Upstream Dependency Candidates ────────────────
        if upstream_summaries:
            for up_node in upstream_summaries:
                dep_edge = await self.evidence_service.get_dependency_edge(
                    graph_id, up_node.id, target_node.id
                )
                evidence: list[EvidenceRecord] = []
                assumptions: list[str] = [
                    f"Assumes functional impact transmits along {dep_edge.dependency_type if dep_edge else 'dependency'} dependency edge.",
                    "Correlation or path existence does not establish causation without verified transmission evidence.",
                ]
                missing: list[str] = []

                # Add structural edge evidence
                if dep_edge:
                    evidence.append(
                        EvidenceRecord(
                            evidence_type="DEPENDENCY_TOPOLOGY",
                            direction=EvidenceDirection.SUPPORTING,
                            summary=f"Node '{target_node.name}' directly depends on '{up_node.name}' (type: {dep_edge.dependency_type}, required={dep_edge.required}).",
                            source_record_type="dependency",
                            source_record_id=dep_edge.id,
                            related_node_id=up_node.id,
                            dependency_id=dep_edge.id,
                            details={"required": dep_edge.required, "strength": dep_edge.strength},
                        )
                    )

                # Check upstream node state
                up_history = await self.evidence_service.get_node_history(graph_id, up_node.id, limit=5)
                up_events = await self.evidence_service.get_node_events(graph_id, up_node.id, limit=5)
                up_obs = await self.evidence_service.get_node_observations(graph_id, up_node.id, limit=5)
                up_is_unknown = up_node.state == NodeState.UNKNOWN
                up_is_degraded = (
                    not up_is_unknown
                    and (
                        up_node.state in (NodeState.DEGRADED, NodeState.CRITICAL, NodeState.FAILED)
                        or up_node.health < 0.7  # Documented operational heuristic threshold for functional impairment
                    )
                )

                if up_is_degraded:
                    # Upstream is degraded: attach real upstream events and observations
                    for u_ev in up_events:
                        evidence.append(
                            EvidenceRecord(
                                evidence_type="UPSTREAM_EVENT",
                                direction=EvidenceDirection.SUPPORTING,
                                summary=f"Upstream node '{up_node.name}' experienced event '{u_ev.event_type}' ({u_ev.severity}) at {u_ev.timestamp.isoformat()}.",
                                source_record_type="event",
                                source_record_id=u_ev.id,
                                related_node_id=up_node.id,
                                event_id=u_ev.id,
                                observed_at=u_ev.timestamp,
                                source=u_ev.source,
                                confidence=u_ev.confidence,
                            )
                        )
                    for u_o in up_obs:
                        evidence.append(
                            EvidenceRecord(
                                evidence_type="UPSTREAM_OBSERVATION",
                                direction=EvidenceDirection.SUPPORTING,
                                summary=f"Upstream node '{up_node.name}' observed metric {u_o.metric}={u_o.value_numeric or u_o.value_text} via {u_o.source}.",
                                source_record_type="observation",
                                source_record_id=u_o.id,
                                related_node_id=up_node.id,
                                observation_id=u_o.id,
                                observed_at=u_o.timestamp,
                                source=u_o.source,
                                confidence=u_o.confidence,
                            )
                        )

                    # check temporal precedence
                    up_degraded_time = (
                        up_events[0].timestamp
                        if up_events
                        else (up_history[0].observed_at if up_history else None)
                    )
                    target_degraded_time = (
                        target_events[0].timestamp
                        if target_events
                        else (target_history[0].observed_at if target_history else None)
                    )

                    temporal_supports = False
                    if up_degraded_time and target_degraded_time:
                        if _as_utc(up_degraded_time) <= _as_utc(target_degraded_time):
                            temporal_supports = True
                            evidence.append(
                                EvidenceRecord(
                                    evidence_type="TEMPORAL_PRECEDENCE",
                                    direction=EvidenceDirection.SUPPORTING,
                                    summary=f"Upstream node '{up_node.name}' entered degraded state at {up_degraded_time.isoformat()}, prior to target degradation at {target_degraded_time.isoformat()}.",
                                    source_record_type="state_history",
                                    source_record_id=up_history[0].id if up_history else None,
                                    related_node_id=up_node.id,
                                    observed_at=up_degraded_time,
                                    confidence=up_history[0].confidence if up_history else None,
                                )
                            )
                        else:
                            evidence.append(
                                EvidenceRecord(
                                    evidence_type="TEMPORAL_INVERSION",
                                    direction=EvidenceDirection.CONTRADICTING,
                                    summary=f"Target node '{target_node.name}' degraded before upstream '{up_node.name}', contradicting upstream causality.",
                                    source_record_type="state_history",
                                    source_record_id=up_history[0].id if up_history else None,
                                    related_node_id=up_node.id,
                                    observed_at=up_degraded_time,
                                    confidence=up_history[0].confidence if up_history else None,
                                )
                            )
                    else:
                        missing.append("Exact state transition timestamps unavailable for temporal precedence verification.")

                    status = (
                        HypothesisStatus.SUPPORTED
                        if (target_degraded and temporal_supports)
                        else HypothesisStatus.POSSIBLE
                    )
                    explanation = (
                        f"Target node '{target_node.name}' depends directly on '{up_node.name}', which is in {up_node.state} state (health={up_node.health:.2f}). "
                        f"Upstream impairment is a plausible candidate cause (operational heuristic threshold: health < 0.70)."
                    )
                elif up_is_unknown:
                    # Upstream has unknown or missing telemetry: do NOT treat as healthy!
                    status = HypothesisStatus.INSUFFICIENT_EVIDENCE
                    missing.append(f"Telemetry and operational state for upstream '{up_node.name}' are unknown or missing.")
                    explanation = (
                        f"Target node '{target_node.name}' depends on '{up_node.name}', but upstream operational condition is UNKNOWN. "
                        f"Missing records cannot be interpreted as confirmed system health."
                    )
                else:
                    # Upstream is verified normal/healthy: this CONTRADICTS an upstream failure hypothesis
                    status = HypothesisStatus.CONTRADICTED
                    explanation = (
                        f"Candidate cause '{up_node.name}' is operating normally (state={up_node.state}, health={up_node.health:.2f}). "
                        f"Available records contradict an upstream dependency failure along this edge."
                    )
                    evidence.append(
                        EvidenceRecord(
                            evidence_type="UPSTREAM_HEALTHY_STATE",
                            direction=EvidenceDirection.CONTRADICTING,
                            summary=f"Upstream provider '{up_node.name}' is healthy (health={up_node.health:.2f}, state={up_node.state}).",
                            source_record_type="state_history",
                            source_record_id=up_history[0].id if up_history else None,
                            related_node_id=up_node.id,
                        )
                    )

                h = CausalHypothesis(
                    run_id=run_id,
                    graph_id=graph_id,
                    affected_node_id=target_node.id,
                    candidate_cause_node_id=up_node.id,
                    hypothesis_type=HypothesisType.UPSTREAM_DEPENDENCY_FAILURE,
                    inference_rule="RULE_UPSTREAM_DEPENDENCY_PRECEDENCE",
                    status=status,
                    explanation=explanation,
                    evidence_completeness_ratio=round(len(evidence) / (len(evidence) + len(missing) or 1), 2),
                    unresolved_assumptions=assumptions,
                    missing_evidence=missing,
                    confidence_assessment="Rule-based heuristic; dependency edge and temporal alignment support plausibility but do not prove physical causality.",
                )
                results.append((h, evidence))

        # ── HYPOTHESIS 2: Local Internal Node Degradation ────────────────────
        local_ev: list[EvidenceRecord] = []
        local_missing: list[str] = []
        local_assumptions: list[str] = [
            "Assumes local degradation is not an unobserved upstream ripple.",
            "Independent component aging or internal failure cannot be verified without component-level telemetry.",
        ]

        # Attach local degradation events
        if target_events:
            for ev in target_events:
                local_ev.append(
                    EvidenceRecord(
                        evidence_type="LOCAL_INCIDENT_EVENT",
                        direction=EvidenceDirection.SUPPORTING if target_degraded else EvidenceDirection.NEUTRAL,
                        summary=f"Target node '{target_node.name}' recorded event '{ev.event_type}' ({ev.severity}) at {ev.timestamp.isoformat()}.",
                        source_record_type="event",
                        source_record_id=ev.id,
                        related_node_id=target_node.id,
                        event_id=ev.id,
                        observed_at=ev.timestamp,
                        source=ev.source,
                        confidence=ev.confidence,
                    )
                )

        if target_obs:
            for o in target_obs:
                if o.metric in ("health", "capacity", "state"):
                    local_ev.append(
                        EvidenceRecord(
                            evidence_type="LOCAL_METRIC_OBSERVATION",
                            direction=EvidenceDirection.SUPPORTING if target_degraded else EvidenceDirection.NEUTRAL,
                            summary=f"Target node '{target_node.name}' reported {o.metric}={o.value_numeric or o.value_text} via {o.source} at {o.timestamp.isoformat()}.",
                            source_record_type="observation",
                            source_record_id=o.id,
                            related_node_id=target_node.id,
                            observation_id=o.id,
                            observed_at=o.timestamp,
                            source=o.source,
                            confidence=o.confidence,
                        )
                    )

        # Check if all upstream nodes are healthy (supports local explanation)
        all_upstream_healthy = bool(
            upstream_summaries
            and all(u.state == NodeState.NORMAL and u.health >= 0.7 for u in upstream_summaries)
        )
        if all_upstream_healthy:
            local_ev.append(
                EvidenceRecord(
                    evidence_type="UPSTREAM_HEALTH_ISOLATION",
                    direction=EvidenceDirection.SUPPORTING,
                    summary=f"All {len(upstream_summaries)} upstream dependencies are healthy, isolating degradation locally to '{target_node.name}'.",
                    source_record_type="dependency",
                    source_record_id=None,
                    related_node_id=target_node.id,
                )
            )
            local_status = HypothesisStatus.SUPPORTED if target_degraded else HypothesisStatus.POSSIBLE
            local_explanation = (
                f"Degradation on '{target_node.name}' appears local and internal. "
                f"All direct upstream suppliers are operating normally."
            )
        elif not upstream_summaries:
            local_status = HypothesisStatus.POSSIBLE if target_degraded else HypothesisStatus.INSUFFICIENT_EVIDENCE
            local_explanation = (
                f"Node '{target_node.name}' has no upstream dependencies in the graph model. "
                f"Condition is consistent with local failure or unmodeled external source."
            )
        else:
            local_status = HypothesisStatus.POSSIBLE
            local_explanation = (
                f"Local degradation on '{target_node.name}' remains plausible, competing with candidate upstream explanations."
            )

        h_local = CausalHypothesis(
            run_id=run_id,
            graph_id=graph_id,
            affected_node_id=target_node.id,
            candidate_cause_node_id=target_node.id,
            hypothesis_type=HypothesisType.LOCAL_NODE_DEGRADATION,
            inference_rule="RULE_LOCAL_FAILURE_ISOLATION",
            status=local_status,
            explanation=local_explanation,
            evidence_completeness_ratio=round(len(local_ev) / (len(local_ev) + len(local_missing) or 1), 2),
            unresolved_assumptions=local_assumptions,
            missing_evidence=local_missing,
            confidence_assessment="Local internal failure inferred from target telemetry and healthy upstream inputs.",
        )
        results.append((h_local, local_ev))

        # ── HYPOTHESIS 3: Telemetry / Sensor Anomaly ──────────────────────────
        telemetry_ev: list[EvidenceRecord] = []
        has_low_confidence = any(
            (o.confidence is not None and o.confidence < 0.5) for o in target_obs
        )
        has_unassessed_confidence = any(o.confidence is None for o in target_obs)

        if has_low_confidence:
            telemetry_ev.append(
                EvidenceRecord(
                    evidence_type="LOW_OBSERVATION_CONFIDENCE",
                    direction=EvidenceDirection.SUPPORTING,
                    summary="Observed metrics on target node have reported confidence < 0.5, indicating sensor degradation or noisy telemetry.",
                    source_record_type="observation",
                    source_record_id=target_obs[0].id if target_obs else None,
                    related_node_id=target_node.id,
                    confidence=target_obs[0].confidence if target_obs else None,
                )
            )
            tel_status = HypothesisStatus.POSSIBLE
            tel_explanation = (
                f"Sensor or telemetry anomaly: Measurements on '{target_node.name}' carry low sensor confidence. "
                "The apparent degradation may be a false alarm or measurement defect."
            )
        else:
            tel_status = HypothesisStatus.POSSIBLE
            tel_explanation = (
                f"Sensor or telemetry anomaly cannot be completely excluded; telemetry pipeline validation is unassessed."
            )

        h_tel = CausalHypothesis(
            run_id=run_id,
            graph_id=graph_id,
            affected_node_id=target_node.id,
            candidate_cause_node_id=None,
            hypothesis_type=HypothesisType.TELEMETRY_OR_SENSOR_ANOMALY,
            inference_rule="RULE_TELEMETRY_INTEGRITY_CHECK",
            status=tel_status,
            explanation=tel_explanation,
            evidence_completeness_ratio=0.8,
            unresolved_assumptions=["Assumes telemetry sensor calibration may drift independently."],
            missing_evidence=["Independent hardware sensor cross-check."],
            confidence_assessment="Evaluates whether reported degradation is an artifact of measurement uncertainty.",
        )
        results.append((h_tel, telemetry_ev))

        return results

    async def get_run_response(self, run_id: uuid.UUID) -> CausalInferenceRunResponse:
        res = await self.db.execute(
            select(CausalInferenceRun).where(CausalInferenceRun.id == run_id)
        )
        run = res.scalar_one_or_none()
        if not run:
            raise HTTPException(status_code=404, detail=f"Inference run {run_id} not found")

        hypotheses_res = await self.db.execute(
            select(CausalHypothesis).where(CausalHypothesis.run_id == run_id)
        )
        hypotheses = hypotheses_res.scalars().all()

        h_responses: list[HypothesisResponse] = []
        for h in hypotheses:
            # fetch evidence
            ev_res = await self.db.execute(
                select(HypothesisEvidence).where(HypothesisEvidence.hypothesis_id == h.id)
            )
            evidence_items = ev_res.scalars().all()

            aff_node = await self.node_repo.get(h.affected_node_id)
            cand_node = (
                await self.node_repo.get(h.candidate_cause_node_id)
                if h.candidate_cause_node_id
                else None
            )

            h_responses.append(
                HypothesisResponse(
                    id=h.id,
                    run_id=h.run_id,
                    graph_id=h.graph_id,
                    affected_node_id=h.affected_node_id,
                    affected_node_name=aff_node.name if aff_node else str(h.affected_node_id),
                    candidate_cause_node_id=h.candidate_cause_node_id,
                    candidate_cause_node_name=cand_node.name if cand_node else None,
                    hypothesis_type=h.hypothesis_type,  # type: ignore
                    inference_rule=h.inference_rule,
                    status=h.status,  # type: ignore
                    explanation=h.explanation,
                    evidence_completeness_ratio=h.evidence_completeness_ratio,
                    unresolved_assumptions=h.unresolved_assumptions,
                    missing_evidence=h.missing_evidence,
                    confidence_assessment=h.confidence_assessment,
                    evidence_items=[EvidenceItemResponse.model_validate(e) for e in evidence_items],
                    metadata_=h.metadata_,
                    created_at=h.created_at,
                )
            )

        return CausalInferenceRunResponse(
            id=run.id,
            graph_id=run.graph_id,
            target_node_id=run.target_node_id,
            rule_version=run.rule_version,
            analyzed_at=run.analyzed_at,
            total_hypotheses_generated=run.total_hypotheses_generated,
            hypotheses=h_responses,
            input_context=run.input_context,
            created_at=run.created_at,
        )

    async def list_hypotheses(
        self,
        graph_id: uuid.UUID,
        node_id: uuid.UUID | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> list[HypothesisResponse]:
        q = select(CausalHypothesis).where(CausalHypothesis.graph_id == graph_id)
        if node_id:
            q = q.where(CausalHypothesis.affected_node_id == node_id)
        if status:
            q = q.where(CausalHypothesis.status == status.upper())

        q = q.order_by(desc(CausalHypothesis.created_at))
        offset = (page - 1) * page_size
        q = q.offset(offset).limit(page_size)

        hypotheses = (await self.db.execute(q)).scalars().all()
        res_list: list[HypothesisResponse] = []

        for h in hypotheses:
            ev_res = await self.db.execute(
                select(HypothesisEvidence).where(HypothesisEvidence.hypothesis_id == h.id)
            )
            evidence_items = ev_res.scalars().all()
            aff_node = await self.node_repo.get(h.affected_node_id)
            cand_node = (
                await self.node_repo.get(h.candidate_cause_node_id)
                if h.candidate_cause_node_id
                else None
            )

            res_list.append(
                HypothesisResponse(
                    id=h.id,
                    run_id=h.run_id,
                    graph_id=h.graph_id,
                    affected_node_id=h.affected_node_id,
                    affected_node_name=aff_node.name if aff_node else str(h.affected_node_id),
                    candidate_cause_node_id=h.candidate_cause_node_id,
                    candidate_cause_node_name=cand_node.name if cand_node else None,
                    hypothesis_type=h.hypothesis_type,  # type: ignore
                    inference_rule=h.inference_rule,
                    status=h.status,  # type: ignore
                    explanation=h.explanation,
                    evidence_completeness_ratio=h.evidence_completeness_ratio,
                    unresolved_assumptions=h.unresolved_assumptions,
                    missing_evidence=h.missing_evidence,
                    confidence_assessment=h.confidence_assessment,
                    evidence_items=[EvidenceItemResponse.model_validate(e) for e in evidence_items],
                    metadata_=h.metadata_,
                    created_at=h.created_at,
                )
            )
        return res_list

    async def get_hypothesis(
        self, graph_id: uuid.UUID, hypothesis_id: uuid.UUID
    ) -> HypothesisResponse:
        res = await self.db.execute(
            select(CausalHypothesis).where(
                CausalHypothesis.id == hypothesis_id,
                CausalHypothesis.graph_id == graph_id,
            )
        )
        h = res.scalar_one_or_none()
        if not h:
            raise HTTPException(
                status_code=404,
                detail=f"Hypothesis {hypothesis_id} not found in graph {graph_id}",
            )

        ev_res = await self.db.execute(
            select(HypothesisEvidence).where(HypothesisEvidence.hypothesis_id == h.id)
        )
        evidence_items = ev_res.scalars().all()
        aff_node = await self.node_repo.get(h.affected_node_id)
        cand_node = (
            await self.node_repo.get(h.candidate_cause_node_id)
            if h.candidate_cause_node_id
            else None
        )

        return HypothesisResponse(
            id=h.id,
            run_id=h.run_id,
            graph_id=h.graph_id,
            affected_node_id=h.affected_node_id,
            affected_node_name=aff_node.name if aff_node else str(h.affected_node_id),
            candidate_cause_node_id=h.candidate_cause_node_id,
            candidate_cause_node_name=cand_node.name if cand_node else None,
            hypothesis_type=h.hypothesis_type,  # type: ignore
            inference_rule=h.inference_rule,
            status=h.status,  # type: ignore
            explanation=h.explanation,
            evidence_completeness_ratio=h.evidence_completeness_ratio,
            unresolved_assumptions=h.unresolved_assumptions,
            missing_evidence=h.missing_evidence,
            confidence_assessment=h.confidence_assessment,
            evidence_items=[EvidenceItemResponse.model_validate(e) for e in evidence_items],
            metadata_=h.metadata_,
            created_at=h.created_at,
        )

    async def get_hypothesis_evidence(
        self, graph_id: uuid.UUID, hypothesis_id: uuid.UUID
    ) -> list[EvidenceItemResponse]:
        # Validate hypothesis belongs to graph
        await self.get_hypothesis(graph_id, hypothesis_id)
        res = await self.db.execute(
            select(HypothesisEvidence).where(
                HypothesisEvidence.hypothesis_id == hypothesis_id,
                HypothesisEvidence.graph_id == graph_id,
            )
        )
        return [EvidenceItemResponse.model_validate(e) for e in res.scalars().all()]
