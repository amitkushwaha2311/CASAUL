# CAUSAL — Causal Resilience & Intervention Engine

> **"See the cascade before it happens."**

---

> **Phases 1–9 Complete — Identity, Access Control, Audit Integrity & Operational Readiness**
> CAUSAL has completed Phases 1 through 9.
>
> **Phase 9 Core Security & Operational Boundaries:**
> - Authentic principal derivation: client-supplied `decided_by` claims are strictly discarded; decisions are attributed to the authenticated server-side user.
> - Server-enforced least-privilege RBAC: `VIEWER`, `ANALYST`, `APPROVER`, `ADMIN`.
> - Append-only security audit trail for all authentication, authorization, decision, and administrative events.
> - Real operational readiness probing (`/health/live` process check, `/health/ready` verified database connectivity).
> - CAUSAL remains strictly simulation-only: approved interventions are advisory and never autonomously dispatched.



---

## What is CAUSAL?

CAUSAL is a domain-independent intelligence platform for interconnected cyber-physical systems.

It is designed to:

- **Observe** infrastructure systems and their dependencies
- **Understand** causal relationships between system components
- **Predict** cascading failures before they occur
- **Simulate** counterfactual scenarios
- **Optimize** interventions with human oversight
- **Verify** outcomes and build an evidence trail

### Eventual Workflow

```
OBSERVE → UNDERSTAND → CAUSE → PREDICT → COUNTERFACTUAL
      → OPTIMIZE → VERIFY → HUMAN APPROVAL → ACT/SIMULATE → MEASURE
```

### Supported Infrastructure Domains (planned)

| Domain         | Examples                              |
|----------------|---------------------------------------|
| Power          | Substations, transformers, grid nodes |
| Water          | Pumping stations, treatment plants    |
| Telecom        | Cell towers, routing nodes            |
| Healthcare     | Hospitals, supply chains              |
| Transportation | Rail, road networks, hubs             |
| Industrial     | Factories, SCADA systems              |

---

## Architecture

```
causal/
├── apps/
│   ├── web/          — Next.js 15 + TypeScript + Tailwind CSS (App Router)
│   └── api/          — FastAPI + Python 3.13 + SQLAlchemy + Alembic
├── packages/
│   └── shared/       — Shared TypeScript types
├── docs/             — Architecture, API, research, decisions
├── scripts/          — Utility scripts
├── docker-compose.yml — PostgreSQL for local development
└── .env.example      — Environment variable documentation
```

### Technology Stack

| Layer       | Technology                              |
|-------------|------------------------------------------|
| Frontend    | Next.js 15, React 19, TypeScript 5, Tailwind CSS |
| Backend     | Python 3.13, FastAPI 0.115, Pydantic 2, Uvicorn |
| Database    | PostgreSQL 16, SQLAlchemy 2 (async), Alembic |
| Realtime    | WebSocket (FastAPI, Phase 2+) |
| 3D Viz      | Three.js / React Three Fiber (Phase 3+) |
| Testing     | Pytest (backend), Vitest + RTL (frontend) |
| Code Quality| Ruff, Mypy, ESLint, Prettier |

---

## Local Setup

### Prerequisites

- **Node.js** >= 20
- **Python** >= 3.13
- **Docker Desktop** (for PostgreSQL)
- **npm** >= 10

### 1. Clone and configure environment

```bash
git clone <repository-url> causal
cd causal

# Copy and edit environment variables
cp .env.example .env
# Edit .env — at minimum verify DATABASE_URL is correct
```

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

Wait for PostgreSQL to be healthy:

```bash
docker-compose ps
# causal_postgres should show "healthy"
```

### 3. Set up the API

```bash
cd apps/api

# Create virtual environment
python -m venv .venv

# Activate (Windows)
.\.venv\Scripts\activate

# Activate (macOS/Linux)
source .venv/bin/activate

# Install dependencies
pip install -r requirements/dev.txt

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at: [http://localhost:8000](http://localhost:8000)

API documentation: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)

### 4. Set up the Frontend

Open a new terminal:

```bash
cd apps/web

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be available at: [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

See [`.env.example`](.env.example) for full documentation.

| Variable             | Description                                   | Default              |
|----------------------|-----------------------------------------------|----------------------|
| `DATABASE_URL`       | PostgreSQL async connection URL               | See .env.example     |
| `DATABASE_SYNC_URL`  | PostgreSQL sync URL (Alembic)                 | See .env.example     |
| `NEXT_PUBLIC_API_URL`| API base URL (browser-accessible)             | `http://localhost:8000` |
| `API_URL`            | API base URL (server-side)                    | `http://localhost:8000` |
| `CORS_ORIGINS`       | Comma-separated allowed origins               | `http://localhost:3000` |
| `APP_ENV`            | Environment: development/staging/production   | `development`        |
| `LOG_LEVEL`          | Log level: DEBUG/INFO/WARNING/ERROR/CRITICAL  | `INFO`               |
| `SECRET_KEY`         | Application secret key (future auth)          | Must be set          |

---

## Running Tests

### Backend tests

```bash
cd apps/api
source .venv/bin/activate   # or .\.venv\Scripts\activate on Windows

pytest
```

Tests that require a running database are marked `@pytest.mark.integration`.

To skip integration tests:
```bash
pytest -m "not integration"
```

### Frontend tests

```bash
cd apps/web
npm test
```

---

## Code Quality

### Backend

```bash
cd apps/api
source .venv/bin/activate

# Linting
ruff check .

# Auto-fix
ruff check --fix .

# Type checking
mypy app/
```

### Frontend

```bash
cd apps/web

# Linting
npm run lint

# Type checking
npx tsc --noEmit
```

---

## API Endpoints (Phases 1–6)

### System

| Method | Path                   | Description                        |
|--------|------------------------|------------------------------------|
| GET    | `/api/v1/health`       | Liveness + database connectivity   |
| GET    | `/api/v1/system/info`  | Service version and environment    |
| GET    | `/api/v1/system/status`| API status, DB status, feature flags |

### Infrastructure Graph (Phase 2)

| Method | Path                                          | Description                              |
|--------|-----------------------------------------------|------------------------------------------|
| GET    | `/api/v1/graphs`                              | List all infrastructure graphs           |
| POST   | `/api/v1/graphs`                              | Create a new graph                       |
| GET    | `/api/v1/graphs/{id}`                         | Get graph details                        |
| GET    | `/api/v1/graphs/{id}/statistics`              | Graph topology statistics                |
| GET    | `/api/v1/graphs/{id}/validation`              | Structural validation of graph           |
| GET    | `/api/v1/graphs/{id}/nodes`                   | List nodes in graph                      |
| POST   | `/api/v1/graphs/{id}/nodes`                   | Create a node                            |
| GET    | `/api/v1/graphs/{id}/nodes/{nid}`             | Get node details                         |
| PATCH  | `/api/v1/graphs/{id}/nodes/{nid}`             | Update node                              |
| DELETE | `/api/v1/graphs/{id}/nodes/{nid}`             | Delete node                              |
| GET    | `/api/v1/graphs/{id}/dependencies`            | List dependencies                        |
| POST   | `/api/v1/graphs/{id}/dependencies`            | Create dependency edge                   |
| GET    | `/api/v1/graphs/{id}/events`                  | List events                              |
| POST   | `/api/v1/graphs/{id}/events`                  | Ingest an event                          |
| PATCH  | `/api/v1/graphs/{id}/events/{eid}`            | Update event status                      |
| GET    | `/api/v1/graphs/{id}/event-statistics`        | Aggregated event counts by severity      |
| GET    | `/api/v1/graphs/{id}/timeline`                | Chronological event timeline             |
| GET    | `/api/v1/graphs/{id}/observations`            | List telemetry observations              |
| POST   | `/api/v1/graphs/{id}/observations`            | Ingest an observation                    |

### Digital Twin & State Engine (Phase 4)

| Method | Path                                              | Description                              |
|--------|---------------------------------------------------|------------------------------------------|
| GET    | `/api/v1/graphs/{id}/state`                       | Current composite system state           |
| GET    | `/api/v1/graphs/{id}/state/summary`               | Health and state distribution summary    |
| GET    | `/api/v1/graphs/{id}/state/history`               | Full append-only state history           |
| GET    | `/api/v1/graphs/{id}/state/at`                    | Reconstruct state at a timestamp         |
| GET    | `/api/v1/graphs/{id}/state/consistency`           | Cross-record consistency check           |
| GET    | `/api/v1/graphs/{id}/state/compare`               | Compare baseline vs. current or snapshots|
| GET    | `/api/v1/graphs/{id}/nodes/{nid}/state`           | Current node operational state           |
| GET    | `/api/v1/graphs/{id}/nodes/{nid}/state/history`   | Node-level state history                 |
| POST   | `/api/v1/graphs/{id}/baselines`                   | Capture a system baseline                |
| GET    | `/api/v1/graphs/{id}/baselines`                   | List baselines                           |
| GET    | `/api/v1/graphs/{id}/baselines/{bid}`             | Get baseline details                     |
| POST   | `/api/v1/graphs/{id}/snapshots`                   | Capture a point-in-time snapshot         |
| GET    | `/api/v1/graphs/{id}/snapshots`                   | List snapshots                           |
| POST   | `/api/v1/graphs/{id}/scenarios`                   | Create isolated counterfactual scenario  |
| GET    | `/api/v1/graphs/{id}/scenarios`                   | List scenarios                           |
| GET    | `/api/v1/graphs/{id}/scenarios/{sid}`             | Get scenario details                     |

### Causal Reasoning Engine (Phase 5)

| Method | Path                                                     | Description                                  |
|--------|----------------------------------------------------------|----------------------------------------------|
| POST   | `/api/v1/graphs/{id}/causal/analyze`                     | Run causal hypothesis analysis on an event   |
| GET    | `/api/v1/graphs/{id}/causal/hypotheses`                  | List all generated hypotheses                |
| GET    | `/api/v1/graphs/{id}/causal/hypotheses/{hid}`            | Get hypothesis details                       |
| GET    | `/api/v1/graphs/{id}/causal/hypotheses/{hid}/evidence`   | Get supporting + contradicting evidence      |
| GET    | `/api/v1/graphs/{id}/nodes/{nid}/causal/hypotheses`      | Hypotheses where node is the subject         |

### Cascade Prediction Engine (Phase 6)

| Method | Path                                                     | Description                                   |
|--------|----------------------------------------------------------|-----------------------------------------------|
| POST   | `/api/v1/graphs/{id}/forecasts/cascade`                  | Execute time-aware cascade forecast           |
| GET    | `/api/v1/graphs/{id}/forecasts`                          | List historical forecast runs                 |
| GET    | `/api/v1/graphs/{id}/forecasts/{fid}`                    | Get full forecast details                     |
| GET    | `/api/v1/graphs/{id}/forecasts/{fid}/timeline`           | Chronological cascade event timeline          |
| GET    | `/api/v1/graphs/{id}/forecasts/{fid}/impact`             | Aggregate severity and impact summary         |
| GET    | `/api/v1/graphs/{id}/nodes/{nid}/forecasts`              | Forecasts involving a specific node           |

---

## Phase Roadmap

| Phase | Focus                                                        | Status          |
|-------|--------------------------------------------------------------|------------------|
| 1     | Foundation — FastAPI, PostgreSQL, app factory, health checks | ✅ Completed      |
| 2     | Infrastructure graph model + data ingestion (nodes, deps, events, observations) | ✅ Completed |
| 3     | Graph query engine, statistics, validation, event timeline   | ✅ Completed      |
| 4     | Digital twin state engine — append-only history, baselines, snapshots, scenarios | ✅ Completed |
| 5     | Causal reasoning engine — rule-based hypothesis generation, grounded evidence | ✅ Completed |
| 6     | Probabilistic cascade prediction — time-aware blast-radius forecasting, Monte Carlo | ✅ Completed |
| 7     | Authentication + multi-tenancy                               | 🔲 Planned       |
| 8     | Production hardening + observability                         | 🔲 Planned       |

---

## Contributing

This is a research-grade project.

Before contributing:
1. Read `docs/architecture/overview.md`
2. Read `docs/architecture/decisions.md`
3. Phase 1–6 features are complete — do not refactor existing engines without an ADR
4. Phase 7 (Authentication) work must begin with a new ADR

---

## License

Proprietary — research project.
