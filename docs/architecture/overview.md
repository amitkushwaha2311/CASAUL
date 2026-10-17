# CAUSAL — Architecture Overview

> Phases 1–10 Complete

## System Architecture

CAUSAL is a monorepo containing a Next.js frontend, a FastAPI backend, and a shared TypeScript types package.


```
┌─────────────────────────────────────────────────────────────┐
│                        Browser / Client                      │
│                  Next.js App (Port 3000)                    │
│            App Router | TypeScript | Tailwind CSS           │
└────────────────────────────┬────────────────────────────────┘
                             │  HTTP / WebSocket (future)
┌────────────────────────────▼────────────────────────────────┐
│                     FastAPI Application                      │
│               Python 3.13 | Pydantic 2 | Uvicorn           │
│                    (Port 8000)                               │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │  API Layer  │  │  Services   │  │   Repositories   │   │
│  │  (routers)  │  │  (future)   │  │   (future)       │   │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘   │
│         │                │                   │              │
│  ┌──────▼──────────────────────────────────▼─────────┐     │
│  │               SQLAlchemy ORM (async)              │     │
│  └───────────────────────────┬────────────────────────┘    │
└──────────────────────────────┼──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                    PostgreSQL 16                             │
│                    (Port 5432)                              │
│         users | systems | audit_logs                        │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Architecture

```
apps/web/
├── app/                    — Next.js App Router pages
│   ├── layout.tsx          — Root layout with design tokens
│   ├── page.tsx            — Public landing page with animated infrastructure viz
│   └── app/                — Application shell (sidebar + main)
│       ├── layout.tsx      — App shell layout with sidebar navigation
│       ├── page.tsx        — Production overview dashboard
│       ├── assessments/    — Unified Resilience Workspace (Phase 10)
│       ├── command-center/ — Operational command center (Phase 6)
│       ├── incidents/      — Incident management + event stream (Phase 2)
│       ├── causal/         — Causal hypothesis reasoning (Phase 5)
│       ├── simulation/     — Cascade prediction engine UI (Phase 6)
│       ├── interventions/  — Intervention management (Phase 5)
│       ├── evidence/       — Evidence trail explorer (Phase 5)
│       ├── scenarios/      — Scenario comparison (Phase 4)
│       ├── state/          — Digital twin state explorer (Phase 4)
│       └── analytics/      — Cross-phase platform analytics (Phase 6)
├── components/
│   ├── ui/             — Primitive design system components
│   └── landing/        — Landing page section components
├── lib/
│   ├── api-client.ts   — Typed API client (Phases 1–6)
│   └── api-error.ts    — Consistent error handling
├── types/              — Frontend-specific TypeScript types
└── tests/              — Vitest + React Testing Library tests
```

## Backend Architecture

```
apps/api/app/
├── main.py                 — Uvicorn entry point
├── factory.py              — Application factory (create_application)
├── api/
│   ├── router.py           — Root API router
│   └── v1/
│       ├── health.py       — Health, system info, system status
│       ├── graphs.py       — Graph, node, dependency CRUD
│       ├── events.py       — Event + observation ingestion, timeline
│       ├── state.py        — Digital twin state, history, baselines, snapshots, scenarios (Phase 4)
│       ├── causal.py       — Causal hypothesis analysis + evidence (Phase 5)
│       └── cascade.py      — Cascade forecast engine endpoints (Phase 6)
├── core/
│   ├── config.py           — Pydantic settings (env vars)
│   ├── logging.py          — Structlog configuration
│   └── errors.py           — Centralised exception handlers
├── db/
│   ├── base.py             — SQLAlchemy DeclarativeBase
│   └── session.py          — Async engine + session factory
├── models/
│   ├── mixins.py           — UUIDMixin, TimestampMixin
│   ├── user.py             — User model
│   ├── system.py           — System model
│   ├── audit_log.py        — AuditLog model
│   ├── graph_models.py     — InfrastructureGraph, Node, Dependency (Phase 2)
│   ├── event_models.py     — Event, Observation (Phase 2)
│   ├── state_models.py     — StateHistory, Baseline, Snapshot, Scenario (Phase 4)
│   ├── causal_models.py    — CausalInferenceRun, Hypothesis, EvidenceItem (Phase 5)
│   ├── counterfactual_models.py — CounterfactualRun, StateOverride (Phase 5)
│   └── cascade_models.py   — CascadeForecastRun, PredictedNode, PropagationPath (Phase 6)
├── services/
│   ├── graph_service.py                 — Graph + node creation and updates
│   ├── graph_query_service.py           — Statistics, validation, queries
│   ├── graph_validation_service.py      — Structural integrity checks
│   ├── event_service.py                 — Event ingestion, observation recording
│   ├── current_state_service.py         — Live operational state aggregation (Phase 4)
│   ├── state_history_service.py         — Append-only state history (Phase 4)
│   ├── state_baseline_snapshot_service.py — Baselines + snapshots (Phase 4)
│   ├── state_consistency_service.py     — Cross-record consistency (Phase 4)
│   ├── state_reconstruction_service.py  — Time-travel reconstruction (Phase 4)
│   ├── system_state_summary_service.py  — Health distribution summary (Phase 4)
│   ├── causal_engine_service.py         — Rule-based causal hypothesis engine (Phase 5)
│   ├── counterfactual_engine_service.py — Counterfactual state simulation (Phase 5)
│   └── cascade_engine_service.py        — Probabilistic cascade forecasting (Phase 6)
├── schemas/                — Pydantic request/response schemas
├── repositories/           — Data access layer
├── causal/                 — Causal engine module exports
├── simulation/             — Simulation module exports
├── evidence/               — Evidence module exports
└── tests/                  — pytest test suites
```

## Data Model (Phase 2)

```
users
  id (UUID PK)
  email (unique)
  display_name
  is_active
  is_superuser
  created_at
  updated_at

systems
  id (UUID PK)
  name
  description
  domain (power|water|telecom|healthcare|transportation|industrial|unknown)
  status (normal|degraded|critical|failed|recovering|simulation|unknown)
  metadata (JSONB)
  created_by (FK → users.id)
  created_at
  updated_at

audit_logs
  id (UUID PK)
  action
  actor_id (FK → users.id)
  entity_type
  entity_id
  description
  payload (JSONB)
  correlation_id
  created_at
  updated_at

infrastructure_graphs
  id (UUID PK)
  name
  description
  domain
  version
  metadata_ (JSONB)
  created_at
  updated_at

nodes
  id (UUID PK)
  graph_id (FK → infrastructure_graphs.id)
  name
  type
  description
  state (normal|degraded|critical|failed|recovering|simulation|unknown)
  health
  capacity
  criticality
  location (JSONB)
  metadata_ (JSONB)
  created_at
  updated_at

dependencies
  id (UUID PK)
  graph_id (FK → infrastructure_graphs.id)
  source_node_id (FK → nodes.id)
  target_node_id (FK → nodes.id)
  dependency_type
  strength
  required
  failure_propagation
  metadata_ (JSONB)
  created_at
  updated_at

cascade_forecast_runs (Phase 6)
  id (UUID PK)
  graph_id (FK → infrastructure_graphs.id)
  initiating_node_id (FK → nodes.id, NULLABLE)
  rule_version (String)
  simulation_mode (String: DETERMINISTIC | MONTE_CARLO)
  calibration_status (String: HEURISTIC_ESTIMATE | CALIBRATED)
  horizon_minutes (Float)
  max_depth (Integer)
  seed (Integer, NULLABLE)
  source_state_timestamp (DateTime, NULLABLE)
  total_already_affected (Integer)
  total_predicted_affected (Integer)
  total_critical_affected (Integer)
  max_depth_reached (Integer)
  simulation_settings (JSON)
  summary (JSON)
  created_at, updated_at

cascade_predicted_nodes (Phase 6)
  id (UUID PK)
  forecast_id (FK → cascade_forecast_runs.id)
  node_id (FK → nodes.id)
  forecast_status (String: ALREADY_AFFECTED | PREDICTED_AFFECTED | UNAFFECTED)
  current_state, predicted_state (String)
  predicted_impact_level (String: CRITICAL | HIGH | MEDIUM | LOW)
  earliest_impact_seconds, latest_impact_seconds (Float)
  time_to_impact_range (JSON)
  propagation_probability_min, max, point (Float)
  calibration_status (String)
  depth (Integer)
  path_summary, contributing_causes (JSON)
  assumptions, limitations (JSON)
  created_at, updated_at

cascade_propagation_paths (Phase 6)
  id (UUID PK)
  forecast_id (FK → cascade_forecast_runs.id)
  source_node_id, target_node_id (FK → nodes.id)
  dependency_id (FK → dependencies.id, NULLABLE)
  hop_number (Integer)
  estimated_delay_seconds (Float)
  delay_source (String: METADATA | HEURISTIC_DEFAULT | UNKNOWN)
  attenuation_factor (Float)
  propagation_rationale (Text)
  created_at, updated_at

counterfactual_experiments (Phase 7)
  id (UUID PK)
  graph_id (FK → infrastructure_graphs.id)
  name (String)
  description (Text, NULLABLE)
  baseline_id (FK → state_baselines.id, NULLABLE)
  snapshot_id (FK → state_snapshots.id, NULLABLE)
  status (String: PENDING | RUNNING | COMPLETED | FAILED)
  rule_version (String: "1.0.0")
  forecast_settings (JSONB)
  baseline_forecast_id (FK → cascade_forecast_runs.id, NULLABLE)
  counterfactual_forecast_id (FK → cascade_forecast_runs.id, NULLABLE)
  summary (JSONB, NULLABLE)
  execution_error (Text, NULLABLE)
  completed_at (DateTime, NULLABLE)
  created_at, updated_at

counterfactual_changes (Phase 7)
  id (UUID PK)
  experiment_id (FK → counterfactual_experiments.id)
  target_type (String: NODE | DEPENDENCY)
  target_id (UUID)
  change_type (String: STATE_OVERRIDE | HEALTH_OVERRIDE | CAPACITY_OVERRIDE | AVAILABILITY_OVERRIDE | DEPENDENCY_AVAILABILITY | DEPENDENCY_STRENGTH | DEPENDENCY_DELAY)
  original_value (JSONB, NULLABLE)
  proposed_value (JSONB)
  unit (String, NULLABLE)
  rationale (Text, NULLABLE)
  created_at, updated_at

counterfactual_comparisons (Phase 7)
  id (UUID PK)
  experiment_id (FK → counterfactual_experiments.id)
  nodes_affected_both (JSONB)
  nodes_affected_baseline_only (JSONB)  -- Prevented nodes
  nodes_affected_counterfactual_only (JSONB) -- Newly affected nodes
  nodes_timing_differ (JSONB)           -- DELAYED or ACCELERATED shifts
  nodes_severity_differ (JSONB)         -- Severity changes
  critical_nodes_summary (JSONB)
  uncertainty_differences (JSONB)
  comparison_metrics (JSONB)
  warnings (JSONB)
  limitations (JSONB)
  created_at, updated_at
```

### Phase 7 Metric Transparency & Integrity Specifications

#### Composite Criticality Impact Metric Formula
- **Definition**: The criticality-weighted proportion of infrastructure compromised in a forecast branch.
$$\text{Composite Criticality Impact \%} = \left( \frac{\sum_{n \in \text{Affected Nodes}} \text{Criticality}(n)}{\sum_{n \in \text{Graph Nodes}} \text{Criticality}(n)} \right) \times 100$$
- **Differential Delta**:
$$\Delta \text{ Composite Impact \%} = \text{Composite Impact \%}_{\text{CF}} - \text{Composite Impact \%}_{\text{Baseline}}$$
  - A negative delta ($\Delta < 0$) indicates mitigated criticality impact.
  - A positive delta ($\Delta > 0$) indicates adverse secondary impact introduced by the intervention.

#### Calibration Disclosure
- Propagation probabilities and impact scores are strictly categorized as `HEURISTIC_ESTIMATE` intervals derived from edge strength and topological coupling.
- Heuristic scores are **never** presented as empirical or calibrated real-world probabilities.
- All counterfactual simulations remain strictly isolated from live operational systems.

---

## Phase 8: Safety-Constrained Intervention Optimization & Recommendation Engine

### Architecture & Lifecycle
Phase 8 introduces deterministic candidate generation, formal constraint evaluation, paired counterfactual simulation, transparent ranking, and human decision recording:

```
[Target Graph / Baseline]
           │
           ▼
[1. Candidate Generation] (Bounded heuristic mutation: health boost, capacity relief, isolation)
           │
           ▼
[2. Safety Constraint Engine] (Deterministic hard constraints: health floor, ranges, severance guard)
           │
     ┌─────┴──────────┐
  UNSAFE           SAFE (Eligible)
     │                │
     ▼                ▼
[INELIGIBLE]     [3. Counterfactual Simulation (Phase 7)]
(Unranked)            │
                      ▼
                 [4. Multi-Objective Ranking Formula]
                      │
                      ▼
                 [5. Human Decision Audit Gate (APPROVED / REJECTED)]
```

### Database Tables (Phase 8)
- `recommendation_runs`: Run lifecycle, baseline reference, bounded settings, summary metrics, audit limitations.
- `candidate_interventions`: Candidates with safety status (`SAFE`, `UNSAFE`, `INDETERMINATE`), eligibility status (`ELIGIBLE`, `INELIGIBLE`), rank score, rank position, ranking breakdown, counterfactual experiment link, and human review decision (`APPROVED`, `REJECTED`, `PENDING`).
- `safety_constraint_evaluations`: Granular audit trail for each evaluated constraint per candidate.

### Ranking Formula
$$\text{RankScore} = 0.50 \cdot \left(\frac{\text{prevented\_nodes}}{\max(\text{baseline\_affected}, 1)}\right) + 0.30 \cdot \max\left(0, \frac{\Delta\text{blast\_radius}}{\max(\text{baseline\_blast\_radius}, 1)}\right) - 0.20 \cdot \left(\frac{\text{new\_impact\_nodes}}{\max(\text{total\_nodes}, 1)}\right)$$
Scores are clamped to $[0.0, 1.0]$. Tied candidates share identical integer rank positions.

### Human Review & Operational Safety Boundary
- Interventions are recommendations for human review. CAUSAL is strictly simulation-only.
- No autonomous actuation or command dispatching to physical infrastructure.
- High rankings never override safety constraint ineligibility.

---

## Phase 9: Identity, Access Control, Audit Integrity & Operational Readiness

### Authentication & Authorization Boundary
Phase 9 hardens CAUSAL for multi-user operations with server-enforced security boundaries:

```
[Client Request] (Authorization: Bearer <JWT>)
       │
       ▼
[FastAPI Dependency: get_current_user]
       ├── Decodes and validates HS256 signature against SECRET_KEY
       ├── Validates UTC expiry (`exp`) — fail-closed
       └── Queries DB for active User record (is_active == True)
       │
       ▼
[FastAPI Dependency: require_role(min_role)]
       ├── Enforces role hierarchy: VIEWER ≤ ANALYST ≤ APPROVER ≤ ADMIN
       └── 401 Unauthorized (unauthenticated) / 403 Forbidden (insufficient role)
       │
       ▼
[Protected Endpoint Execution]
       └── Caller-supplied `decided_by` discarded; authenticated principal derived
```

### RBAC Permission Matrix

| Role | Read Graphs / Forecasts | Create Scenarios & Runs | Approve / Reject Interventions | Manage Users & Audit Logs |
| :--- | :---: | :---: | :---: | :---: |
| **VIEWER** | Yes | No | No | No |
| **ANALYST** | Yes | Yes | No | No |
| **APPROVER** | Yes | Yes | Yes | No |
| **ADMIN** | Yes | Yes | Yes | Yes |

### Append-Only Audit Logging
All security-relevant actions are recorded in `audit_logs` with server-generated timestamps (`CURRENT_TIMESTAMP`), outcome (`success`, `failure`, `denied`), actor email snapshot, resource type, resource ID, and sanitized context without passwords or tokens.

### Operational Readiness Probes
- `GET /api/v1/health/live`: Fast process health check (always 200).
- `GET /api/v1/health/ready`: Dependency readiness probe (executes `SELECT 1` on DB; 200 on success, 503 on database unavailability).

### Known Gaps & Deployment Prerequisites
1. **External IdP:** Current implementation uses a local JWT boundary with bcrypt. Enterprise deployments require wiring an OIDC/SAML provider into `app.core.auth.decode_token`.
2. **Database Verification:** Verified locally against SQLite test database; PostgreSQL production database is unverified in this test environment until deployed to target PostgreSQL cluster.
3. **Database-Level Immutability:** Audit trail is append-only via API design. Physical database immutability (e.g. WORM storage or append-only tablespace) is not implemented.

---

## Phase 10: Unified Resilience Intelligence & Evidence-Backed Decision Workspace

Phase 10 provides a unified resilience layer that connects existing system evidence and analysis into a traceable, human-readable decision workflow.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Unified Resilience Assessment Workspace                     │
│               (/app/assessments — Read-Oriented Single Pane)                 │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 ┌──────────────┐              ┌──────────────┐              ┌──────────────┐
 │ Topology &   │              │ Causal       │              │ Cascade      │
 │ Events       │              │ Evidence     │              │ Forecast     │
 │ (Phase 2/3)  │              │ (Phase 5)    │              │ (Phase 6)    │
 └──────────────┘              └──────────────┘              └──────────────┘
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       │
        ┌──────────────────────────────┴──────────────────────────────┐
        ▼                                                             ▼
 ┌──────────────┐                                             ┌──────────────┐
 │ Counter-     │                                             │ Safety-      │
 │ factual      │                                             │ Constrained  │
 │ Branch       │                                             │ Decisions    │
 │ (Phase 7)    │                                             │ (Phase 8/9)  │
 └──────────────┘                                             └──────────────┘
```

### Core Architecture Capabilities

1. **Non-Mutating Snapshot Assembly:**
   - Assessments are assembled from existing persisted records across Phases 2 through 9.
   - The engine NEVER reruns causal inference, cascade forecasts, counterfactuals, or recommendation optimization simply to render an assessment.
   - Live operational state, telemetry, and event history are never modified.

2. **Source Lineage & Provenance Traceability:**
   - Every material conclusion traces to persisted record IDs (`baseline_id`, `snapshot_id`, `causal_run_id`, `forecast_run_id`, `counterfactual_experiment_id`, `recommendation_run_id`).
   - Causal evidence explicitly tracks supporting, contradicting, and neutral evidence counts alongside observed timestamps and source record types.

3. **Explicit Metric Semantics & Uncertainty:**
   - Distinguishes observed degradation (live fact) from predicted cascade impacts (horizon estimate).
   - Surfaces uncalibrated heuristic scores as `HEURISTIC_ESTIMATE`, disclaiming real-time statistical guarantees.
   - When upstream data is missing, the API surfaces an explicit unavailable state rather than fabricating default zero values.

4. **Human Review & Decision Attribution:**
   - Integrates with Phase 8/9 recommendation decisions (`APPROVED` / `REJECTED`), attributing the human approver's email snapshot and server timestamp.
   - Strictly enforces simulation-only boundaries with no real-world infrastructure actuation.

---

## Security Model (Phase 9 Hardened)

- Environment-based secrets — startup validation rejects production run if `SECRET_KEY` is default or < 32 chars
- Server-side JWT authentication with `bcrypt` password hashing
- Backend-enforced role-based access control (least privilege)
- Human decision attribution derived strictly from authenticated server-side principal
- Append-only security audit trail for authentication, authorization, and review decisions
- Sanitized health endpoints that never leak secrets or connection strings
- Structured error envelopes with request correlation IDs (`X-Correlation-ID`)
- CORS configured per environment

## Design Principles

1. **Separation of concerns** — UI, API, and intelligence engines are clearly bounded
2. **Strong typing** — TypeScript strict mode, Pydantic v2 on backend
3. **Small cohesive modules** — Each file has a single clear purpose
4. **Explicit interfaces** — No magic, no hidden dependencies
5. **Testability** — App factory pattern, dependency injection throughout
6. **Deterministic core services** — No unpredictable AI in the critical path
7. **No premature abstraction** — Build only what is needed for this phase
8. **No unnecessary dependencies** — Every dependency is justified
9. **Security by default** — Secure defaults, never opt-in to security
10. **Reproducible local development** — Any developer can run locally in < 10 minutes
