import json
from pathlib import Path


def test_evaluation_fixtures_cover_required_synthetic_cases() -> None:
    redaction = json.loads(Path("eval/redaction_cases.json").read_text())
    extraction = json.loads(Path("eval/extraction_cases.json").read_text())
    conflicts = json.loads(Path("eval/conflict_cases.json").read_text())

    assert {"name", "phone", "id"}.issubset({klass for case in redaction for klass in case["expected_classes"]})
    assert any(case["expected_classes"] == [] for case in redaction)
    assert any(case["should_allow"] is False for case in redaction)

    extracted_types = {expected["type"] for case in extraction for expected in case["expected"]}
    assert {"allergy", "medication", "dosage", "symptom", "follow_up_action"}.issubset(extracted_types)
    assert any(expected["abstain"] for case in extraction for expected in case["expected"])

    expected_conflicts = {case["expected_conflict"] for case in conflicts}
    assert {
        "ALLERGY_CONFLICT",
        "MEDICATION_CONFLICT",
        "MEDICATION_DOSE_CONFLICT",
        "MEDICATION_FREQUENCY_CONFLICT",
        None,
    }.issubset(expected_conflicts)
    assert any({fact["source"] for fact in case["facts"]} == {"staff", "clinician"} for case in conflicts)
    assert any("ai_doctor" in {fact["source"] for fact in case["facts"]} for case in conflicts)
