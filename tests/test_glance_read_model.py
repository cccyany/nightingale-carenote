import pytest

from tests.supabase_rest import sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


@pytest.fixture(scope="module")
def patient_session():
    return sign_in("patient.jane@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


def test_warm_glance_read_uses_persisted_ranked_items_without_ai_work(staff_session) -> None:
    status, rows = staff_session.rpc("read_patient_glance", {"p_patient_id": JANE_PATIENT_ID})

    assert status == 200, rows
    assert 1 <= len(rows) <= 5
    scores = [row["importance_score"] for row in rows]
    assert scores == sorted(scores, reverse=True)
    for row in rows:
        assert row["importance_reasons"]
        assert row["storage_class"] in {"HOT", "WARM", "COLD"}
        assert row["ranking_explanation"]
        assert row["provenance_span_id"]


def test_glance_security_definer_stays_clinic_scoped(staff_session, patient_session, clinic_b_staff_session) -> None:
    patient_status, patient_rows = patient_session.rpc("read_patient_glance", {"p_patient_id": JANE_PATIENT_ID})
    assert patient_status in {401, 403}, patient_rows

    other_clinic_status, other_clinic_rows = clinic_b_staff_session.rpc("read_patient_glance", {"p_patient_id": JANE_PATIENT_ID})
    assert other_clinic_status in {401, 403}, other_clinic_rows

    missing_status, missing_rows = staff_session.rpc(
        "read_patient_glance",
        {"p_patient_id": "30000000-0000-0000-0000-000000009999"},
    )
    assert missing_status == 200, missing_rows
    assert missing_rows == []
