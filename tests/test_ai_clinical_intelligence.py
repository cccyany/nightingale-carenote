import uuid

import pytest

from tests.supabase_rest import service_session, sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINIC_A_ID = "20000000-0000-0000-0000-000000000001"
AI_MEDICATION_ENTRY_ID = "40000000-0000-0000-0000-000000000009"
SYMPTOM_SPAN_ID = "71000000-0000-0000-0000-000000000003"


@pytest.fixture(scope="module")
def service():
    return service_session()


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def patient_session():
    return sign_in("patient.jane@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


def test_ai_extracted_candidate_has_exact_usable_provenance(service) -> None:
    status, rows = service.get(
        "provenance_spans",
        {
            "select": "id,entry_id,entry_version_id,char_start,char_end,evidence_text",
            "entry_id": f"eq.{AI_MEDICATION_ENTRY_ID}",
            "evidence_text": "eq.metformin stopped",
        },
    )
    assert status == 200, rows
    assert rows
    span = rows[0]

    status, resolution = service.rpc("validate_provenance_span", {"p_span_id": span["id"]})
    assert status == 200, resolution
    assert resolution["ok"] is True
    assert resolution["entry_id"] == AI_MEDICATION_ENTRY_ID
    assert resolution["char_start"] == span["char_start"]
    assert resolution["char_end"] == span["char_end"]
    assert resolution["evidence_text"] == "metformin stopped"

    status, versions = service.get("entry_versions", {"select": "content", "id": f"eq.{resolution['version_id']}"})
    assert status == 200, versions
    content = versions[0]["content"]
    assert content[resolution["char_start"]:resolution["char_end"]] == resolution["evidence_text"]


def test_invalid_evidence_span_abstains_from_trusted_fact(clinician_session, service) -> None:
    status, entry = clinician_session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "clinician_note",
            "p_visibility": "clinician_internal",
            "p_content": f"Synthetic extraction base {uuid.uuid4()}.",
        },
    )
    assert status == 200, entry
    status, span_id = clinician_session.rpc(
        "create_provenance_for_entry_span",
        {
            "p_entry_id": entry["id"],
            "p_evidence_text": "text that is not present",
            "p_char_start": 0,
            "p_char_end": 6,
            "p_source_label": "Invalid extraction test",
        },
    )
    assert status == 200, span_id
    status, fact_id = clinician_session.rpc(
        "upsert_fact_from_span",
        {
            "p_entry_id": entry["id"],
            "p_entity_type": "medication",
            "p_normalized_entity": "metformin",
            "p_value": None,
            "p_unit": None,
            "p_assertion": "present",
            "p_provenance_span_id": span_id,
            "p_confidence": 0.9,
            "p_review_status": "confirmed",
            "p_extraction_method": "deterministic_test",
        },
    )
    assert status == 200, fact_id

    status, fact_rows = service.get("clinical_facts", {"select": "review_status,source_version_id", "id": f"eq.{fact_id}"})
    assert status == 200, fact_rows
    assert fact_rows == [{"review_status": "needs_review", "source_version_id": None}]


def test_conflict_detection_preserves_traceable_allergy_medication_and_dose_conflicts(service) -> None:
    status, conflicts = service.get(
        "fact_conflicts",
        {"select": "id,conflict_type,fact_a_id,fact_b_id,status", "patient_id": f"eq.{JANE_PATIENT_ID}"},
    )
    assert status == 200, conflicts
    by_type = {row["conflict_type"]: row for row in conflicts}
    for conflict_type in ["ALLERGY_CONFLICT", "MEDICATION_CONFLICT", "MEDICATION_DOSE_CONFLICT"]:
        assert conflict_type in by_type
        assert by_type[conflict_type]["status"] == "unresolved"
        for fact_key in ["fact_a_id", "fact_b_id"]:
            status, fact_rows = service.get(
                "clinical_facts",
                {"select": "id,provenance_span_id", "id": f"eq.{by_type[conflict_type][fact_key]}"},
            )
            assert status == 200, fact_rows
            assert fact_rows and fact_rows[0]["provenance_span_id"]
            status, resolution = service.rpc("validate_provenance_span", {"p_span_id": fact_rows[0]["provenance_span_id"]})
            assert status == 200, resolution
            assert resolution["ok"] is True

        status, risk = service.rpc("deterministic_risk_floor", {"p_rule_key": conflict_type, "p_suggested": "low"})
        assert status == 200, risk
        assert risk == "high"


def test_unapproved_patient_generated_content_is_hidden_until_clinician_approval(
    clinician_session, patient_session, clinic_b_staff_session
) -> None:
    title = f"Synthetic approved summary {uuid.uuid4()}"
    status, content_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": "40000000-0000-0000-0000-000000000003",
            "p_provenance_span_id": SYMPTOM_SPAN_ID,
            "p_title": title,
            "p_body": "Clinician-approved synthetic summary: cough follow-up was reviewed.",
        },
    )
    assert status == 200, content_id

    status, hidden = patient_session.get("patient_facing_content", {"select": "id,title", "id": f"eq.{content_id}"})
    assert status == 200
    assert hidden == []

    status, approved = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status == 200, approved
    assert approved["status"] == "approved"
    assert approved["approved_by"]
    assert approved["approved_at"]

    status, visible = patient_session.get("patient_facing_content", {"select": "id,title,body,status", "id": f"eq.{content_id}"})
    assert status == 200, visible
    assert visible == [{
        "id": content_id,
        "title": title,
        "body": "Clinician-approved synthetic summary: cough follow-up was reviewed.",
        "status": "approved",
    }]

    status, clinic_b_rows = clinic_b_staff_session.get("patient_facing_content", {"select": "id", "id": f"eq.{content_id}"})
    assert status == 200
    assert clinic_b_rows == []


def test_unresolved_provenance_cannot_be_approved_or_published(clinician_session, service, patient_session) -> None:
    source_id = str(uuid.uuid4())
    span_id = str(uuid.uuid4())
    status, versions = service.get(
        "entry_versions",
        {"select": "id", "entry_id": "eq.40000000-0000-0000-0000-000000000003", "version_number": "eq.1"},
    )
    assert status == 200, versions
    version_id = versions[0]["id"]
    status, inserted_source = service.postgrest_insert("provenance_sources", {
        "id": source_id,
        "clinic_id": CLINIC_A_ID,
        "patient_id": JANE_PATIENT_ID,
        "source_entry_id": "40000000-0000-0000-0000-000000000003",
        "source_version_id": version_id,
        "source_kind": "entry",
        "source_label": "Invalid patient publication source",
    })
    assert status in {200, 201}, inserted_source
    status, inserted_span = service.postgrest_insert("provenance_spans", {
        "id": span_id,
        "source_id": source_id,
        "entry_id": "40000000-0000-0000-0000-000000000003",
        "entry_version_id": version_id,
        "char_start": 0,
        "char_end": 5,
        "evidence_text": "Mismatch",
    })
    assert status in {200, 201}, inserted_span

    status, content_id = clinician_session.rpc(
        "create_patient_facing_draft",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_entry_id": "40000000-0000-0000-0000-000000000003",
            "p_provenance_span_id": span_id,
            "p_title": "Synthetic unresolved draft",
            "p_body": "This should not be publishable.",
        },
    )
    assert status == 200, content_id
    status, blocked = clinician_session.rpc("set_patient_content_status", {"p_content_id": content_id, "p_status": "approved"})
    assert status in {400, 409}, blocked

    status, patient_rows = patient_session.get("patient_facing_content", {"select": "id", "id": f"eq.{content_id}"})
    assert status == 200
    assert patient_rows == []
