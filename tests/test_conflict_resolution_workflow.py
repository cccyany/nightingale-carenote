import uuid

import pytest

from tests.supabase_rest import service_session, sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINIC_B_PATIENT_ID = "30000000-0000-0000-0000-000000000002"


@pytest.fixture(scope="module")
def service():
    return service_session()


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def admin_session():
    return sign_in("clinic.admin.a@example.test")


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


@pytest.fixture(scope="module")
def patient_session():
    return sign_in("patient.jane@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


def _ids(rows: object) -> list[str]:
    if not isinstance(rows, list):
        return []
    return [row["id"] for row in rows if isinstance(row, dict) and row.get("id")]


def _delete_batch(service, table: str, ids: list[str]) -> None:
    if ids:
        status, payload = service.delete(table, {"id": f"in.({','.join(ids)})"})
        assert status in {200, 204}, payload


def _cleanup_marker(service, marker: str) -> None:
    status, entries = service.get("care_entries", {"select": "id", "content": f"ilike.%{marker}%"})
    assert status == 200, entries
    entry_ids = _ids(entries)
    if not entry_ids:
        return

    status, facts = service.get("clinical_facts", {"select": "id", "source_entry_id": f"in.({','.join(entry_ids)})"})
    assert status == 200, facts
    fact_ids = _ids(facts)
    if fact_ids:
        service.delete("conflict_resolution_sources", {"fact_id": f"in.({','.join(fact_ids)})"})
        service.delete("fact_conflicts", {"fact_a_id": f"in.({','.join(fact_ids)})"})
        service.delete("fact_conflicts", {"fact_b_id": f"in.({','.join(fact_ids)})"})
        _delete_batch(service, "clinical_facts", fact_ids)

    status, spans = service.get("provenance_spans", {"select": "id,source_id", "entry_id": f"in.({','.join(entry_ids)})"})
    assert status == 200, spans
    span_ids = _ids(spans)
    source_ids = sorted({row["source_id"] for row in spans if isinstance(row, dict) and row.get("source_id")})
    if span_ids:
        service.delete("conflict_resolution_sources", {"provenance_span_id": f"in.({','.join(span_ids)})"})
        service.delete("conflict_resolution_sources", {"resolution_entry_id": f"in.({','.join(entry_ids)})"})
        service.delete("glance_items", {"provenance_span_id": f"in.({','.join(span_ids)})"})
        service.delete("highlights", {"provenance_span_id": f"in.({','.join(span_ids)})"})
        service.delete("clinical_facts", {"provenance_span_id": f"in.({','.join(span_ids)})"})
        service.delete("provenance_spans", {"id": f"in.({','.join(span_ids)})"})
    _delete_batch(service, "provenance_sources", source_ids)
    _delete_batch(service, "care_entries", entry_ids)


@pytest.fixture()
def marker(service):
    marker = f"runtime-conflict-resolution-{uuid.uuid4()}"
    yield marker
    _cleanup_marker(service, marker)


def _create_fact(session, marker: str, text: str, evidence: str, value: str) -> tuple[str, str, str]:
    status, entry = session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "clinician_note",
            "p_visibility": "clinician_internal",
            "p_content": f"{marker}: {text}",
        },
    )
    assert status == 200, entry
    content = f"{marker}: {text}"
    start = content.index(evidence)
    status, span_id = session.rpc(
        "create_provenance_for_entry_span",
        {
            "p_entry_id": entry["id"],
            "p_evidence_text": evidence,
            "p_char_start": start,
            "p_char_end": start + len(evidence),
            "p_source_label": "Runtime conflict resolution test",
        },
    )
    assert status == 200, span_id
    status, fact_id = session.rpc(
        "upsert_fact_from_span",
        {
            "p_entry_id": entry["id"],
            "p_entity_type": "dosage",
            "p_normalized_entity": "metformin",
            "p_value": value,
            "p_unit": "mg",
            "p_assertion": "present",
            "p_provenance_span_id": span_id,
            "p_confidence": 0.9,
            "p_review_status": "confirmed",
            "p_extraction_method": "conflict_resolution_test",
        },
    )
    assert status == 200, fact_id
    return entry["id"], span_id, fact_id


def _create_dose_conflict(session, service, marker: str) -> dict[str, str]:
    a_entry, a_span, fact_a = _create_fact(
        session,
        marker,
        "Earlier medication list says metformin 500 mg twice daily.",
        "metformin 500 mg",
        "500",
    )
    b_entry, b_span, fact_b = _create_fact(
        session,
        marker,
        "Later medication list says metformin 1000 mg twice daily.",
        "metformin 1000 mg",
        "1000",
    )
    status, count = session.rpc("detect_fact_conflicts_for_patient", {"p_patient_id": JANE_PATIENT_ID})
    assert status == 200, count
    status, conflicts = service.get(
        "fact_conflicts",
        {"select": "id,status,conflict_type,fact_a_id,fact_b_id", "patient_id": f"eq.{JANE_PATIENT_ID}"},
    )
    assert status == 200, conflicts
    conflict = next(row for row in conflicts if {row["fact_a_id"], row["fact_b_id"]} == {fact_a, fact_b})
    return {
        "id": conflict["id"],
        "fact_a": fact_a,
        "fact_b": fact_b,
        "entry_a": a_entry,
        "entry_b": b_entry,
        "span_a": a_span,
        "span_b": b_span,
    }


def _resolve(session, conflict_id: str, outcome: str, marker: str, **extra):
    payload = {
        "p_conflict_id": conflict_id,
        "p_outcome": outcome,
        "p_rationale": f"{marker} reconciled with patient.",
        "p_expected_status": "unresolved",
        "p_corrected_entity_type": extra.get("entity_type"),
        "p_corrected_normalized_entity": extra.get("normalized_entity"),
        "p_corrected_value": extra.get("value"),
        "p_corrected_unit": extra.get("unit"),
        "p_corrected_assertion": extra.get("assertion", "present"),
    }
    return session.rpc("resolve_fact_conflict", payload)


@pytest.mark.parametrize(("outcome", "expected_status"), [
    ("accept_fact_a", "accepted_fact_a"),
    ("accept_fact_b", "accepted_fact_b"),
])
def test_clinician_resolves_to_earlier_or_later_evidence_and_preserves_history(
    clinician_session, service, marker, outcome, expected_status
) -> None:
    conflict = _create_dose_conflict(clinician_session, service, marker)
    original_a = service.get("care_entries", {"select": "content", "id": f"eq.{conflict['entry_a']}"})[1][0]["content"]
    original_b = service.get("care_entries", {"select": "content", "id": f"eq.{conflict['entry_b']}"})[1][0]["content"]

    status, result = _resolve(clinician_session, conflict["id"], outcome, marker)
    assert status == 200, result
    assert result["status"] == "ok"
    assert result["conflict_status"] == expected_status
    assert result["resolution_entry_id"]

    status, rows = service.get(
        "fact_conflicts",
        {"select": "status,resolver_id,resolved_at,resolution_reason,resolution_outcome,resolution_entry_id", "id": f"eq.{conflict['id']}"},
    )
    assert status == 200, rows
    assert rows[0]["status"] == expected_status
    assert rows[0]["resolved_at"]
    assert marker in rows[0]["resolution_reason"]
    assert rows[0]["resolution_entry_id"] == result["resolution_entry_id"]

    status, decision_entries = service.get("care_entries", {"select": "author_role,entry_type,content", "id": f"eq.{result['resolution_entry_id']}"})
    assert status == 200, decision_entries
    assert decision_entries[0]["author_role"] == "clinician"
    assert decision_entries[0]["entry_type"] == "clinician_note"
    assert marker in decision_entries[0]["content"]
    assert "historical evidence was preserved" in decision_entries[0]["content"]

    status, sources = service.get(
        "conflict_resolution_sources",
        {"select": "fact_id,provenance_span_id,source_version_id", "conflict_id": f"eq.{conflict['id']}"},
    )
    assert status == 200, sources
    assert {row["fact_id"] for row in sources} == {conflict["fact_a"], conflict["fact_b"]}
    for row in sources:
        assert row["provenance_span_id"]
        assert row["source_version_id"]
        status, resolution = service.rpc("validate_provenance_span", {"p_span_id": row["provenance_span_id"]})
        assert status == 200, resolution
        assert resolution["ok"] is True

    assert service.get("care_entries", {"select": "content", "id": f"eq.{conflict['entry_a']}"})[1][0]["content"] == original_a
    assert service.get("care_entries", {"select": "content", "id": f"eq.{conflict['entry_b']}"})[1][0]["content"] == original_b

    status, active_glance = service.get(
        "glance_items",
        {
            "select": "id,status",
            "patient_id": f"eq.{JANE_PATIENT_ID}",
            "provenance_span_id": f"in.({conflict['span_a']},{conflict['span_b']})",
        },
    )
    assert status == 200, active_glance
    assert active_glance
    assert all(row["status"] == "resolved" for row in active_glance)


def test_corrected_resolution_creates_new_confirmed_fact_and_supersedes_old_values(
    clinician_session, service, marker
) -> None:
    conflict = _create_dose_conflict(clinician_session, service, marker)
    status, result = _resolve(
        clinician_session,
        conflict["id"],
        "corrected_value",
        marker,
        entity_type="dosage",
        normalized_entity="metformin",
        value="750",
        unit="mg",
    )
    assert status == 200, result
    assert result["conflict_status"] == "corrected"
    assert result["corrected_fact_id"]

    status, facts = service.get(
        "clinical_facts",
        {"select": "id,authority_role,review_status,normalized_entity,value,unit,superseded_by", "id": f"in.({conflict['fact_a']},{conflict['fact_b']},{result['corrected_fact_id']})"},
    )
    assert status == 200, facts
    corrected = next(row for row in facts if row["id"] == result["corrected_fact_id"])
    assert corrected["authority_role"] == "clinician"
    assert corrected["review_status"] == "confirmed"
    assert corrected["normalized_entity"] == "metformin"
    assert corrected["value"] == "750"
    assert all(row["superseded_by"] == result["corrected_fact_id"] for row in facts if row["id"] != result["corrected_fact_id"])


def test_unable_to_determine_keeps_conflict_under_review_and_active(
    clinician_session, service, marker
) -> None:
    conflict = _create_dose_conflict(clinician_session, service, marker)
    status, result = _resolve(clinician_session, conflict["id"], "unable_to_determine", marker)
    assert status == 200, result
    assert result["conflict_status"] == "needs_further_review"

    status, rows = service.get("fact_conflicts", {"select": "status,resolved_at", "id": f"eq.{conflict['id']}"})
    assert status == 200, rows
    assert rows[0]["status"] == "needs_further_review"
    assert rows[0]["resolved_at"] is None

    status, active_glance = service.get(
        "glance_items",
        {"select": "status,available_action", "provenance_span_id": f"in.({conflict['span_a']},{conflict['span_b']})"},
    )
    assert status == 200, active_glance
    assert active_glance
    assert any(row["status"] == "needs_review" and row["available_action"] == "Resolve conflict" for row in active_glance)


def test_staff_patient_and_clinic_b_cannot_resolve_conflict(
    clinician_session, staff_session, patient_session, clinic_b_staff_session, service, marker
) -> None:
    conflict = _create_dose_conflict(clinician_session, service, marker)
    for session in [staff_session, patient_session, clinic_b_staff_session]:
        status, payload = _resolve(session, conflict["id"], "accept_fact_a", marker)
        assert status == 403, payload


def test_admin_can_resolve_conflict(service, admin_session, marker) -> None:
    conflict = _create_dose_conflict(admin_session, service, marker)
    status, result = _resolve(admin_session, conflict["id"], "accept_fact_b", marker)
    assert status == 200, result
    assert result["conflict_status"] == "accepted_fact_b"


def test_duplicate_resolution_is_rejected_as_stale(clinician_session, service, marker) -> None:
    conflict = _create_dose_conflict(clinician_session, service, marker)
    status, first = _resolve(clinician_session, conflict["id"], "accept_fact_a", marker)
    assert status == 200, first
    status, second = _resolve(clinician_session, conflict["id"], "accept_fact_b", marker)
    assert status == 200, second
    assert second["status"] == "conflict"
    assert second["current_status"] == "accepted_fact_a"


def test_confirmed_non_conflict_glance_item_remains_active(service) -> None:
    status, rows = service.get(
        "glance_items",
        {
            "select": "id,status,rule_key",
            "rule_key": "eq.SYMPTOM_PERSISTENT",
            "status": "eq.confirmed",
            "patient_id": f"eq.{JANE_PATIENT_ID}",
            "limit": "1",
        },
    )
    assert status == 200, rows
    if rows:
        assert rows[0]["status"] == "confirmed"


def test_clinic_b_patient_does_not_gain_conflict_resolution_access(clinic_b_staff_session) -> None:
    status, payload = clinic_b_staff_session.rpc(
        "resolve_fact_conflict",
        {
            "p_conflict_id": str(uuid.uuid4()),
            "p_outcome": "accept_fact_a",
            "p_rationale": "synthetic",
            "p_expected_status": "unresolved",
        },
    )
    assert status in {200, 403, 404}
    if status == 200:
        assert payload["status"] == "not_found"
