import json
import uuid

import pytest

from tests.supabase_rest import service_session, sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


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


def test_runtime_ai_scribe_entry_has_transcript_source_provenance_and_remains_internal(
    clinician_session, patient_session, clinic_b_staff_session, service
) -> None:
    run_id = uuid.uuid4()
    raw_transcript = f"patient: Synthetic runtime cough {run_id} for three weeks.\nclinician: Repeat renal panel discussed."
    evidence = f"patient: Synthetic runtime cough {run_id} for three weeks."
    source_label = f"Runtime synthetic AI Scribe test {run_id}"
    generated_payload = {
        "provider": "deterministic_mock",
        "provider_display": "Deterministic mock",
        "model": "deterministic_mock",
        "review_state": "unverified",
        "source_label": source_label,
        "source_session_identifier": None,
        "generated": json.dumps({
            "summary": "Synthetic runtime cough summary.",
            "key_points": ["Repeat renal panel discussed."],
            "review_state": "needs_review",
        }),
    }

    status, session = clinician_session.rpc(
        "create_transcript_session",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_label": source_label,
            "p_segments": [
                {
                    "speaker": "patient",
                    "start_ms": 0,
                    "end_ms": 2500,
                    "text": f"Synthetic runtime cough {run_id} for three weeks.",
                    "confidence": 0.85,
                    "uncertain": False,
                },
                {
                    "speaker": "clinician",
                    "start_ms": 2600,
                    "end_ms": 5200,
                    "text": "Repeat renal panel discussed.",
                    "confidence": 0.85,
                    "uncertain": False,
                },
            ],
        },
    )
    assert status == 200, session
    generated_payload["source_session_identifier"] = session["id"]

    status, entry_id = clinician_session.rpc(
        "ingest_ai_scribed_note",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "ai_doctor_consult_summary",
            "p_content": json.dumps(generated_payload),
            "p_source_label": source_label,
            "p_session_identifier": session["id"],
        },
    )
    assert status == 200, entry_id

    status, span_id = clinician_session.rpc(
        "create_provenance_for_transcript_span",
        {
            "p_entry_id": entry_id,
            "p_source_content": raw_transcript,
            "p_evidence_text": evidence,
            "p_char_start": 0,
            "p_char_end": len(evidence),
            "p_source_label": source_label,
            "p_session_identifier": session["id"],
            "p_transcript_start_ms": 0,
            "p_transcript_end_ms": 2500,
        },
    )
    assert status == 200, span_id

    status, resolution = service.rpc("validate_provenance_span", {"p_span_id": span_id})
    assert status == 200, resolution
    assert resolution["ok"] is True
    assert resolution["source_kind"] == "transcript"
    assert resolution["source_session_identifier"] == session["id"]
    assert raw_transcript[resolution["char_start"]:resolution["char_end"]] == resolution["evidence_text"]

    status, entries = clinician_session.get(
        "care_entries",
        {"select": "id,entry_type,author_role,visibility,content", "id": f"eq.{entry_id}"},
    )
    assert status == 200, entries
    assert entries[0]["entry_type"] == "ai_doctor_consult_summary"
    assert entries[0]["author_role"] == "system"
    assert entries[0]["visibility"] == "ai_internal"
    assert json.loads(entries[0]["content"])["review_state"] == "unverified"

    status, hidden_from_patient = patient_session.get("care_entries", {"select": "id", "id": f"eq.{entry_id}"})
    assert status == 200
    assert hidden_from_patient == []

    status, hidden_from_clinic_b = clinic_b_staff_session.get("care_entries", {"select": "id", "id": f"eq.{entry_id}"})
    assert status == 200
    assert hidden_from_clinic_b == []


def test_patient_cannot_invoke_internal_ai_scribe_ingest(patient_session) -> None:
    status, response = patient_session.rpc(
        "ingest_ai_scribed_note",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "ai_patient_session_summary",
            "p_content": "Patient should not be able to create internal AI notes.",
            "p_source_label": "Forbidden patient AI Scribe test",
            "p_session_identifier": None,
        },
    )
    assert status in {400, 401, 403}, response
