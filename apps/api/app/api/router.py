"""
CAUSAL API — Root API router (Phase 9 extended).

All versioned API routes are registered here.
New route groups for future phases are added to this file.
"""

from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.graphs import router as graphs_router
from app.api.v1.events import router as events_router, ws_router
from app.api.v1.state import router as state_router
from app.api.v1.causal import router as causal_router
from app.api.v1.cascade import router as cascade_router
from app.api.v1.counterfactuals import router as counterfactuals_router
from app.api.v1.recommendations import router as recommendations_router
from app.api.v1.auth import router as auth_router, users_router  # Phase 9
from app.api.v1.assessments import router as assessments_router  # Phase 10

api_router = APIRouter(prefix="/api/v1")

# ── v1 routes ────────────────────────────────────────────────
api_router.include_router(health_router)
api_router.include_router(graphs_router)
api_router.include_router(events_router)   # Phase 3: Event & Observation Engine
api_router.include_router(ws_router)       # Phase 3: WebSocket event stream
api_router.include_router(state_router)    # Phase 4: System State & Digital Twin Engine
api_router.include_router(causal_router)   # Phase 5: Evidence-Backed Causal Reasoning Engine
api_router.include_router(cascade_router)  # Phase 6: Probabilistic, Time-Aware Cascade Prediction Engine
api_router.include_router(counterfactuals_router)  # Phase 7: Deterministic Counterfactual Simulation Engine
api_router.include_router(recommendations_router)  # Phase 8: Safety-Constrained Intervention Recommendation Engine
api_router.include_router(auth_router)     # Phase 9: Authentication
api_router.include_router(users_router)    # Phase 9: User management (ADMIN)
api_router.include_router(assessments_router)  # Phase 10: Unified Resilience Assessment
