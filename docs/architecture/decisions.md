# CAUSAL — Architecture Decision Records (ADR)

> Phase 1 Foundation

Decisions that shaped the Phase 1 architecture.

---

## ADR-001: Monorepo structure

**Status:** Accepted

**Context:**
CAUSAL is a multi-component platform. Multiple components need to share types and evolve together.

**Decision:**
Use a monorepo with `apps/` for deployable applications and `packages/` for shared code.
Keep it flat — no build tool (Turborepo, Nx) is introduced in Phase 1.

**Rationale:**
Build tools add complexity. Phase 1 has two apps. This can be added in Phase 2 if needed.

---

## ADR-002: Next.js App Router

**Status:** Accepted

**Context:**
Next.js supports two routing models: Pages Router and App Router.

**Decision:**
Use the App Router (introduced in Next.js 13, stable in Next.js 14+).

**Rationale:**
The App Router is the future of Next.js. It supports React Server Components which will be
important for the data-heavy analytics views in later phases. A migration from Pages Router
would be costly.

---

## ADR-003: PostgreSQL only

**Status:** Accepted

**Context:**
Complex architectures often add databases for specialised use cases (graph DBs, time series, etc.).

**Decision:**
Use PostgreSQL only in Phase 1. Do not add Neo4j, InfluxDB, Redis, or Kafka.

**Rationale:**
PostgreSQL with JSONB can handle the Phase 1 use cases. The JSONB metadata column on the
System model provides schema flexibility for future graph data. Specialist databases will be
evaluated in Phase 2 when the infrastructure graph model is defined.

---

## ADR-004: SQLAlchemy async

**Status:** Accepted

**Context:**
FastAPI is async-first. Using sync SQLAlchemy would block the event loop.

**Decision:**
Use `sqlalchemy[asyncio]` with `asyncpg` as the PostgreSQL driver.

**Rationale:**
Consistent with FastAPI's async model. Prevents event loop blocking under load.

**Tradeoff:**
Alembic requires a sync connection. `DATABASE_SYNC_URL` is provided for this purpose.

---

## ADR-005: App factory pattern

**Status:** Accepted

**Context:**
Testing FastAPI applications that use module-level initialization is brittle.

**Decision:**
Use `create_application()` factory in `factory.py`. `main.py` is a thin entry point only.

**Rationale:**
Tests can call `create_application()` with overridden settings.
Avoids import-time side effects.

---

## ADR-006: No authentication in Phase 1

**Status:** Accepted

**Context:**
Authentication adds complexity and slows down the foundation work.

**Decision:**
No authentication in Phase 1. The `User` model is created but no auth flows exist.

**Rationale:**
Authentication is a dedicated design problem. JWT, OAuth, API keys, or SAML each have
different tradeoffs. This decision will be made deliberately in a future phase.

**Note:**
The `SECRET_KEY` environment variable is provisioned now so auth can be added without
environment variable changes.

---

## ADR-007: No LLM integration in Phase 1

**Status:** Accepted

**Context:**
There is pressure to add LLM-based reasoning early for demo purposes.

**Decision:**
No LLM integration in Phase 1. No LangChain, LangGraph, or OpenAI SDK.

**Rationale:**
CAUSAL's core value is in its causal reasoning engine, not in LLM-generated text.
LLMs will be used for explanation and reporting only (not for determining root cause).
Adding an LLM in Phase 1 would create dependencies that are hard to remove and would
obscure the platform's real intelligence.

---

## ADR-008: Structured logging with structlog

**Status:** Accepted

**Context:**
Plain `print()` or `logging.info()` produces unstructured text that is hard to parse in production.

**Decision:**
Use `structlog` for all backend logging.

**Rationale:**
Structlog produces machine-parseable key-value logs. Correlation IDs can be injected.
Switching to a log aggregator (Datadog, Loki) later requires no code changes.

---

## ADR-009: TypeScript strict mode

**Status:** Accepted

**Context:**
Loose TypeScript provides false confidence. Type errors at runtime are costly.

**Decision:**
Enable `strict: true` in `tsconfig.json`.

**Rationale:**
Stricter types mean fewer runtime surprises. The cost is a few extra type annotations.

---

## ADR-010: Feature flags for future phases

**Status:** Accepted

**Context:**
As features are added in later phases, it must be possible to enable them incrementally.

**Decision:**
All Phase 2+ features are behind `ENABLE_*` environment variable flags, defaulting to `false`.

**Rationale:**
Allows safe deployment of new features without a full release gate.
## ADR-011: Local Development SQLite Fallback

**Status:** Accepted (Phase 2)

**Context:**
Local development environments often struggle to run PostgreSQL or developers want zero-dependency local setups.

**Decision:**
Support SQLite via `sqlite+aiosqlite` for local dev/testing by removing `pool_size` and `max_overflow` requirements and using `sa.JSON()` instead of `postgresql.JSONB()`.

**Rationale:**
Maintains high developer velocity while retaining production PostgreSQL support.

---

## ADR-014: Deterministic Digital Twin State Model & Append-Only History

**Status:** Accepted (Phase 4)

**Context:**
A digital twin of complex infrastructure requires a canonical, deterministic representation of system state over time. The engine must integrate physical, operational, cyber/digital, and environmental observations without domain-specific schema coupling or speculative causal inference.

**Decision:**
1. **Authoritative Operational State:** Phase 2 `Node` records remain the operational current-state record, updated by validated observations and operator actions.
2. **Immutable Append-Only History:** Phase 4 `StateHistory` records validated state updates with auditable provenance linking back to Phase 3 observations and events.
3. **Deterministic State Reconstruction:** Historical state at timestamp $T$ is reconstructed by chronologically evaluating records up to $T$ using deterministic tie-breaking (observed_at ASC, recorded_at ASC, id ASC).
4. **Strict Phase Boundaries (No Causal Inference):** State history documents *what* the system state was and *what evidence* supports it. It does not predict future failure (Phase 6) or infer causality (Phase 5).
5. **Baselines & Snapshots:** Baselines and snapshots are immutable upon capture and provide reference points for state drift comparisons.
6. **Scenario Isolation:** Scenarios are isolated containers with state overrides that never mutate live operational node states.

**Rationale:**
Guarantees reproducibility, auditability, and safety across heterogeneous infrastructure domains (power, water, telecom, healthcare, transport) without premature machine learning or uncontrolled state mutations.

---

## ADR-015: Deterministic, Evidence-Backed Causal Hypotheses & Traceability

**Status:** Accepted (Phase 5)

**Context:**
Operational incidents require root cause exploration. However, treating dependency graph paths, correlation, or temporal precedence alone as definitive proof of causation leads to false confidence and unsafe operational decisions. Incidents may stem from upstream dependency failures, local internal hardware defects, or telemetry noise.

**Decision:**
1. **Hypotheses Rather Than Confirmed Root Causes:** Generated explanations are explicitly modeled and displayed as *hypotheses* (`SUPPORTED`, `POSSIBLE`, `CONTRADICTED`, `INSUFFICIENT_EVIDENCE`), never as guaranteed truths.
2. **Deterministic, Domain-Independent Rule Heuristics:**
   - `RULE_UPSTREAM_DEPENDENCY_PRECEDENCE`: Grounded in graph predecessors (`source -> target`, where target depends on source). Evaluates upstream degradation and temporal precedence. Healthy upstreams explicitly trigger `CONTRADICTED` status with contradicting evidence.
   - `RULE_LOCAL_FAILURE_ISOLATION`: Generates localized failure hypotheses when direct upstreams are healthy, isolated from external ripples.
   - `RULE_TELEMETRY_INTEGRITY_CHECK`: Detects low sensor confidence (< 0.5) to capture false-alarms or telemetry anomalies without suppressing physical hypotheses.
3. **Traceable Supporting & Contradicting Evidence:** Every evidence item points directly to authentic database records (`events.id`, `observations.id`, `dependencies.id`, `state_history.id`). No synthetic or fabricated records are permitted. Contradictory records are retained alongside supporting records.
4. **No Calibrated Causal Probabilities:** Do not invent causal probabilities by multiplying dependency strengths or sensor confidences. Confidence reflects observation certainty, not causal truth.
5. **Preservation of Competing Hypotheses:** When multiple mechanisms remain plausible, they are preserved as separate hypotheses with distinguishing information notes.
6. **Strict Phase Boundaries:** Does NOT predict future cascades or time-to-impact (Phase 6), nor evaluate counterfactual simulations (Phase 7) or interventions (Phase 8).

---

## ADR-016: Probabilistic, Time-Aware Cascade Prediction Engine

**Status:** Accepted (Phase 6)

**Context:**
Operational teams need early warning of potential downstream failure cascades before disruptions ripple through critical infrastructure. However:
1. A dependency path (`source → target`) is NOT proof that failure will propagate. Propagation depends on coupling strength, redundancy, required status, and physical characteristics.
2. Statistically calibrated propagation probabilities require extensive historical failure datasets that are unavailable for novel topologies. Inventing arbitrary probabilities gives dangerous false certainty.
3. Propagation delays cannot be assumed instantaneous; however, without sensor-level propagation delay telemetry, precise timestamps cannot be fabricated.
4. Forecasts must remain strictly advisory and simulation-only; they must never mutate live operational state or issue commands to physical systems.

**Decision:**
1. **Established Dependency Direction Semantics:**
   - Follows canonical direction: `source → target` means *target depends on source*. Disruption at `source` propagates downstream to `target`.
   - Traversal flows forward along dependencies, never backwards against dependencies.
2. **Explicit Observed vs. Predicted Distinction:**
   - Distinguishes `ALREADY_AFFECTED` (initial observed failures/degradations) from `PREDICTED_AFFECTED` (modeled possible future states) and `UNAFFECTED`.
   - Never displays a forecast as an observed physical failure.
3. **Transparent Heuristic Probability Intervals:**
   - Clearly labeled as `HEURISTIC_ESTIMATE` (uncalibrated), never falsely claimed as empirical probability.
   - Computes bounded intervals `[min_prob, max_prob]` and point estimates from edge coupling factors (`strength`, `failure_propagation`, and `required` dependency status). Weak, non-required edges attenuate propagation.
4. **Time-Aware Propagation & Delays:**
   - Evaluates delay from edge metadata (`propagation_delay_seconds`) where available (`delay_source: METADATA`).
   - Where absent, uses documented heuristic domain defaults (`power`: 60s, `telecom`: 120s, `water`: 600s, `default`: 300s) labeled `delay_source: HEURISTIC_DEFAULT`, reporting time-to-impact as a range `[min_seconds, max_seconds]`.
5. **Cycle Prevention & Bounded Traversal:**
   - Tracks visited chains to prevent infinite loops in cyclic graphs.
   - Enforces strict simulation horizon (e.g. 60m) and traversal depth limits (e.g. max 5 hops).
   - Prevents double-counting when multiple paths reach the same downstream node.
6. **Deterministic Reproducibility:**
   - Produces 100% identical results for identical inputs. Stochastic Monte Carlo mode uses fixed, configurable seeds.
7. **Auditable Persistence without Live State Mutation:**
   - Persists all forecast runs, predicted node states, and propagation paths in dedicated audit tables (`cascade_forecast_runs`, `cascade_predicted_nodes`, `cascade_propagation_paths`).
   - Does NOT mutate live `Node.state` or `Node.health`.
8. **Scope Boundaries:**
   - Does NOT implement Phase 7 counterfactual what-if simulation, Phase 8 intervention optimization, or autonomous physical control.

**Rationale:**
Provides actionable, uncertainty-aware early warning forecasts while strictly adhering to safety, auditability, and mathematical integrity.

---

## ADR-017: Paired-Branch Differential Counterfactual Simulation Engine

**Status:** Accepted (Phase 7)

**Context:**
Engineers need to ask: *"Under the same baseline conditions, how might the system's projected outcome differ if a specific hypothetical intervention were applied?"*
However:
1. Comparing simulations with different baselines, time horizons, or model parameters produces biased and misleading comparisons.
2. In-memory mutations risk contaminating live infrastructure state if shared objects or live database tables are touched.
3. Interventions cannot be guaranteed real-world outcomes; they remain model-dependent simulations.

**Decision:**
1. **Paired-Branch Fairness:** Every counterfactual experiment executes two paired branches (Baseline Branch A and Counterfactual Branch B) under strictly identical baseline state, horizon, depth, and random seed. Only the declared hypothetical interventions differ.
2. **Deep-Copy Isolation:** Hypothetical overrides are applied to in-memory deep copies of baseline node states and topology. Live database tables (`nodes`, `dependencies`, `state_history`, `observations`, `events`) are never modified.
3. **Differential Comparison Audit:** Differences are explicitly categorized into `PREVENTED` (baseline only), `NEW_IMPACT` (counterfactual only), `TIMING_DIFFER` (delayed or accelerated), and `SEVERITY_DIFFER`.
4. **Mandatory Uncertainty Disclosures:** All outputs disclose heuristic probability bounds and model assumptions.

---

## ADR-018: Separation of Deterministic Safety Verification from Optimization and Ranking

**Status:** Accepted (Phase 8)

**Context:**
In infrastructure resilience and intervention recommendation, optimization models evaluate candidate interventions by projected benefit (e.g. reduction in cascade blast radius, prevented downstream failures).
However, high utility or high projected prevention must **never** excuse, soften, or bypass physical and operational safety boundaries. If safety constraints are folded directly into an optimization objective function (e.g. as penalty terms or soft constraints), an optimizer can and will accept unsafe candidates if the reward from prevented failures outweighs the penalty.

In life-critical and mission-critical infrastructure (power grids, water purification, healthcare facilities, telecom backbones), safety violations cannot be traded off against optimization rewards.

**Decision:**
1. **Hard Deterministic Safety Gate Preceding Evaluation:**
   Safety constraint evaluation is strictly decoupled from candidate ranking. Every candidate intervention must deterministically satisfy all active safety constraints (`PROTECTED_NODE_HEALTH`, `BOUNDED_VALUE_RANGE`, `SEVERANCE_CRITICALITY_GUARD`, `NO_CROSS_GRAPH_MUTATION`) before entering Phase 7 counterfactual cascade simulation and ranking.
2. **Absolute Ineligibility:**
   Any candidate violating a safety constraint is permanently designated `INELIGIBLE` (`safety_status: UNSAFE`). Its ranking score is suppressed (`rank_score: null`, `rank_position: null`). A high potential mitigation impact never overrides safety ineligibility.
3. **No Autonomous Real-World Actuation:**
   CAUSAL remains simulation-only. Interventions are recommendations for human review. Approving or rejecting a candidate records an auditable human review signoff (`APPROVED` / `REJECTED`), but never issues actuation commands to live systems.
4. **Deterministic Ranking of Eligible Candidates Only:**
   Only verified safe and eligible candidates are passed to the Phase 7 paired counterfactual engine, evaluated for differential impact, and ranked via the deterministic, transparent multi-objective scoring formula:
   $$\text{RankScore} = 0.50 \cdot \left(\frac{\text{prevented\_nodes}}{\max(\text{baseline\_affected}, 1)}\right) + 0.30 \cdot \max\left(0, \frac{\Delta\text{blast\_radius}}{\max(\text{baseline\_blast\_radius}, 1)}\right) - 0.20 \cdot \left(\frac{\text{new\_impact\_nodes}}{\max(\text{total\_nodes}, 1)}\right)$$

**Rationale:**
Guarantees absolute safety compliance, eliminates optimization compromise of physical constraints, ensures complete transparency, and maintains a strict human-in-the-loop operational safety boundary.

---

## ADR-019: Server-Enforced Identity, RBAC, Audit Integrity & Operational Readiness

**Status:** Accepted (Phase 9)

**Context:**
CAUSAL was originally built with open endpoints to enable agile development of graph, event, causal, cascade, counterfactual, and recommendation engines. Transitioning to controlled multi-user operations requires hardening:
1. Client-supplied reviewer names (e.g. `decided_by`) can be forged or impersonated if not validated server-side.
2. Sensitive state-changing endpoints (running simulations, approving interventions, configuring accounts) require server-enforced role-based access control (RBAC).
3. Security-sensitive events must be preserved in an auditable trail without exposing passwords, tokens, or credentials.
4. Operational monitoring requires separate liveness and readiness probes to avoid orchestrator restart thrashing during database maintenance.
5. Production startup must fail closed if secrets are insecure or unconfigured.

**Decision:**
1. **Replaceable Authentication Boundary:**
   - Implemented local JWT authentication with HMAC-SHA256 (`HS256`) and `bcrypt` password hashing.
   - Credentials and tokens are verified strictly on the server; client claims are never trusted blindly.
   - Clear decoupling enables drop-in replacement with an enterprise IdP (OIDC/SAML) by replacing token decoding in `app.core.auth` while preserving the `get_current_user` FastAPI dependency interface.
2. **Minimal Role-Based Access Control (RBAC):**
   - Four hierarchical privilege roles:
     - `VIEWER`: Read-only access to authorized graphs, node states, forecasts, and recommendation runs.
     - `ANALYST`: Viewer privileges plus executing scenarios, simulations, and recommendation runs.
     - `APPROVER`: Analyst privileges plus recording recommendation review decisions (`APPROVED` / `REJECTED`).
     - `ADMIN`: Approver privileges plus user account provisioning, role updates, deactivation, and viewing audit logs.
   - Enforced on the backend via injectable FastAPI dependencies (`require_role`, `require_admin`, `require_approver`, etc.). Inaccessible endpoints return `401 Unauthorized` (unauthenticated) or `403 Forbidden` (insufficient role).
3. **Authentic Decision Attribution:**
   - On `POST /graphs/{graph_id}/recommendations/runs/{run_id}/candidates/{candidate_id}/decision`, caller-supplied `decided_by` in the request body is explicitly discarded.
   - The decision attribution is derived strictly from `current_user.email` of the authenticated principal.
   - Historical recommendation records with unverified legacy strings are preserved with original provenance intact and never falsely backfilled as verified identities.
4. **Append-Only Security Audit Trail:**
   - `audit_logs` records authentication outcomes (`auth.login_success`, `auth.login_failure`, `auth.logout`), authorization denials (`authz.denied`), human decisions (`decision.approved`, `decision.rejected`), and administrative actions (`user.created`, `user.role_changed`, `user.deactivated`).
   - Timestamps are server-generated (`CURRENT_TIMESTAMP`).
   - Ordinary API users have no UPDATE/DELETE capabilities on audit records.
   - *Limitation:* Database-level physical immutability (WORM storage / RLS) is not claimed; superusers with direct database shell access can modify rows.
5. **Operational Health & Readiness Semantics:**
   - `GET /api/v1/health/live`: Lightweight process liveness probe. Always returns 200 while the application runs.
   - `GET /api/v1/health/ready`: Dependency readiness probe. Issues `SELECT 1` to verify database connectivity; returns 200 when connected, 503 Service Unavailable when unreachable. Sanitized against credential leakage.
   - Production startup check validates that `SECRET_KEY` is not the default fallback and has $\ge 32$ characters, aborting startup immediately if unsafe.

**Rationale:**
Establishes reliable server-side identity and access boundaries while keeping CAUSAL strictly simulation-only and maintaining backward compatibility with Phases 1–8.

---

## ADR-020: Unified Resilience Assessment & Evidence-Backed Decision Workspace

**Status:** Accepted (Phase 10)

**Context:**
Phases 1 through 9 implemented specialized engines for graph topology (Phase 2), event telemetry (Phase 3), state baselines/scenarios (Phase 4), causal hypothesis inference (Phase 5), cascade forecasting (Phase 6), counterfactual branch simulation (Phase 7), safety-constrained recommendation optimization (Phase 8), and authentication/RBAC (Phase 9).
However, an operations engineer investigating system health previously had to manually inspect fragmented screens across the application.
Phase 10 requires assembling these cross-phase records into a single, cohesive, evidence-backed resilience intelligence workspace without re-running expensive simulations, fabricating missing telemetry, or introducing autonomous real-world actuation.

**Decision:**

1. **Read-Oriented Snapshot Model with Source Lineage:**
   - Introduced `resilience_assessments` table and read-oriented assembly service (`app.services.assessment_service.py`).
   - An assessment links explicit source record IDs (`baseline_id`, `snapshot_id`, `causal_run_id`, `forecast_run_id`, `counterfactual_experiment_id`, `recommendation_run_id`).
   - The server validates graph ownership for all linked records and rejects cross-graph linkages.

2. **No Engine Re-Execution & No Metric Fabrication:**
   - The assessment service reads directly from existing persisted records; it NEVER re-runs causal inference, cascade forecasting, counterfactual branching, or recommendation optimization.
   - When a source record is not linked, deleted, or incomplete, the API surfaces an explicit unavailable state (`causal_available: false`, `hypotheses_total: null`, `missing_sources: [...]`).
   - Null values are NEVER presented as measured zeros.

3. **Strict Observed vs Predicted Distinction:**
   - Telemetry health states and active events are labeled as live observed facts.
   - Forward propagation impacts along dependency edges are labeled as predicted cascade estimates, bounded by explicit horizon parameters.
   - Uncalibrated synthetic decay curves are explicitly marked as `HEURISTIC_ESTIMATE`, disclaiming calibrated probability guarantees.

4. **Forensic Evidence Lineage & Contradictory Evidence Preservation:**
   - Causal conclusions preserve supporting, contradicting, and neutral evidence counts and items with observed timestamps and source record references.
   - Missing evidence and unresolved assumptions are explicitly exposed.

5. **Counterfactual & Safety-Constrained Recommendation Review:**
   - Counterfactual comparisons display side-by-side branch metrics: prevented nodes, newly introduced nodes, shared affected nodes, and timing differences.
   - Recommendations review surfaces multi-objective rankings, deterministic safety constraint outcomes (`PASS` / `FAIL` / `INDETERMINATE`), and immutable human decision attribution (`decided_by`, `decided_at`).

6. **Authorization & Audit Integration:**
   - List and retrieval operations require `VIEWER` permission on the authorized graph.
   - Assessment assembly requires `ANALYST` or higher role.
   - Assessment creation is logged in the append-only `audit_logs` table.
   - Sensitive credentials, password hashes, and tokens are strictly excluded from assessment representations.

**Rationale:**
Provides engineers with an auditable, deterministic, and transparent single pane of glass for resilience decision support while maintaining zero mutation of operational state and absolute simulation-only boundaries.



