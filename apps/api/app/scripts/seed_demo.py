"""
CAUSAL — Phase 2 Seed Script: Integrated Resilience Demo

Creates a deterministic mixed-infrastructure demo graph.

Scenario: Urban Critical Infrastructure Network
  - Power source feeds everything
  - Water facility depends on power
  - Hospital depends on power, water, and telecom
  - ICU (within hospital) depends on hospital
  - Telecom hub depends on power
  - Emergency services depend on telecom and transport
  - Transport control depends on power
  - Backup generator provides redundancy
  - Control center depends on telecom
  - Weather station (sensor) feeds control center

Total: ~13 nodes, ~17 dependencies

Usage:
    python -m app.scripts.seed_demo

Options:
    --reset   Delete existing demo graph before seeding

Idempotency:
    Checks for an existing graph named "Integrated Resilience Demo".
    If found and --reset is not passed, skips seeding.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import uuid
from pathlib import Path

# Allow running as a script
sys.path.insert(0, str(Path(__file__).parents[3]))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

from app.core.config import get_settings
from app.models.graph_models import InfrastructureGraph, Node, Dependency, NodeState


DEMO_GRAPH_NAME = "Integrated Resilience Demo"

# Fixed seed UUID namespace for deterministic IDs
SEED_NS = uuid.UUID("c4750a11-fa5e-2000-8eed-000000000001")

# Node definitions: (key, name, type, state, health, capacity, criticality, description)
NODES = [
    ("power_main",     "Main Power Station",        "power_source",   NodeState.NORMAL,    1.0, 0.90, 0.95, "Primary regional power generation facility"),
    ("power_backup",   "Backup Generator",           "power_source",   NodeState.NORMAL,    0.9, 0.50, 0.70, "Emergency diesel generator for critical loads"),
    ("water_plant",    "Water Treatment Plant",      "water_facility", NodeState.NORMAL,    0.95,0.85, 0.80, "Municipal water treatment and distribution"),
    ("water_pump",     "Water Pump Station",         "water_facility", NodeState.NORMAL,    1.0, 0.80, 0.75, "Primary pump station feeding hospital district"),
    ("telecom_hub",    "Telecom Hub Alpha",          "telecom",        NodeState.NORMAL,    1.0, 0.95, 0.85, "Primary telecommunications switching center"),
    ("telecom_backup", "Telecom Hub Beta",           "telecom",        NodeState.DEGRADED,  0.7, 0.60, 0.60, "Secondary telecom hub (currently degraded)"),
    ("transport_ctrl", "Transport Control Center",   "control",        NodeState.NORMAL,    0.9, 0.80, 0.70, "Traffic and emergency vehicle routing"),
    ("hospital_main",  "City General Hospital",      "healthcare_facility", NodeState.NORMAL, 0.95, 0.90, 1.0, "Primary regional hospital — 800 beds"),
    ("hospital_icu",   "ICU Critical Care Unit",     "healthcare_facility", NodeState.CRITICAL,0.6, 0.70, 1.0, "Intensive care unit within hospital (degraded power supply)"),
    ("control_center", "Emergency Control Center",   "control",        NodeState.NORMAL,    1.0, 0.95, 0.90, "City-wide emergency operations coordination"),
    ("weather_sensor", "Weather Monitoring Array",   "sensor",         NodeState.NORMAL,    0.8, 1.0,  0.40, "Distributed weather and environmental sensors"),
    ("fuel_storage",   "Fuel Storage Depot",         "storage",        NodeState.NORMAL,    1.0, 0.75, 0.65, "Emergency fuel reserves for generators and vehicles"),
    ("network_svc",    "Public Safety Network",      "service",        NodeState.NORMAL,    0.9, 0.85, 0.80, "Encrypted communications network for emergency services"),
]

# Dependency definitions: (source_key, target_key, type, strength, required, failure_prop)
# source → target means TARGET DEPENDS ON SOURCE
DEPS = [
    # Power distribution backbone
    ("power_main",     "water_plant",    "energy",      1.0, True,  0.9),
    ("power_main",     "water_pump",     "energy",      1.0, True,  0.9),
    ("power_main",     "telecom_hub",    "energy",      1.0, True,  0.85),
    ("power_main",     "transport_ctrl", "energy",      0.9, True,  0.8),
    ("power_main",     "hospital_main",  "energy",      1.0, True,  0.95),
    ("power_main",     "control_center", "energy",      0.9, True,  0.85),

    # Backup power
    ("power_backup",   "hospital_icu",   "energy",      0.8, True,  0.7),
    ("fuel_storage",   "power_backup",   "resource",    0.9, True,  0.85),

    # Water chain
    ("water_plant",    "water_pump",     "physical",    0.9, True,  0.8),
    ("water_pump",     "hospital_main",  "resource",    0.8, True,  0.7),

    # Telecom chain
    ("telecom_hub",    "hospital_main",  "communication", 0.7, False, 0.5),
    ("telecom_hub",    "control_center", "communication", 0.95, True, 0.8),
    ("telecom_hub",    "network_svc",    "communication", 1.0, True,  0.9),
    ("telecom_backup", "control_center", "communication", 0.6, False, 0.4),

    # Hospital internal
    ("hospital_main",  "hospital_icu",   "physical",    1.0, True,  0.9),

    # Emergency services
    ("transport_ctrl", "control_center", "logical",     0.8, False, 0.5),
    ("weather_sensor", "control_center", "service",     0.5, False, 0.3),
    ("network_svc",    "control_center", "communication", 0.9, True,  0.7),
]


def _seed_uuid(key: str) -> uuid.UUID:
    """Generate a deterministic UUID from a string key."""
    return uuid.uuid5(SEED_NS, key)


async def seed(db: AsyncSession, reset: bool = False) -> None:
    """Seed the demo graph. Idempotent unless --reset is passed."""
    # Check for existing graph
    result = await db.execute(
        select(InfrastructureGraph).where(InfrastructureGraph.name == DEMO_GRAPH_NAME)
    )
    existing = result.scalar_one_or_none()

    if existing and not reset:
        print(f"Demo graph '{DEMO_GRAPH_NAME}' already exists (id={existing.id}).")
        print("Use --reset to recreate it.")
        return

    if existing and reset:
        print(f"Resetting demo graph '{DEMO_GRAPH_NAME}'...")
        await db.delete(existing)
        await db.flush()

    # Create graph
    graph_id = _seed_uuid("graph:integrated-resilience-demo")
    graph = InfrastructureGraph(
        id=graph_id,
        name=DEMO_GRAPH_NAME,
        description=(
            "Mixed-infrastructure demo graph showing power, water, telecom, and healthcare "
            "interdependencies. Used for Phase 2 testing and demonstration."
        ),
        domain="mixed",
        version=1,
        metadata_={"scenario": "urban_critical_infrastructure", "phase": 2},
    )
    db.add(graph)
    await db.flush()

    # Create nodes
    node_map: dict[str, uuid.UUID] = {}
    for key, name, ntype, state, health, capacity, criticality, desc in NODES:
        node_id = _seed_uuid(f"node:{key}")
        node = Node(
            id=node_id,
            graph_id=graph_id,
            name=name,
            type=ntype,
            description=desc,
            state=state,
            health=health,
            capacity=capacity,
            criticality=criticality,
        )
        db.add(node)
        node_map[key] = node_id

    await db.flush()

    # Create dependencies
    for src_key, tgt_key, dep_type, strength, required, fp in DEPS:
        dep_id = _seed_uuid(f"dep:{src_key}->{tgt_key}")
        dep = Dependency(
            id=dep_id,
            graph_id=graph_id,
            source_node_id=node_map[src_key],
            target_node_id=node_map[tgt_key],
            dependency_type=dep_type,
            strength=strength,
            required=required,
            failure_propagation=fp,
        )
        db.add(dep)

    await db.commit()

    print(f"Seeded demo graph '{DEMO_GRAPH_NAME}' (id={graph_id})")
    print(f"  {len(NODES)} nodes, {len(DEPS)} dependencies")
    print(f"\nReset:  python -m app.scripts.seed_demo --reset")
    print(f"Inspect: GET /api/v1/graphs/{graph_id}")
    print(f"Stats:   GET /api/v1/graphs/{graph_id}/statistics")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the CAUSAL demo graph.")
    parser.add_argument("--reset", action="store_true", help="Delete and recreate the demo graph")
    args = parser.parse_args()

    settings = get_settings()
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with AsyncSessionLocal() as db:
        await seed(db, reset=args.reset)

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
