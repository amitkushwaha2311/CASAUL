"""
CAUSAL API — Models package.

Import all models here so Alembic's autogenerate can discover them.
Phase 2 adds: InfrastructureGraph, Node, Dependency (in graph_models.py)
"""

from app.models.audit_log import AuditLog, AuditAction
from app.models.mixins import TimestampMixin, UUIDMixin
from app.models.system import System, SystemDomain, SystemStatus
from app.models.user import User
from app.models.graph_models import (
    InfrastructureGraph,
    Node,
    Dependency,
    NodeState,
    HEALTH_MIN,
    HEALTH_MAX,
    CAPACITY_MIN,
    CAPACITY_MAX,
    CRITICALITY_MIN,
    CRITICALITY_MAX,
    STRENGTH_MIN,
    STRENGTH_MAX,
    FAILURE_PROPAGATION_MIN,
    FAILURE_PROPAGATION_MAX,
)
from app.models.event_models import (
    Event,
    Observation,
    EventSeverity,
    EventStatus,
)
from app.models.state_models import (
    StateHistory,
    StateBaseline,
    StateSnapshot,
    Scenario,
    SourceReliability,
    StateConsistencyStatus,
    SourceReliabilityStatus,
)
from app.models.causal_models import (
    CausalInferenceRun,
    CausalHypothesis,
    HypothesisEvidence,
    HypothesisStatus,
    EvidenceDirection,
    HypothesisType,
)
from app.models.cascade_models import (
    CascadeForecastRun,
    CascadePredictedNode,
    CascadePropagationPath,
    CalibrationStatus,
    CascadeNodeForecastStatus,
    CascadeImpactLevel,
    SimulationMode,
    DelaySource,
)
from app.models.counterfactual_models import (
    CounterfactualExperiment,
    CounterfactualChange,
    CounterfactualComparison,
    CounterfactualExperimentStatus,
    CounterfactualTargetType,
    CounterfactualChangeType,
)
from app.models.recommendation_models import (
    InterventionRecommendationRun,
    CandidateIntervention,
    SafetyConstraintEvaluation,
    RecommendationRunStatus,
    SafetyStatus,
    EligibilityStatus,
    DecisionStatus,
    ConstraintType,
    ConstraintStatus,
)
from app.models.assessment_models import (
    ResilienceAssessment,
    AssessmentStatus,
)

__all__ = [
    # Phase 1 models
    "AuditAction",
    "AuditLog",
    "System",
    "SystemDomain",
    "SystemStatus",
    "TimestampMixin",
    "UUIDMixin",
    "User",
    # Phase 2 models
    "Dependency",
    "InfrastructureGraph",
    "Node",
    "NodeState",
    # Phase 2 constants
    "HEALTH_MIN",
    "HEALTH_MAX",
    "CAPACITY_MIN",
    "CAPACITY_MAX",
    "CRITICALITY_MIN",
    "CRITICALITY_MAX",
    "STRENGTH_MIN",
    "STRENGTH_MAX",
    "FAILURE_PROPAGATION_MIN",
    "FAILURE_PROPAGATION_MAX",
    # Phase 3 models
    "Event",
    "Observation",
    "EventSeverity",
    "EventStatus",
    # Phase 4 models
    "StateHistory",
    "StateBaseline",
    "StateSnapshot",
    "Scenario",
    "SourceReliability",
    "StateConsistencyStatus",
    "SourceReliabilityStatus",
    # Phase 5 models
    "CausalInferenceRun",
    "CausalHypothesis",
    "HypothesisEvidence",
    "HypothesisStatus",
    "EvidenceDirection",
    "HypothesisType",
    # Phase 6 models
    "CascadeForecastRun",
    "CascadePredictedNode",
    "CascadePropagationPath",
    "CalibrationStatus",
    "CascadeNodeForecastStatus",
    "CascadeImpactLevel",
    "SimulationMode",
    "DelaySource",
    # Phase 7 models
    "CounterfactualExperiment",
    "CounterfactualChange",
    "CounterfactualComparison",
    "CounterfactualExperimentStatus",
    "CounterfactualTargetType",
    "CounterfactualChangeType",
    # Phase 8 models
    "InterventionRecommendationRun",
    "CandidateIntervention",
    "SafetyConstraintEvaluation",
    "RecommendationRunStatus",
    "SafetyStatus",
    "EligibilityStatus",
    "DecisionStatus",
    "ConstraintType",
    "ConstraintStatus",
    # Phase 10 models
    "ResilienceAssessment",
    "AssessmentStatus",
]


