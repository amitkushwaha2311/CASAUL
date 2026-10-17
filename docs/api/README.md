# CAUSAL API — Documentation

> Phase 1 Foundation

## Base URL

```
http://localhost:8000
```

## API Versioning

All endpoints are prefixed with `/api/v1`.

## Authentication

Not implemented in Phase 1.
Authentication will be added in a future phase.

## Response Format

### Success responses

Success responses return the data directly as a JSON object.

### Error responses

All errors return a consistent envelope:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}  // optional — only present when additional context is available
  }
}
```

### Error codes

| Code                    | HTTP Status | Description                        |
|-------------------------|-------------|-------------------------------------|
| `HTTP_ERROR`            | varies      | HTTP protocol error                 |
| `VALIDATION_ERROR`      | 422         | Request body or parameter invalid   |
| `INTERNAL_SERVER_ERROR` | 500         | Unhandled server error              |
| `RESOURCE_NOT_FOUND`    | 404         | Requested resource does not exist   |

---

## Endpoints

### `GET /api/v1/health`

Liveness and database connectivity check.

**Response 200 (healthy)**

```json
{
  "status": "healthy",
  "database": "connected",
  "version": "0.1.0"
}
```

**Response 200 (degraded)**

```json
{
  "status": "degraded",
  "database": "unavailable",
  "version": "0.1.0"
}
```

---

### `GET /api/v1/system/info`

Returns service metadata.

**Response 200**

```json
{
  "service": "causal-api",
  "version": "0.1.0",
  "environment": "development",
  "phase": "1 — Foundation"
}
```

---

### `GET /api/v1/system/status`

Returns aggregated platform status including feature flags.

**Response 200**

```json
{
  "api": "operational",
  "database": "connected",
  "version": "0.1.0",
  "features": {
    "causal_engine": false,
    "simulation": false,
    "interventions": false
  }
}
```

---

### Phase 2: Graph Engine API

Phase 2 introduces the Infrastructure Graph API under `/api/v1/graphs`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/graphs` | List all infrastructure graphs |
| POST | `/api/v1/graphs` | Create a new graph |
| GET | `/api/v1/graphs/{id}` | Get graph details |
| GET | `/api/v1/graphs/{id}/statistics` | Graph statistics |
| GET | `/api/v1/graphs/{id}/validation` | Structural validation |
| GET | `/api/v1/graphs/{id}/nodes` | List nodes in graph |
| GET | `/api/v1/graphs/{id}/dependencies` | List dependencies in graph |
| GET | `/api/v1/graphs/{id}/nodes/{node_id}/upstream` | Upstream impact |
| GET | `/api/v1/graphs/{id}/nodes/{node_id}/downstream` | Downstream impact |
| GET | `/api/v1/graphs/{id}/paths` | Path finding |

---

### Phase 4: System State & Digital Twin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/graphs/{id}/state` | Canonical current state of all nodes |
| GET | `/api/v1/graphs/{id}/nodes/{node_id}/state` | Canonical current state of a node |
| GET | `/api/v1/graphs/{id}/nodes/{node_id}/state/history` | Append-only state history for a node |
| GET | `/api/v1/graphs/{id}/state/history` | Append-only state history for graph |
| GET | `/api/v1/graphs/{id}/state/at?timestamp=...` | Historical state reconstruction at timestamp |
| GET | `/api/v1/graphs/{id}/nodes/{node_id}/state/at?timestamp=...` | Node historical state reconstruction |
| GET | `/api/v1/graphs/{id}/state/consistency` | Centralized state consistency validation |
| POST | `/api/v1/graphs/{id}/baselines` | Capture immutable reference state baseline |
| GET | `/api/v1/graphs/{id}/baselines` | List captured baselines |
| GET | `/api/v1/graphs/{id}/baselines/{baseline_id}` | Retrieve specific baseline |
| POST | `/api/v1/graphs/{id}/snapshots` | Capture immutable state snapshot |
| GET | `/api/v1/graphs/{id}/snapshots` | List captured snapshots |
| GET | `/api/v1/graphs/{id}/snapshots/{snapshot_id}` | Retrieve specific snapshot |
| GET | `/api/v1/graphs/{id}/state/compare?baseline_id=...` | Baseline vs current state comparison |
| GET | `/api/v1/graphs/{id}/state/compare?snapshot_a=...` | Snapshot vs current or snapshot vs snapshot comparison |
| POST | `/api/v1/graphs/{id}/scenarios` | Create isolated scenario snapshot container |
| GET | `/api/v1/graphs/{id}/scenarios` | List scenarios |
| GET | `/api/v1/graphs/{id}/scenarios/{scenario_id}` | Retrieve scenario |
| GET | `/api/v1/graphs/{id}/state/summary` | Descriptive graph-level state summary |

---

### Phase 5: Causal Reasoning & Evidence Engine Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/graphs/{id}/causal/analyze` | Execute deterministic causal hypothesis generation |
| GET | `/api/v1/graphs/{id}/causal/hypotheses` | List persisted causal hypotheses with optional filtering |
| GET | `/api/v1/graphs/{id}/causal/hypotheses/{hypothesis_id}` | Retrieve a specific hypothesis by ID |
| GET | `/api/v1/graphs/{id}/causal/hypotheses/{hypothesis_id}/evidence` | Retrieve traceable supporting/contradicting evidence items |
| GET | `/api/v1/graphs/{id}/nodes/{node_id}/causal/hypotheses` | Retrieve hypotheses for a specific affected node |

---


## Interactive API Docs

When running in development mode, interactive documentation is available at:

- **Swagger UI**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
- **ReDoc**: [http://localhost:8000/api/redoc](http://localhost:8000/api/redoc)
- **OpenAPI JSON**: [http://localhost:8000/api/openapi.json](http://localhost:8000/api/openapi.json)

Docs are disabled in production mode.

