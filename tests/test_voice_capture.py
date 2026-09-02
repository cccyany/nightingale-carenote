import pytest

from tests.test_redaction import MockProvider, safe_gateway
from tests.supabase_rest import service_session, sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


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


def test_voice_transcript_session_ai_entry_and_timestamp_provenance_persist(staff_session, service) -> None:
    status, session = staff_session.rpc(
        "create_voice_capture_session",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_label": "Synthetic ambient consult test",
            "p_provider": "deterministic_mock",
            "p_model": "deterministic_transcription",
            "p_audio_metadata": {"mode": "pytest"},
        },
    )
    assert status == 200, session
    assert session["status"] == "transcribing"

    status, completed = staff_session.rpc(
        "complete_voice_transcription",
        {
            "p_session_id": session["id"],
            "p_language_info": {"languages": ["en"]},
            "p_segments": [
                {
                    "speaker": "patient",
                    "raw_speaker_label": "Speaker 2",
                    "display_speaker": "Patient",
                    "start_ms": 1200,
                    "end_ms": 4200,
                    "text": "Synthetic cough discussed.",
                    "confidence": 0.85,
                    "uncertain": False,
                },
                {
                    "speaker": "clinician",
                    "raw_speaker_label": "Speaker 1",
                    "display_speaker": "Clinician",
                    "start_ms": 4300,
                    "end_ms": 7100,
                    "text": "[uncertain] renal panel follow-up.",
                    "confidence": 0.55,
                    "uncertain": True,
                },
            ],
        },
    )
    assert status == 200, completed
    assert completed["status"] == "transcript_ready"

    status, entry_id = staff_session.rpc(
        "ingest_voice_ai_scribed_note",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_session_id": session["id"],
            "p_entry_type": "ai_doctor_consult_summary",
            "p_content": "Synthetic ambient summary.",
            "p_source_label": "Synthetic ambient consult test",
        },
    )
    assert status == 200, entry_id
    status, span_id = staff_session.rpc(
        "create_voice_provenance_for_transcript_span",
        {
            "p_entry_id": entry_id,
            "p_session_id": session["id"],
            "p_source_content": "Patient: Synthetic cough discussed.\nClinician: [uncertain] renal panel follow-up.",
            "p_evidence_text": "Patient: Synthetic cough discussed.",
            "p_char_start": 0,
            "p_char_end": 35,
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
    assert resolution["char_end"] == 35

    status, segments = service.get("transcript_segments", {"select": "speaker,start_ms,end_ms,uncertain", "session_id": f"eq.{session['id']}", "order": "start_ms.asc"})
    assert status == 200, segments
    assert [segment["speaker"] for segment in segments] == ["patient", "clinician"]
    assert segments[1]["uncertain"] is True


def test_clinical_staff_can_create_voice_session_but_other_clinic_and_patient_cannot(
    staff_session, clinic_b_staff_session, patient_session
) -> None:
    status, session = staff_session.rpc(
        "create_voice_capture_session",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_label": "Synthetic staff ambient consult",
            "p_provider": "deterministic_mock",
            "p_model": "deterministic_transcription",
            "p_audio_metadata": {"mode": "pytest"},
        },
    )
    assert status == 200, session

    status, denied = clinic_b_staff_session.rpc(
        "create_voice_capture_session",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_label": "Cross clinic voice capture",
            "p_provider": "deterministic_mock",
            "p_model": "deterministic_transcription",
            "p_audio_metadata": {},
        },
    )
    assert status in (400, 403), denied

    status, patient_denied = patient_session.rpc(
        "create_voice_capture_session",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_source_label": "Patient voice capture not phase A",
            "p_provider": "deterministic_mock",
            "p_model": "deterministic_transcription",
            "p_audio_metadata": {},
        },
    )
    assert status in (400, 403), patient_denied


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
