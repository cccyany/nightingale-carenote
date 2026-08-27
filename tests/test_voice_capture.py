import pytest

from tests.test_redaction import MockProvider, safe_gateway
from tests.supabase_rest import service_session, sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def patient_session():
    return sign_in("patient.jane@example.test")


@pytest.fixture(scope="module")
def service():
    return service_session()


def test_synthetic_transcript_is_redacted_before_llm_provider_invocation() -> None:
    provider = MockProvider()
    raw_transcript = "patient: Jane Tan S1234567D says call +65 9123 4567.\nclinician: repeat renal panel discussed."

    result = safe_gateway(raw_transcript, provider)

    assert result["ok"] is True
    assert provider.received
    assert "Jane Tan" not in provider.received[0]
    assert "S1234567D" not in provider.received[0]
    assert "+65 9123 4567" not in provider.received[0]


def test_voice_transcript_session_ai_entry_and_timestamp_provenance_persist(clinician_session, service) -> None:
    status, session = clinician_session.rpc(
        "create_transcript_session",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_label": "Synthetic ambient consult test",
            "p_segments": [
                {
                    "speaker": "patient",
                    "start_ms": 1200,
                    "end_ms": 4200,
                    "text": "Synthetic cough discussed.",
                    "confidence": 0.85,
                    "uncertain": False,
                },
                {
                    "speaker": "clinician",
                    "start_ms": 4300,
                    "end_ms": 7100,
                    "text": "[uncertain] renal panel follow-up.",
                    "confidence": 0.55,
                    "uncertain": True,
                },
            ],
        },
    )
    assert status == 200, session

    status, entry_id = clinician_session.rpc(
        "ingest_ai_scribed_note",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "ai_doctor_consult_summary",
            "p_content": "Synthetic ambient summary.",
            "p_source_label": "Synthetic ambient consult test",
            "p_session_identifier": session["id"],
        },
    )
    assert status == 200, entry_id
    status, span_id = clinician_session.rpc(
        "create_provenance_for_entry_span",
        {
            "p_entry_id": entry_id,
            "p_evidence_text": "Synthetic ambient summary.",
            "p_char_start": 0,
            "p_char_end": 26,
            "p_source_kind": "transcript",
            "p_source_label": "Synthetic ambient consult test",
            "p_transcript_start_ms": 1200,
            "p_transcript_end_ms": 4200,
        },
    )
    assert status == 200, span_id

    status, resolution = service.rpc("validate_provenance_span", {"p_span_id": span_id})
    assert status == 200, resolution
    assert resolution["ok"] is True
    assert resolution["char_start"] == 0
    assert resolution["char_end"] == 26

    status, segments = service.get("transcript_segments", {"select": "speaker,start_ms,end_ms,uncertain", "session_id": f"eq.{session['id']}", "order": "start_ms.asc"})
    assert status == 200, segments
    assert [segment["speaker"] for segment in segments] == ["patient", "clinician"]
    assert segments[1]["uncertain"] is True


def test_patient_cannot_read_raw_transcript_or_ai_scribed_voice_note(patient_session, service) -> None:
    status, sessions = service.get("transcript_sessions", {"select": "id", "patient_id": f"eq.{JANE_PATIENT_ID}", "limit": "1"})
    assert status == 200, sessions
    if not sessions:
        pytest.skip("voice transcript fixture was not created")
    status, hidden_sessions = patient_session.get("transcript_sessions", {"select": "id", "id": f"eq.{sessions[0]['id']}"})
    assert status == 200
    assert hidden_sessions == []
    status, hidden_entries = patient_session.get("care_entries", {"select": "id", "entry_type": "eq.ai_doctor_consult_summary"})
    assert status == 200
    assert hidden_entries == []
