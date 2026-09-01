import uuid

import pytest

from tests.supabase_rest import service_session, sign_in
from tests.test_artifact_cleanup import cleanup_entry_artifacts, cleanup_patient_content_artifacts


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


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


@pytest.fixture(autouse=True)
def cleanup_patient_workflow_artifacts(service):
    cleanup_patient_content_artifacts(service)
    cleanup_entry_artifacts(service)
    yield
    cleanup_patient_content_artifacts(service)
    cleanup_entry_artifacts(service)


def _create_source(session, content: str, occurred_at: str = "2026-08-26T08:00:00+08:00"):
    status, entry = session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "clinician_note",
            "p_visibility": "clinician_internal",
            "p_content": content,
            "p_occurred_at": occurred_at,
        },
    )
    assert status == 200, entry
    return entry


def _create_ai_source(session, content: str):
    status, entry_id = session.rpc(
        "ingest_ai_scribed_note",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "ai_doctor_consult_summary",
            "p_content": content,
            "p_source_label": "Synthetic patient-facing workflow AI source",
            "p_session_identifier": f"patient-facing-workflow-{uuid.uuid4()}",
        },
    )
    assert status == 200, entry_id
    return entry_id


def _draft(session, source_ids: list[str], title_prefix: str, generation_method: str = "manual", body: str = "Patient-friendly synthetic draft."):
    status, draft = session.rpc(
        "create_patient_facing_draft_from_sources",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_ids": source_ids,
            "p_content_type": "visit_summary",
            "p_generation_method": generation_method,
            "p_title": f"{title_prefix} {uuid.uuid4()}",
            "p_body": body,
        },
    )
    assert status == 200, draft
    return draft


def _source_links(service, content_id: str):
    status, rows = service.get(
        "patient_content_sources",
        {
            "select": "source_entry_id,source_version_id,provenance_span_id,source_label",
            "patient_content_id": f"eq.{content_id}",
            "order": "created_at.asc",
        },
    )
    assert status == 200, rows
    return rows


def test_manual_creation_starts_needs_approval_and_is_patient_hidden(clinician_session, patient_session) -> None:
    source = _create_source(clinician_session, f"Synthetic patient-facing source manual {uuid.uuid4()}")
    draft = _draft(
        clinician_session,
        [source["id"]],
        "Synthetic manual patient draft",
        "manual",
        "Please continue the synthetic care plan discussed with your care team.",
    )

    assert draft["status"] == "needs_clinician_approval"
    assert draft["generation_method"] == "manual"
    assert draft["source_count"] == 1
    status, rows = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{draft['id']}"})
    assert status == 200
    assert rows == []


def test_ai_assisted_draft_from_one_ai_scribe_source_has_provenance(clinician_session, service) -> None:
    source_id = _create_ai_source(clinician_session, f"Synthetic patient-facing source AI summary {uuid.uuid4()}")
    draft = _draft(
        clinician_session,
        [source_id],
        "Synthetic generated patient draft",
        "ai_assisted",
        "You discussed a synthetic cough update with your care team.",
    )

    assert draft["status"] == "needs_clinician_approval"
    assert draft["generation_method"] == "ai_assisted"
    assert draft["evidence_confidence"] == 0.75
    links = _source_links(service, draft["id"])
    assert [row["source_entry_id"] for row in links] == [source_id]
    status, validation = service.rpc("validate_provenance_span", {"p_span_id": links[0]["provenance_span_id"]})
    assert status == 200, validation
    assert validation["ok"] is True


def test_multiple_sources_and_partial_date_selection_store_only_selected_entries(clinician_session, service) -> None:
    selected_a = _create_source(clinician_session, f"Synthetic patient-facing source selected A {uuid.uuid4()}", "2026-08-26T09:00:00+08:00")
    selected_b = _create_source(clinician_session, f"Synthetic patient-facing source selected B {uuid.uuid4()}", "2026-08-26T09:30:00+08:00")
    unselected = _create_source(clinician_session, f"Synthetic patient-facing source unselected {uuid.uuid4()}", "2026-08-26T10:00:00+08:00")

    draft = _draft(
        clinician_session,
        [selected_a["id"], selected_b["id"]],
        "Synthetic partial-date patient draft",
        "ai_assisted",
    )
    links = _source_links(service, draft["id"])
    assert {row["source_entry_id"] for row in links} == {selected_a["id"], selected_b["id"]}
    assert unselected["id"] not in {row["source_entry_id"] for row in links}
    assert draft["source_count"] == 2


def test_source_version_provenance_survives_source_edit(clinician_session, service) -> None:
    original = f"Synthetic patient-facing V1 source original {uuid.uuid4()}"
    source = _create_source(clinician_session, original)
    draft = _draft(clinician_session, [source["id"]], "Synthetic versioned patient draft", "ai_assisted")
    link = _source_links(service, draft["id"])[0]

    status, edit = clinician_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": source["id"],
            "p_expected_version": 1,
            "p_content": f"Synthetic patient-facing V1 source changed {uuid.uuid4()}",
            "p_change_reason": "source changed after patient-facing draft",
        },
    )
    assert status == 200, edit
    assert edit["version"] == 2

    status, validation = service.rpc("validate_provenance_span", {"p_span_id": link["provenance_span_id"]})
    assert status == 200, validation
    assert validation["ok"] is True
    assert validation["version_id"] == link["source_version_id"]
    status, versions = service.get("entry_versions", {"select": "content,version_number", "id": f"eq.{link['source_version_id']}"})
    assert status == 200, versions
    assert versions == [{"content": original, "version_number": 1}]


def test_approve_reject_and_edit_generated_draft_preserve_patient_visibility(clinician_session, patient_session) -> None:
    source = _create_source(clinician_session, f"Synthetic patient-facing source approval {uuid.uuid4()}")
    draft = _draft(clinician_session, [source["id"]], "Synthetic generated patient draft", "ai_assisted", "Synthetic patient-safe V1.")

    status, approved = clinician_session.rpc("set_patient_content_status", {"p_content_id": draft["id"], "p_status": "approved"})
    assert status == 200, approved
    status, visible = patient_session.get("patient_facing_content", {"select": "id,body,status", "id": f"eq.{draft['id']}"})
    assert status == 200
    assert visible == [{"id": draft["id"], "body": "Synthetic patient-safe V1.", "status": "approved"}]

    status, edited = clinician_session.rpc(
        "update_patient_facing_content",
        {"p_content_id": draft["id"], "p_title": draft["title"], "p_body": "Synthetic patient-safe V2 requiring review."},
    )
    assert status == 200, edited
    assert edited["status"] == "needs_clinician_approval"
    status, hidden = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{draft['id']}"})
    assert status == 200
    assert hidden == []

    status, rejected = clinician_session.rpc("set_patient_content_status", {"p_content_id": draft["id"], "p_status": "rejected"})
    assert status == 200, rejected
    assert rejected["status"] == "rejected"
    status, hidden_after_reject = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{draft['id']}"})
    assert status == 200
    assert hidden_after_reject == []


def test_clinic_b_cannot_create_or_view_jane_patient_content(clinic_b_staff_session, clinician_session) -> None:
    source = _create_source(clinician_session, f"Synthetic patient-facing source clinic isolation {uuid.uuid4()}")
    status, blocked = clinic_b_staff_session.rpc(
        "create_patient_facing_draft_from_sources",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_ids": [source["id"]],
            "p_content_type": "visit_summary",
            "p_generation_method": "manual",
            "p_title": f"Synthetic manual patient draft {uuid.uuid4()}",
            "p_body": "Clinic B should not create this.",
        },
    )
    assert status in {400, 403}, blocked

    draft = _draft(clinician_session, [source["id"]], "Synthetic manual patient draft", "manual")
    status, rows = clinic_b_staff_session.get("patient_facing_content", {"select": "id", "id": f"eq.{draft['id']}"})
    assert status == 200
    assert rows == []
