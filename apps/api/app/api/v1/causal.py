"""
CAUSAL API — Phase 5 REST endpoints for Causal Reasoning Engine.

Endpoints:
  POST /api/v1/graphs/{graph_id}/causal/analyze
  GET  /api/v1/graphs/{graph_id}/causal/hypotheses
  GET  /api/v1/graphs/{graph_id}/causal/hypotheses/{hypothesis_id}
  GET  /api/v1/graphs/{graph_id}/causal/hypotheses/{hypothesis_id}/evidence
  GET  /api/v1/graphs/{graph_id}/nodes/{node_id}/causal/hypotheses
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.graph_models import InfrastructureGraph, Node
from app.schemas.causal import (
    CausalAnalysisRequest,
    CausalInferenceRunResponse,
    EvidenceItemResponse,
    HypothesisResponse,
)
from app.services.causal_engine_service import CausalReasoningEngine

router = APIRouter(tags=["causal"])


async def _verify_graph_exists(graph_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(select(InfrastructureGraph).where(InfrastructureGraph.id == graph_id))
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Graph {graph_id} not found",
        )


async def _verify_node_exists(graph_id: uuid.UUID, node_id: uuid.UUID, db: AsyncSession) -> None:
    res = await db.execute(
        select(Node).where(Node.id == node_id, Node.graph_id == graph_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node {node_id} not found in graph {graph_id}",
        )


@router.post(
    "/graphs/{graph_id}/causal/analyze",
    response_model=CausalInferenceRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute causal hypothesis generation",
    description="Analyzes graph state and temporal evidence to generate explainable, evidence-backed causal hypotheses.",
)
async def analyze_causal_hypotheses(
    graph_id: uuid.UUID,
    request: CausalAnalysisRequest,
    db: AsyncSession = Depends(get_db),
) -> CausalInferenceRunResponse:
    await _verify_graph_exists(graph_id, db)
    target_id = request.get_node_id()
    if target_id:
        # Check if node exists anywhere
        node_res = await db.execute(select(Node).where(Node.id == target_id))
        node = node_res.scalar_one_or_none()
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node {target_id} not found",
            )
        if node.graph_id != graph_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Node {target_id} does not belong to graph {graph_id}",
            )
    engine = CausalReasoningEngine(db)
    return await engine.analyze(graph_id, request)



@router.get(
    "/graphs/{graph_id}/causal/hypotheses",
    response_model=list[HypothesisResponse],
    summary="List causal hypotheses",
    description="Retrieves persisted causal hypotheses for the graph with optional status and node filtering.",
)
async def list_hypotheses(
    graph_id: uuid.UUID,
    node_id: uuid.UUID | None = Query(None, description="Filter by affected node ID"),
    status: str | None = Query(None, description="Filter by status (SUPPORTED, POSSIBLE, CONTRADICTED, INSUFFICIENT_EVIDENCE)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[HypothesisResponse]:
    await _verify_graph_exists(graph_id, db)
    if node_id:
        await _verify_node_exists(graph_id, node_id, db)
    engine = CausalReasoningEngine(db)
    return await engine.list_hypotheses(
        graph_id, node_id=node_id, status=status, page=page, page_size=page_size
    )


@router.get(
    "/graphs/{graph_id}/causal/hypotheses/{hypothesis_id}",
    response_model=HypothesisResponse,
    summary="Get causal hypothesis",
    description="Retrieves an individual causal hypothesis by ID.",
)
async def get_hypothesis(
    graph_id: uuid.UUID,
    hypothesis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> HypothesisResponse:
    await _verify_graph_exists(graph_id, db)
    engine = CausalReasoningEngine(db)
    return await engine.get_hypothesis(graph_id, hypothesis_id)


@router.get(
    "/graphs/{graph_id}/causal/hypotheses/{hypothesis_id}/evidence",
    response_model=list[EvidenceItemResponse],
    summary="Get hypothesis evidence items",
    description="Returns the full list of supporting, contradicting, and neutral evidence items for a hypothesis.",
)
async def get_hypothesis_evidence(
    graph_id: uuid.UUID,
    hypothesis_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> list[EvidenceItemResponse]:
    await _verify_graph_exists(graph_id, db)
    engine = CausalReasoningEngine(db)
    return await engine.get_hypothesis_evidence(graph_id, hypothesis_id)


@router.get(
    "/graphs/{graph_id}/nodes/{node_id}/causal/hypotheses",
    response_model=list[HypothesisResponse],
    summary="Get node causal hypotheses",
    description="Retrieves persisted causal hypotheses affecting a specific node.",
)
async def get_node_hypotheses(
    graph_id: uuid.UUID,
    node_id: uuid.UUID,
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> list[HypothesisResponse]:
    await _verify_graph_exists(graph_id, db)
    await _verify_node_exists(graph_id, node_id, db)
    engine = CausalReasoningEngine(db)
    return await engine.list_hypotheses(
        graph_id, node_id=node_id, status=status, page=page, page_size=page_size
    )
