import pytest
import uuid

from tests.supabase_rest import service_session, sign_in
from tests.test_artifact_cleanup import cleanup_glance_artifacts


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINIC_B_PATIENT_ID = "30000000-0000-0000-0000-000000000002"
SYMPTOM_SPAN_ID = "71000000-0000-0000-0000-000000000003"


@pytest.fixture(scope="module")
def service():
    return service_session()


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


@pytest.fixture(autouse=True)
def cleanup_learning_artifacts(service):
    cleanup_glance_artifacts(service)
    yield
    cleanup_glance_artifacts(service)


def _candidate(session, patient_id: str, title: str, feature: str, rule_key: str = "SYMPTOM_PERSISTENT"):
    status, item = session.rpc(
        "create_demo_glance_candidate",
        {
            "p_patient_id": patient_id,
            "p_provenance_span_id": SYMPTOM_SPAN_ID,
            "p_title": title,
            "p_summary": "Synthetic future cough follow-up candidate.",
            "p_rule_key": rule_key,
            "p_feature_key": feature,
            "p_risk": "medium",
            "p_status": "needs_review",
        },
    )
    assert status == 200, item
    return item


def test_adaptive_feedback_increases_similar_future_candidate_with_bounds(clinician_session, service) -> None:
    feature = f"self_learning_cough_{uuid.uuid4()}"
    baseline = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic baseline cough candidate", feature)

    for feedback_type in ["pin", "clinician_confirmation", "manual_highlight", "comment", "pin"]:
        status, payload = clinician_session.rpc(
            "record_importance_feedback",
            {"p_highlight_id": baseline["highlight_id"], "p_feedback_type": feedback_type},
        )
        assert status == 200, payload

    future = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic future cough candidate", feature)

    assert future["importance_score"] > baseline["importance_score"]
    adaptive = future["importance_reasons"]["adaptive"]
    assert 0 < adaptive <= 12
    assert "Clinic care-team feedback" in future["ranking_explanation"]

    status, risk = service.rpc("deterministic_risk_floor", {"p_rule_key": "ALLERGY_CONFLICT", "p_suggested": "low"})
    assert status == 200, risk
    assert risk == "high"


def test_exposure_is_not_rejection_and_explicit_rejection_differs(clinician_session) -> None:
    exposure_feature = f"self_learning_exposure_only_{uuid.uuid4()}"
    baseline = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic exposure baseline", exposure_feature)
    status, payload = clinician_session.rpc(
        "record_importance_feedback",
        {"p_highlight_id": baseline["highlight_id"], "p_feedback_type": "exposure"},
    )
    assert status == 200, payload
    exposed_future = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic exposed future", exposure_feature)
    assert exposed_future["importance_reasons"]["adaptive"] == 0

    rejection_feature = f"self_learning_rejection_{uuid.uuid4()}"
    rejected = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic rejection baseline", rejection_feature)
    status, payload = clinician_session.rpc(
        "record_importance_feedback",
        {"p_highlight_id": rejected["highlight_id"], "p_feedback_type": "rejection"},
    )
    assert status == 200, payload
    rejected_future = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic rejection future", rejection_feature)
    assert rejected_future["importance_reasons"]["adaptive"] < 0
    assert rejected_future["importance_reasons"]["adaptive"] >= -8


def test_clinic_a_feedback_does_not_affect_clinic_b_and_safety_cannot_be_learned_away(
    clinician_session, clinic_b_staff_session
) -> None:
    feature = f"self_learning_clinic_scope_{uuid.uuid4()}"
    a_item = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic Clinic A learning item", feature)
    for _ in range(4):
        status, payload = clinician_session.rpc(
            "record_importance_feedback",
            {"p_highlight_id": a_item["highlight_id"], "p_feedback_type": "pin"},
        )
        assert status == 200, payload

    status, b_item = clinic_b_staff_session.rpc(
        "create_demo_glance_candidate",
        {
            "p_patient_id": CLINIC_B_PATIENT_ID,
            "p_provenance_span_id": SYMPTOM_SPAN_ID,
            "p_title": "Synthetic Clinic B comparison item",
            "p_summary": "Synthetic comparison candidate.",
            "p_rule_key": "SYMPTOM_PERSISTENT",
            "p_feature_key": feature,
            "p_risk": "medium",
            "p_status": "needs_review",
        },
    )
    assert status in {400, 403}, b_item

    safety_feature = f"ALLERGY_CONFLICT_{uuid.uuid4()}"
    safety = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic safety baseline", safety_feature, "ALLERGY_CONFLICT")
    for _ in range(3):
        status, payload = clinician_session.rpc(
            "record_importance_feedback",
            {"p_highlight_id": safety["highlight_id"], "p_feedback_type": "rejection"},
        )
        assert status == 200, payload
    future_safety = _candidate(clinician_session, JANE_PATIENT_ID, "Synthetic safety future", safety_feature, "ALLERGY_CONFLICT")
    assert future_safety["risk"] == "high"
    assert future_safety["importance_reasons"]["adaptive"] >= 0
    assert future_safety["storage_class"] == "HOT"
