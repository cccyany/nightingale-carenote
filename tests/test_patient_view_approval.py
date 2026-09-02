import uuid

import pytest

from tests.supabase_rest import service_session, sign_in
from tests.test_artifact_cleanup import cleanup_patient_content_artifacts


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
def alex_patient_session():
    return sign_in("patient.alex@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


@pytest.fixture(scope="module")
def service():
    return service_session()


@pytest.fixture(autouse=True)
def cleanup_patient_content(service):
    cleanup_patient_content_artifacts(service)
    yield
    cleanup_patient_content_artifacts(service)


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


def test_patient_content_status_transitions_can_reverse_without_403(clinician_session, patient_session, service) -> None:
    title = f"Synthetic patient approval {uuid.uuid4()}"
    body = "Synthetic reviewer decision reversal content."
    status, content_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": SOURCE_ENTRY_ID,
            "p_provenance_span_id": VALID_SPAN_ID,
            "p_title": title,
            "p_body": body,
        },
    )
    assert status == 200, content_id

    status, approved = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status == 200, approved
    assert approved["status"] == "approved"
    status, visible = patient_session.get("patient_facing_content", {"select": "id,status,body", "id": f"eq.{content_id}"})
    assert status == 200
    assert visible == [{"id": content_id, "status": "approved", "body": body}]

    status, rejected = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "rejected"})
    assert status == 200, rejected
    assert rejected["status"] == "rejected"
    status, hidden = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{content_id}"})
    assert status == 200
    assert hidden == []

    status, reversed_approval = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status == 200, reversed_approval
    assert reversed_approval["status"] == "approved"
    assert reversed_approval["body"] == body
    status, visible_again = patient_session.get("patient_facing_content", {"select": "id,status,body", "id": f"eq.{content_id}"})
    assert status == 200
    assert visible_again == [{"id": content_id, "status": "approved", "body": body}]

    status, audit_rows = service.get(
        "audit_events",
        {"select": "action_type,metadata", "resource_id": f"eq.{content_id}", "order": "created_at.asc"},
    )
    assert status == 200, audit_rows
    transitions = [row["metadata"] for row in audit_rows if row["action_type"] == "patient_content.status_changed"]
    assert any(row["previous_status"] == "approved" and row["status"] == "rejected" for row in transitions)
    assert any(row["previous_status"] == "rejected" and row["status"] == "approved" for row in transitions)


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


def test_alex_patient_identity_is_scoped_to_existing_clinic_b_patient(alex_patient_session, clinic_b_staff_session) -> None:
    status, own_patient = alex_patient_session.get("patients", {"select": "id,display_name", "id": f"eq.{CLINIC_B_PATIENT_ID}"})
    assert status == 200
    assert own_patient == [{"id": CLINIC_B_PATIENT_ID, "display_name": "Alex Lim"}]

    status, jane = alex_patient_session.get("patients", {"select": "id", "id": f"eq.{JANE_PATIENT_ID}"})
    assert status == 200
    assert jane == []

    status, internal_entries = alex_patient_session.get(
        "care_entries",
        {"select": "id", "patient_id": f"eq.{CLINIC_B_PATIENT_ID}", "visibility": "eq.staff_internal"},
    )
    assert status == 200
    assert internal_entries == []

    status, bo_visible = clinic_b_staff_session.get("patients", {"select": "id", "id": f"eq.{CLINIC_B_PATIENT_ID}"})
    assert status == 200
    assert bo_visible == [{"id": CLINIC_B_PATIENT_ID}]


def test_editing_approved_patient_content_requires_reapproval_and_is_audited(clinician_session, patient_session, service) -> None:
    title = f"Synthetic dosage approval {uuid.uuid4()}"
    original_body = "Take synthetic metformin 500 mg once daily as approved by the care team."
    edited_body = "Take synthetic metformin 1000 mg once daily as edited by the care team."
    status, content_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": SOURCE_ENTRY_ID,
            "p_provenance_span_id": VALID_SPAN_ID,
            "p_title": title,
            "p_body": original_body,
        },
    )
    assert status == 200, content_id

    status, approved = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status == 200, approved
    assert approved["status"] == "approved"
    assert approved["approved_revision"] == approved["content_revision"]

    status, visible = patient_session.get("patient_facing_content", {"select": "id,body,status", "id": f"eq.{content_id}"})
    assert status == 200
    assert visible == [{"id": content_id, "body": original_body, "status": "approved"}]

    status, edited = clinician_session.rpc(
        "update_patient_facing_content",
        {"p_content_id": content_id, "p_title": title, "p_body": edited_body},
    )
    assert status == 200, edited
    assert edited["body"] == edited_body
    assert edited["status"] == "needs_clinician_approval"
    assert edited["approved_by"] is None
    assert edited["approved_at"] is None
    assert edited["approved_revision"] is None
    assert edited["content_revision"] == approved["content_revision"] + 1

    status, hidden_after_edit = patient_session.get("patient_facing_content", {"select": "id,body,status", "id": f"eq.{content_id}"})
    assert status == 200
    assert hidden_after_edit == []

    status, reapproved = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status == 200, reapproved
    assert reapproved["approved_revision"] == edited["content_revision"]

    status, visible_after_reapproval = patient_session.get("patient_facing_content", {"select": "id,body,status", "id": f"eq.{content_id}"})
    assert status == 200
    assert visible_after_reapproval == [{"id": content_id, "body": edited_body, "status": "approved"}]

    status, audit_rows = service.get(
        "audit_events",
        {"select": "action_type,previous_version,new_version,metadata", "resource_id": f"eq.{content_id}", "order": "created_at.asc"},
    )
    assert status == 200, audit_rows
    edited_events = [row for row in audit_rows if row["action_type"] == "patient_content.edited"]
    assert edited_events
    assert edited_events[-1]["previous_version"] == approved["content_revision"]
    assert edited_events[-1]["new_version"] == edited["content_revision"]
    serialized_metadata = str(edited_events[-1]["metadata"]).lower()
    assert "metformin 1000" not in serialized_metadata
    assert "metformin 500" not in serialized_metadata


def test_rejected_content_edit_resets_to_needs_approval_and_can_be_approved(clinician_session, patient_session) -> None:
    title = f"Synthetic dosage approval {uuid.uuid4()}"
    rejected_body = "Take synthetic metformin 1000 mg once daily."
    corrected_body = "Take synthetic metformin 500 mg once daily."
    status, content_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": SOURCE_ENTRY_ID,
            "p_provenance_span_id": VALID_SPAN_ID,
            "p_title": title,
            "p_body": rejected_body,
        },
    )
    assert status == 200, content_id

    status, rejected = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "rejected"})
    assert status == 200, rejected
    assert rejected["status"] == "rejected"

    status, edited = clinician_session.rpc(
        "update_patient_facing_content",
        {"p_content_id": content_id, "p_title": title, "p_body": corrected_body},
    )
    assert status == 200, edited
    assert edited["status"] == "needs_clinician_approval"
    assert edited["review_status"] == "needs_review"
    assert edited["approved_by"] is None
    assert edited["approved_at"] is None

    status, hidden = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{content_id}"})
    assert status == 200
    assert hidden == []

    status, approved = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status == 200, approved
    assert approved["status"] == "approved"
    assert approved["body"] == corrected_body
    status, visible = patient_session.get("patient_facing_content", {"select": "id,body,status", "id": f"eq.{content_id}"})
    assert status == 200
    assert visible == [{"id": content_id, "body": corrected_body, "status": "approved"}]
