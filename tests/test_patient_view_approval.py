import uuid

import pytest

from tests.supabase_rest import service_session, sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINIC_B_PATIENT_ID = "30000000-0000-0000-0000-000000000002"
SOURCE_ENTRY_ID = "40000000-0000-0000-0000-000000000003"
VALID_SPAN_ID = "71000000-0000-0000-0000-000000000003"


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def patient_session():
    return sign_in("patient.jane@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


@pytest.fixture(scope="module")
def service():
    return service_session()


def test_patient_view_rls_exposes_only_approved_own_content(
    clinician_session, patient_session, clinic_b_staff_session
) -> None:
    title = f"Synthetic patient approval {uuid.uuid4()}"
    status, content_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": SOURCE_ENTRY_ID,
            "p_provenance_span_id": VALID_SPAN_ID,
            "p_title": title,
            "p_body": "Synthetic approved instruction.",
        },
    )
    assert status == 200, content_id

    status, hidden = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{content_id}"})
    assert status == 200
    assert hidden == []

    status, approved = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status == 200, approved
    assert approved["approved_by"]
    assert approved["approved_at"]

    status, visible = patient_session.get("patient_facing_content", {"select": "id,title,status", "id": f"eq.{content_id}"})
    assert status == 200
    assert visible == [{"id": content_id, "title": title, "status": "approved"}]

    status, cross_clinic = clinic_b_staff_session.get("patient_facing_content", {"select": "id", "id": f"eq.{content_id}"})
    assert status == 200
    assert cross_clinic == []


def test_rejected_and_low_trust_patient_content_cannot_publish(clinician_session, patient_session, service) -> None:
    status, rejected_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": SOURCE_ENTRY_ID,
            "p_provenance_span_id": VALID_SPAN_ID,
            "p_title": f"Synthetic rejected draft {uuid.uuid4()}",
            "p_body": "Synthetic rejected patient content.",
        },
    )
    assert status == 200, rejected_id
    status, rejected = clinician_session.rpc("set_patient_content_status", {"p_content_id": rejected_id, "p_status": "rejected"})
    assert status == 200, rejected
    assert rejected["status"] == "rejected"
    assert rejected["review_status"] == "rejected"
    status, rows = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{rejected_id}"})
    assert status == 200
    assert rows == []

    status, low_trust_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": SOURCE_ENTRY_ID,
            "p_provenance_span_id": VALID_SPAN_ID,
            "p_title": f"Synthetic low trust draft {uuid.uuid4()}",
            "p_body": "Synthetic low trust patient content.",
        },
    )
    assert status == 200, low_trust_id
    status, patched = service.patch(
        "patient_facing_content",
        {"id": f"eq.{low_trust_id}"},
        {"evidence_confidence": 0.5, "review_status": "needs_review"},
    )
    assert status == 200, patched
    status, blocked = clinician_session.rpc("set_patient_content_status", {"p_content_id": low_trust_id, "p_status": "approved"})
    assert status in {400, 409}, blocked
    status, rows = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{low_trust_id}"})
    assert status == 200
    assert rows == []


def test_patient_cannot_read_internal_notes_comments_or_other_patient(patient_session) -> None:
    for table, params in [
        ("care_entries", {"select": "id", "visibility": "eq.ai_internal"}),
        ("care_entries", {"select": "id", "visibility": "eq.staff_internal"}),
        ("care_entries", {"select": "id", "visibility": "eq.clinician_internal"}),
        ("comments", {"select": "id", "visibility": "eq.internal"}),
        ("patients", {"select": "id", "id": f"eq.{CLINIC_B_PATIENT_ID}"}),
    ]:
        status, rows = patient_session.get(table, params)
        assert status == 200
        assert rows == []
