import uuid

import pytest

from tests.supabase_rest import service_session, sign_in
from tests.test_artifact_cleanup import cleanup_entry_artifacts


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINIC_A_ID = "20000000-0000-0000-0000-000000000001"
AI_NURSE_ENTRY_ID = "40000000-0000-0000-0000-000000000002"


@pytest.fixture(scope="module")
def service():
    return service_session()


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(autouse=True)
def cleanup_provenance_artifacts(service):
    cleanup_entry_artifacts(service)
    yield
    cleanup_entry_artifacts(service)


def test_trusted_highlights_have_resolvable_exact_provenance(service) -> None:
    status, highlights = service.get(
        "highlights",
        {"select": "id,title,provenance_span_id,state,evidence_confidence", "patient_id": f"eq.{JANE_PATIENT_ID}", "state": "in.(suggested,confirmed)"},
    )
    assert status == 200, highlights
    assert highlights

    for highlight in highlights:
      status, resolution = service.rpc("validate_provenance_span", {"p_span_id": highlight["provenance_span_id"]})
      assert status == 200, resolution
      assert resolution["ok"] is True
      assert resolution["entry_id"]
      assert resolution["version_id"]
      assert resolution["char_start"] >= 0
      assert resolution["char_end"] > resolution["char_start"]
      status, versions = service.get("entry_versions", {"select": "content", "id": f"eq.{resolution['version_id']}"})
      assert status == 200, versions
      content = versions[0]["content"]
      assert content[resolution["char_start"]:resolution["char_end"]] == resolution["evidence_text"]


def test_ai_scribed_highlight_provenance_resolves_to_ai_entry(service) -> None:
    status, rows = service.get(
        "glance_items",
        {"select": "title,provenance_span_id,provenance_spans(entry_id,evidence_text)", "title": "eq.Allergy conflict"},
    )
    assert status == 200, rows
    span = rows[0]["provenance_spans"]
    if isinstance(span, list):
        span = span[0]
    assert span["entry_id"] == AI_NURSE_ENTRY_ID

    status, resolution = service.rpc("validate_provenance_span", {"p_span_id": rows[0]["provenance_span_id"]})
    assert status == 200, resolution
    assert resolution["ok"] is True
    assert resolution["evidence_text"] == "no known drug allergies"


def test_invalid_provenance_stays_needs_review_and_not_trusted(clinician_session, service) -> None:
    status, entry = clinician_session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "clinician_note",
            "p_visibility": "clinician_internal",
            "p_content": f"Synthetic provenance base {uuid.uuid4()}.",
        },
    )
    assert status == 200, entry
    status, versions = service.get("entry_versions", {"select": "id", "entry_id": f"eq.{entry['id']}", "version_number": "eq.1"})
    assert status == 200, versions
    version_id = versions[0]["id"]

    source_id = str(uuid.uuid4())
    span_id = str(uuid.uuid4())
    highlight_id = str(uuid.uuid4())
    status, inserted_source = service.postgrest_insert("provenance_sources", {
        "id": source_id,
        "clinic_id": CLINIC_A_ID,
        "patient_id": JANE_PATIENT_ID,
        "source_entry_id": entry["id"],
        "source_version_id": version_id,
        "source_kind": "entry",
        "source_label": "Synthetic invalid provenance source",
    })
    assert status in {200, 201}, inserted_source
    status, inserted_span = service.postgrest_insert("provenance_spans", {
        "id": span_id,
        "source_id": source_id,
        "entry_id": entry["id"],
        "entry_version_id": version_id,
        "char_start": 0,
        "char_end": 9,
        "evidence_text": "Mismatch",
    })
    assert status in {200, 201}, inserted_span
    status, inserted_highlight = service.postgrest_insert("highlights", {
        "id": highlight_id,
        "clinic_id": CLINIC_A_ID,
        "patient_id": JANE_PATIENT_ID,
        "provenance_span_id": span_id,
        "title": "Invalid provenance candidate",
        "summary": "Synthetic unsupported candidate.",
        "risk": "medium",
        "risk_reason": "Unsupported provenance.",
        "review_status": "needs_review",
        "evidence_confidence": 0.50,
        "state": "needs_review",
        "confidence_explanation": "Evidence text does not match source span.",
    })
    assert status in {200, 201}, inserted_highlight

    status, resolution = service.rpc("validate_provenance_span", {"p_span_id": span_id})
    assert status == 200, resolution
    assert resolution["ok"] is False
    assert "does not match" in resolution["reason"]

    status, rows = service.get("glance_items", {"select": "id", "highlight_id": f"eq.{highlight_id}"})
    assert status == 200, rows
    assert rows == []


def test_deterministic_risk_floor_cannot_be_lowered(service) -> None:
    for rule_key in [
        "ALLERGY_CONFLICT",
        "MEDICATION_CONFLICT",
        "MEDICATION_DOSE_CONFLICT",
        "UNRESOLVED_CRITICAL_TASK",
    ]:
        status, risk = service.rpc("deterministic_risk_floor", {"p_rule_key": rule_key, "p_suggested": "low"})
        assert status == 200, risk
        assert risk == "high"

    status, risk = service.rpc("deterministic_risk_floor", {"p_rule_key": "UNRESOLVED_TASK", "p_suggested": "low"})
    assert status == 200, risk
    assert risk == "medium"


def test_unsupported_or_ambiguous_evidence_abstains_from_active_glance(service) -> None:
    status, rows = service.get(
        "highlights",
        {"select": "id,state,evidence_confidence,confidence_explanation", "state": "eq.needs_review", "evidence_confidence": "lt.0.75"},
    )
    assert status == 200, rows
    for row in rows:
        status, glance = service.get("glance_items", {"select": "id", "highlight_id": f"eq.{row['id']}"})
        assert status == 200, glance
        assert glance == []


def test_provenance_resolves_original_version_after_source_edit(clinician_session, service) -> None:
    original = "Patient reports penicillin allergy."
    status, entry = clinician_session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "clinician_note",
            "p_visibility": "clinician_internal",
            "p_content": original,
        },
    )
    assert status == 200, entry
    char_start = original.index("penicillin allergy")
    char_end = char_start + len("penicillin allergy")
    status, span_id = clinician_session.rpc(
        "create_provenance_for_entry_span",
        {
            "p_entry_id": entry["id"],
            "p_evidence_text": "penicillin allergy",
            "p_char_start": char_start,
            "p_char_end": char_end,
            "p_source_label": "Versioned provenance edit test",
        },
    )
    assert status == 200, span_id
    status, before = service.rpc("validate_provenance_span", {"p_span_id": span_id})
    assert status == 200, before
    assert before["ok"] is True

    status, edit = clinician_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": entry["id"],
            "p_expected_version": 1,
            "p_content": "Patient denies penicillin allergy in updated note.",
            "p_change_reason": "source changed after highlight",
        },
    )
    assert status == 200, edit
    assert edit["version"] == 2

    status, after = service.rpc("validate_provenance_span", {"p_span_id": span_id})
    assert status == 200, after
    assert after["ok"] is True
    assert after["version_id"] == before["version_id"]
    assert after["evidence_text"] == "penicillin allergy"
    status, versions = service.get("entry_versions", {"select": "version_number,content", "id": f"eq.{after['version_id']}"})
    assert status == 200, versions
    assert versions == [{"version_number": 1, "content": original}]
