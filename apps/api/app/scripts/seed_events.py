"""
CAUSAL — Phase 3 Seed Script: Deterministic Event Timeline Demo

Simulates a realistic temporal event sequence for the Phase 2 demo graph.

Scenario: Urban Critical Infrastructure — Power Degradation Sequence
  T+00m: All systems normal.
  T+10m: Power Station health observation drops to 0.78 (sensor reading).
  T+20m: Power Station health observation drops to 0.55 — degradation event.
  T+30m: Power Station health observation drops to 0.42 — CRITICAL.
         Node state explicitly updated.
  T+45m: Telecom Hub connectivity anomaly detected.
  T+60m: Water Pump capacity decreases to 0.68.
  T+90m: Power Station recovery event.
         Power Station health restored to 0.91.

IMPORTANT:
  These events describe WHAT happened in temporal sequence.
  They do NOT claim that event A caused event B.
  Causal reasoning is Phase 5.

Usage:
    python -m app.scripts.seed_events

Options:
    --reset   Delete existing seeded events before re-seeding

Idempotency:
    Checks for existing events with source="seed_events".
    If found and --reset is not passed, skips seeding.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[3]))

from sqlalchemy import select, delete

from app.db.session import AsyncSessionLocal
from app.models.graph_models import InfrastructureGraph, Node
from app.models.event_models import Event, Observation
from app.schemas.event import EventCreate, ObservationCreate
from app.services.event_service import EventService, ObservationService

SEED_SOURCE = "seed_events"
GRAPH_NAME = "Integrated Resilience Demo"

# Base time — the start of the demo scenario
BASE_TIME = datetime(2026, 10, 1, 8, 0, 0, tzinfo=timezone.utc)


def t(minutes: int) -> datetime:
    """Return a timestamp offset from BASE_TIME."""
    return BASE_TIME + timedelta(minutes=minutes)


async def _get_graph_and_nodes(session) -> tuple[uuid.UUID, dict[str, uuid.UUID]]:
    """Retrieve the Phase 2 demo graph and build a name→id lookup."""
    result = await session.execute(
        select(InfrastructureGraph).where(InfrastructureGraph.name == GRAPH_NAME)
    )
    graph = result.scalar_one_or_none()
    if not graph:
        print(f"ERROR: Graph '{GRAPH_NAME}' not found.")
        print("       Run 'python -m app.scripts.seed_demo' first.")
        sys.exit(1)

    nodes_result = await session.execute(
        select(Node).where(Node.graph_id == graph.id)
    )
    nodes = {n.name: n.id for n in nodes_result.scalars().all()}
    return graph.id, nodes


async def _already_seeded(session, graph_id: uuid.UUID) -> bool:
    result = await session.execute(
        select(Event).where(
            Event.graph_id == graph_id,
            Event.source == SEED_SOURCE,
        ).limit(1)
    )
    return result.scalar_one_or_none() is not None


async def _reset_events(session, graph_id: uuid.UUID) -> None:
    await session.execute(
        delete(Event).where(
            Event.graph_id == graph_id,
            Event.source == SEED_SOURCE,
        )
    )
    await session.commit()
    print("  Existing seed events deleted.")


async def seed(reset: bool = False) -> None:
    async with AsyncSessionLocal() as session:
        graph_id, nodes = await _get_graph_and_nodes(session)

        if await _already_seeded(session, graph_id):
            if not reset:
                print(f"Events already seeded for graph '{GRAPH_NAME}'. Use --reset to re-seed.")
                return
            await _reset_events(session, graph_id)

        event_svc = EventService(session)
        obs_svc = ObservationService(session)

        # Helper to safely look up node IDs
        def node_id(name: str) -> uuid.UUID | None:
            return nodes.get(name)

        print(f"Seeding deterministic event timeline for graph '{GRAPH_NAME}'...")

        # ── T+10m: Power Station normal sensor reading ───────────────────
        print("  T+10m: Power Station health sensor reading (0.78)...")
        ev1 = await event_svc.create(graph_id, EventCreate(
            event_type="sensor_alert",
            severity="LOW",
            status="OPEN",
            source=SEED_SOURCE,
            timestamp=t(10),
            description="Power Station output voltage slightly below nominal.",
            confidence=0.90,
            evidence={"sensor_id": "sensor-ps-01", "measurement": "output_voltage", "value": 0.78, "threshold": 0.80},
        ), broadcast=False)
        await obs_svc.create(graph_id, ObservationCreate(
            node_id=node_id("Power Station Alpha"),
            event_id=ev1.id,
            observation_type="measurement",
            metric="health",
            value_numeric=0.78,
            unit="ratio",
            confidence=0.90,
            timestamp=t(10),
            source=SEED_SOURCE,
        ))

        # ── T+20m: Power Station degradation ────────────────────────────
        print("  T+20m: Power Station health drops to 0.55 — degradation...")
        ev2 = await event_svc.create(graph_id, EventCreate(
            event_type="degradation",
            severity="MEDIUM",
            status="OPEN",
            source=SEED_SOURCE,
            timestamp=t(20),
            description="Power Station output degradation detected. Health at 0.55.",
            confidence=0.92,
        ), broadcast=False)
        await obs_svc.create(graph_id, ObservationCreate(
            node_id=node_id("Power Station Alpha"),
            event_id=ev2.id,
            observation_type="measurement",
            metric="health",
            value_numeric=0.55,
            unit="ratio",
            confidence=0.92,
            timestamp=t(20),
            source=SEED_SOURCE,
        ))

        # ── T+30m: Power Station CRITICAL ───────────────────────────────
        print("  T+30m: Power Station health drops to 0.42 — CRITICAL...")
        ev3 = await event_svc.create(graph_id, EventCreate(
            event_type="failure",
            severity="CRITICAL",
            status="OPEN",
            source=SEED_SOURCE,
            timestamp=t(30),
            description="Power Station output critically degraded. Health at 0.42. Immediate attention required.",
            confidence=0.97,
            evidence={"sensor_id": "sensor-ps-01", "value": 0.42},
        ), broadcast=False)
        # This observation explicitly updates node state because metric="health"
        await obs_svc.create(graph_id, ObservationCreate(
            node_id=node_id("Power Station Alpha"),
            event_id=ev3.id,
            observation_type="state_change",
            metric="health",
            value_numeric=0.42,
            unit="ratio",
            confidence=0.97,
            timestamp=t(30),
            source=SEED_SOURCE,
        ))
        # Explicit state observation updates node.state
        if node_id("Power Station Alpha"):
            await obs_svc.create(graph_id, ObservationCreate(
                node_id=node_id("Power Station Alpha"),
                event_id=ev3.id,
                observation_type="state_change",
                metric="state",
                value_text="CRITICAL",
                confidence=0.95,
                timestamp=t(31),
                source=SEED_SOURCE,
            ))

        # ── T+45m: Telecom Hub connectivity anomaly ──────────────────────
        print("  T+45m: Telecom Hub connectivity anomaly...")
        ev4 = await event_svc.create(graph_id, EventCreate(
            event_type="anomaly",
            severity="HIGH",
            status="OPEN",
            source=SEED_SOURCE,
            timestamp=t(45),
            description="Telecom Hub reporting intermittent connectivity anomaly.",
            confidence=0.85,
        ), broadcast=False)
        await obs_svc.create(graph_id, ObservationCreate(
            node_id=node_id("Telecom Hub"),
            event_id=ev4.id,
            observation_type="connectivity",
            metric="availability",
            value_numeric=0.72,
            unit="ratio",
            confidence=0.85,
            timestamp=t(45),
            source=SEED_SOURCE,
        ))

        # ── T+60m: Water Pump capacity decrease ─────────────────────────
        print("  T+60m: Water Pump capacity decrease to 0.68...")
        ev5 = await event_svc.create(graph_id, EventCreate(
            event_type="capacity_change",
            severity="MEDIUM",
            status="OPEN",
            source=SEED_SOURCE,
            timestamp=t(60),
            description="Water Treatment Facility capacity reduced to 68%.",
            confidence=0.88,
        ), broadcast=False)
        await obs_svc.create(graph_id, ObservationCreate(
            node_id=node_id("Water Treatment Facility"),
            event_id=ev5.id,
            observation_type="capacity",
            metric="capacity",
            value_numeric=0.68,
            unit="ratio",
            confidence=0.88,
            timestamp=t(60),
            source=SEED_SOURCE,
        ))

        # ── T+75m: Hospital capacity observation (healthcare domain) ─────
        print("  T+75m: Hospital capacity observation (healthcare domain)...")
        ev6 = await event_svc.create(graph_id, EventCreate(
            event_type="capacity_change",
            severity="INFO",
            status="OPEN",
            source=SEED_SOURCE,
            timestamp=t(75),
            description="City Hospital reporting normal capacity at 82%. Monitoring.",
            confidence=0.95,
        ), broadcast=False)
        await obs_svc.create(graph_id, ObservationCreate(
            node_id=node_id("City Hospital"),
            event_id=ev6.id,
            observation_type="capacity",
            metric="capacity",
            value_numeric=0.82,
            unit="ratio",
            confidence=0.95,
            timestamp=t(75),
            source=SEED_SOURCE,
        ))

        # ── T+90m: Recovery event ────────────────────────────────────────
        print("  T+90m: Power Station recovery event...")
        ev7 = await event_svc.create(graph_id, EventCreate(
            event_type="recovery",
            severity="LOW",
            status="RESOLVED",
            source=SEED_SOURCE,
            timestamp=t(90),
            description="Power Station Alpha has recovered. Health restored to 0.91.",
            confidence=0.99,
        ), broadcast=False)
        # Mark earlier events as resolved
        from app.schemas.event import EventUpdate
        await event_svc.update(graph_id, ev3.id, EventUpdate(status="RESOLVED"))

        # Restore health via observation
        await obs_svc.create(graph_id, ObservationCreate(
            node_id=node_id("Power Station Alpha"),
            event_id=ev7.id,
            observation_type="state_change",
            metric="health",
            value_numeric=0.91,
            unit="ratio",
            confidence=0.99,
            timestamp=t(90),
            source=SEED_SOURCE,
        ))
        if node_id("Power Station Alpha"):
            await obs_svc.create(graph_id, ObservationCreate(
                node_id=node_id("Power Station Alpha"),
                event_id=ev7.id,
                observation_type="state_change",
                metric="state",
                value_text="NORMAL",
                confidence=0.99,
                timestamp=t(91),
                source=SEED_SOURCE,
            ))

        print(f"\nSeeding complete. 7 events and multiple observations created.")
        print("NOTE: Event sequence is TEMPORAL ONLY. No causal relationships implied.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Phase 3 demo events")
    parser.add_argument("--reset", action="store_true", help="Reset existing seed events first")
    args = parser.parse_args()
    asyncio.run(seed(reset=args.reset))
