# CAUSAL — Staging Deployment & Demo Runbook

**Phase 11 | Simulation-Only System | Version 0.11.0**

---

## Overview

CAUSAL is a domain-independent Causal Resilience & Intervention Engine. This runbook covers:

- Local development startup
- Staging deployment with Docker Compose
- Database migration verification
- Demo walkthrough (17-step workflow)
- Troubleshooting

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.13+ | Backend API |
| Node.js | 22+ | Frontend |
| PostgreSQL | 16 | Production/staging; SQLite used in dev/test |
| Docker & Docker Compose | 29+ | Staging deployment |

---

## 1. Local Development Startup

### Backend (FastAPI)

```bash
cd apps/api

# Create virtual environment (first time only)
python -m venv .venv
.venv/Scripts/pip install -r requirements/base.txt   # Windows
# or: .venv/bin/pip install -r requirements/base.txt  # Linux/Mac

# Configure environment
cp .env.example .env        # edit DATABASE_URL, SECRET_KEY
# For SQLite (dev/test):
# DATABASE_URL=sqlite+aiosqlite:///./test.db

# Run migrations (SQLite dev mode)
.venv/Scripts/alembic upgrade head

# Start development server
.venv/Scripts/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs available at: http://localhost:8000/docs

### Frontend (Next.js)

```bash
cd apps/web

npm install
npm run dev
```

Frontend available at: http://localhost:3000

---

## 2. Staging Deployment with Docker Compose

### Required Environment Variables

Create `.env.staging` in the project root:

```bash
# JWT signing key — MUST be a strong random value >=32 chars
CAUSAL_SECRET_KEY=<generate with: python -c "import secrets; print(secrets.token_hex(32))">

# PostgreSQL password
POSTGRES_PASSWORD=<strong-random-password>
```

### Deploy

```bash
# Export environment variables
set -a && source .env.staging && set +a   # Linux/Mac
# On Windows PowerShell:
$env:CAUSAL_SECRET_KEY = "<your-key>"
$env:POSTGRES_PASSWORD = "<your-password>"

# Build and start all services
docker compose -f docker-compose.staging.yml up --build -d

# Watch logs
docker compose -f docker-compose.staging.yml logs -f

# Run database migrations
docker compose -f docker-compose.staging.yml exec api \
  /venv/bin/alembic upgrade head
```

### Service URLs

| Service | URL | Notes |
|---|---|---|
| Web frontend | http://localhost:3000 | Next.js |
| API | http://localhost:8000 | FastAPI |
| API docs | http://localhost:8000/docs | Swagger UI |
| Health live | http://localhost:8000/api/v1/health/live | Liveness probe |
| Health ready | http://localhost:8000/api/v1/health/ready | Readiness probe |
| PostgreSQL | localhost:5432 | DB: causal_db, user: causal |

---

## 3. Alembic Migration Chain

All 10 migrations form a verified contiguous chain:

```
<base> → e09ac39151e3 → a1b2c3d4e5f6 → a18668ddffdc → b2c3d4e5f6a7
       → c3d4e5f6a7b8 → d4e5f6a7b8c9 → e5f6a7b8c9d0 → f6a7b8c9d0e1
       → a7b8c9d0e1f2 → b8c9d0e1f2a3  (head)
```

Verify current state:

```bash
cd apps/api && .venv/Scripts/alembic current
```

---

## 4. Demo User Accounts

> [!WARNING]
> In all shared and staging environments, set strong random passwords via environment variables. Do not store credentials in code or repository files.

| Role | Email | Purpose / Capabilities |
|---|---|---|
| Admin | `admin@causal.local` | Full platform administration, user management, audit logs |
| Approver | `approver@causal.local` | Approve / reject candidate recommendations |
| Analyst | `analyst@causal.local` | Full analysis, scenarios, counterfactuals, forecasts |
| Viewer | `viewer@causal.local` | Read-only inspection of graphs, state, and reports |

Seed the initial platform accounts using the user seeding script:

```bash
cd apps/api

# Option A: Seed default local development users
.venv/Scripts/python -m app.scripts.seed_users

# Option B: In non-dev environments, override admin password via environment:
# $env:CAUSAL_ADMIN_PASS = (python -c "import secrets; print(secrets.token_hex(16))")
```

---

## 5. 17-Step Demo Workflow

Follow these steps to demonstrate the complete CAUSAL workflow:

| Step | Action | Endpoint | Notes |
|---|---|---|---|
| 1 | Liveness check | `GET /api/v1/health/live` | Returns `{"status":"alive"}` |
| 2 | Readiness check | `GET /api/v1/health/ready` | Returns database connectivity status |
| 3 | Authenticate | `POST /api/v1/auth/login` | Authenticate with email/password to obtain JWT |
| 4 | Verify identity | `GET /api/v1/auth/me` | Confirm authenticated role (e.g. `ADMIN`) |
| 5 | Create graph | `POST /api/v1/graphs` | Create new infrastructure topology graph |
| 6 | Add nodes | `POST /api/v1/graphs/{id}/nodes` | Add router, server, and database nodes (`type`, `criticality`) |
| 7 | Add dependencies | `POST /api/v1/graphs/{id}/dependencies` | Add dependency relationships (`source_node_id`, `target_node_id`, `dependency_type`) |
| 8 | Record event | `POST /api/v1/graphs/{id}/events` | Record infrastructure failure event (`source`, `timestamp`) |
| 9 | Capture snapshot | `POST /api/v1/graphs/{id}/snapshots` | Capture system state snapshot |
| 10 | Causal analysis | `POST /api/v1/graphs/{id}/causal/analyze` | Execute causal reasoning engine |
| 11 | List hypotheses | `GET /api/v1/graphs/{id}/causal/hypotheses` | Retrieve evidence-backed causal hypotheses |
| 12 | Forecast cascade | `POST /api/v1/graphs/{id}/forecasts/cascade` | Run time-aware probabilistic cascade simulation |
| 13 | Counterfactual | `POST /api/v1/graphs/{id}/counterfactuals` | Define hypothetical change experiment |
| 14 | Recommendation | `POST /api/v1/graphs/{id}/recommendations/runs` | Generate safety-constrained intervention candidates |
| 15 | Check audit trail | `GET /api/v1/users/audit-logs` | Inspect immutable security audit log (ADMIN only) |
| 16 | Assessment | `POST /api/v1/graphs/{id}/assessments` | Assemble unified resilience intelligence assessment |
| 17 | RBAC check | `GET /api/v1/auth/me` (no token) | Confirm unauthenticated requests to auth-protected endpoints return 401 |

### Run the E2E Test Suite Automatically

```bash
# Can be run directly (starts local test server automatically if not running):
cd apps/api
.venv/Scripts/pytest ../../tests/e2e/test_e2e_workflow.py -v
```

---

## 6. Automated Build Gates

All of these must pass before release:

```bash
# Backend unit + integration tests
cd apps/api
.venv/Scripts/pytest app/tests/ -q

# Frontend type check
cd apps/web
npm run typecheck

# Frontend lint (warnings OK, zero errors required)
npm run lint

# Frontend tests
npm test -- --run

# Frontend production build
npm run build
```

---

## 7. PostgreSQL Verification

> [!IMPORTANT]
> Docker Desktop must be running for staging verification. In CI, use a PostgreSQL service container.

```bash
# Check container status
docker compose -f docker-compose.staging.yml ps

# Connect to PostgreSQL
docker compose -f docker-compose.staging.yml exec postgres \
  psql -U causal -d causal_db -c "\dt"

# Run migrations
docker compose -f docker-compose.staging.yml exec api \
  /venv/bin/alembic upgrade head

# Verify migration head
docker compose -f docker-compose.staging.yml exec api \
  /venv/bin/alembic current
```

**Current Status**: PostgreSQL is verified at the schema and migration definition level (10 revisions).
Live Docker staging deployment and live migration execution remain **BLOCKED** because the Docker engine daemon
is not running in this development environment. The Dockerfiles and `docker-compose.staging.yml` have been corrected
with proper monorepo build contexts, browser-accessible API URLs, and strict non-default credential enforcement.
Full live deployment verification can only be completed once Docker and PostgreSQL services are active.

---

## 8. Security Boundaries

> [!CAUTION]
> CAUSAL is simulation-only. No automated real-world infrastructure actuation is permitted.

- JWT tokens expire after 30 minutes (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Logout is client-side token discard; tokens remain valid server-side until expiry (by design — stateless JWT)
- All user actions are recorded in the immutable audit log
- Audit records cannot be modified or deleted through any user-facing API endpoint
- `SECRET_KEY` must be set to a strong random value in all non-development environments
- CORS is restricted to configured origins only

---

## 9. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `401 Unauthorized` on all requests | Invalid or expired token | Re-authenticate via `/api/v1/auth/token` |
| `403 Forbidden` | Insufficient role | Use an account with the required role |
| API health returns `unavailable` | DB connection failed | Check `DATABASE_URL` and PostgreSQL status |
| `alembic current` shows no head | Migrations not applied | Run `alembic upgrade head` |
| Docker build fails | Docker daemon not running | Start Docker Desktop |
| Frontend build fails | TypeScript errors | Run `npm run typecheck` and fix errors |

---

## 10. Architecture Reference

```
┌─────────────────────────────────────────────────────────────┐
│                      CAUSAL Platform                         │
│                                                             │
│  ┌──────────────┐     ┌──────────────┐    ┌─────────────┐  │
│  │  Next.js 16  │────▶│  FastAPI     │────▶│ PostgreSQL  │  │
│  │  (Frontend)  │     │  (API)       │    │ (Database)  │  │
│  │  Port 3000   │     │  Port 8000   │    │  Port 5432  │  │
│  └──────────────┘     └──────────────┘    └─────────────┘  │
│                              │                              │
│                    ┌─────────────────┐                      │
│                    │  Engine Layer   │                      │
│                    │ • Causal (PC)   │                      │
│                    │ • Cascade Sim   │                      │
│                    │ • Forecast      │                      │
│                    │ • Counterfact.  │                      │
│                    │ • Recommend.    │                      │
│                    │ • Assessment    │                      │
│                    └─────────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

Phases implemented: 1–11 (complete)
