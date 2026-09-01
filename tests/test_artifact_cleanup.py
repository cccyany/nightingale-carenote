from tests.supabase_rest import SupabaseSession


ENTRY_CONTENT_PATTERNS = [
    "Nurse: Penicillin allergy. %",
    "Patient: No known allergies. %",
    "Patient reports penicillin allergy.%",
    "Patient denies penicillin allergy in updated note.%",
    "Synthetic patient-facing source %",
    "Synthetic patient-facing V1 source %",
    "Runtime clinical intelligence %",
    "Runtime version-bound source %",
]

PATIENT_CONTENT_TITLE_PATTERNS = [
    "Synthetic patient approval %",
    "Synthetic rejected draft %",
    "Synthetic low trust draft %",
    "Synthetic dosage approval %",
    "Synthetic generated patient draft %",
    "Synthetic manual patient draft %",
    "Synthetic multi-source patient draft %",
    "Synthetic partial-date patient draft %",
    "Synthetic versioned patient draft %",
    "Synthetic approved summary %",
    "Synthetic unresolved draft%",
]

GLANCE_TITLE_PATTERNS = [
    "Synthetic baseline %",
    "Synthetic future %",
    "Synthetic exposure %",
    "Synthetic exposed %",
    "Synthetic rejection %",
    "Synthetic Clinic A learning item%",
    "Synthetic Clinic B comparison item%",
    "Synthetic safety %",
]


def _ids(rows: object) -> list[str]:
    if not isinstance(rows, list):
        return []
    return [row["id"] for row in rows if isinstance(row, dict) and row.get("id")]


def _delete_id_batch(service: SupabaseSession, table: str, ids: list[str]) -> None:
    if not ids:
        return
    status, payload = service.delete(table, {"id": f"in.({','.join(ids)})"})
    assert status in {200, 204}, payload


def cleanup_patient_content_artifacts(service: SupabaseSession) -> None:
    for pattern in PATIENT_CONTENT_TITLE_PATTERNS:
        status, payload = service.delete("patient_facing_content", {"title": f"like.{pattern}"})
        assert status in {200, 204}, payload


def cleanup_glance_artifacts(service: SupabaseSession) -> None:
    for pattern in GLANCE_TITLE_PATTERNS:
        status, rows = service.get("highlights", {"select": "id", "title": f"like.{pattern}"})
        assert status == 200, rows
        highlight_ids = _ids(rows)
        if highlight_ids:
            service.delete("glance_items", {"highlight_id": f"in.({','.join(highlight_ids)})"})
            service.delete("importance_feedback", {"highlight_id": f"in.({','.join(highlight_ids)})"})
            _delete_id_batch(service, "highlights", highlight_ids)


def cleanup_entry_artifacts(service: SupabaseSession) -> None:
    for pattern in ENTRY_CONTENT_PATTERNS:
        status, rows = service.get("care_entries", {"select": "id", "content": f"like.{pattern}"})
        assert status == 200, rows
        entry_ids = _ids(rows)
        if not entry_ids:
            continue

        status, facts = service.get("clinical_facts", {"select": "id", "source_entry_id": f"in.({','.join(entry_ids)})"})
        assert status == 200, facts
        fact_ids = _ids(facts)
        if fact_ids:
            service.delete("fact_conflicts", {"fact_a_id": f"in.({','.join(fact_ids)})"})
            service.delete("fact_conflicts", {"fact_b_id": f"in.({','.join(fact_ids)})"})
            _delete_id_batch(service, "clinical_facts", fact_ids)

        status, sources = service.get("provenance_sources", {"select": "id", "source_entry_id": f"in.({','.join(entry_ids)})"})
        assert status == 200, sources
        source_ids = _ids(sources)
        status, entry_spans = service.get("provenance_spans", {"select": "id,source_id", "entry_id": f"in.({','.join(entry_ids)})"})
        assert status == 200, entry_spans
        source_ids = sorted(set(source_ids + [row["source_id"] for row in entry_spans if isinstance(row, dict) and row.get("source_id")]))
        if source_ids:
            status, spans = service.get("provenance_spans", {"select": "id", "source_id": f"in.({','.join(source_ids)})"})
            assert status == 200, spans
            span_ids = _ids(spans)
            if span_ids:
                status, span_facts = service.get("clinical_facts", {"select": "id", "provenance_span_id": f"in.({','.join(span_ids)})"})
                assert status == 200, span_facts
                span_fact_ids = _ids(span_facts)
                if span_fact_ids:
                    service.delete("fact_conflicts", {"fact_a_id": f"in.({','.join(span_fact_ids)})"})
                    service.delete("fact_conflicts", {"fact_b_id": f"in.({','.join(span_fact_ids)})"})
                service.delete("patient_content_sources", {"provenance_span_id": f"in.({','.join(span_ids)})"})
                service.delete("glance_items", {"provenance_span_id": f"in.({','.join(span_ids)})"})
                service.delete("highlights", {"provenance_span_id": f"in.({','.join(span_ids)})"})
                service.delete("clinical_facts", {"provenance_span_id": f"in.({','.join(span_ids)})"})
            service.delete("provenance_spans", {"source_id": f"in.({','.join(source_ids)})"})
            _delete_id_batch(service, "provenance_sources", source_ids)

        _delete_id_batch(service, "care_entries", entry_ids)


def cleanup_visible_test_artifacts(service: SupabaseSession) -> None:
    cleanup_patient_content_artifacts(service)
    cleanup_glance_artifacts(service)
    cleanup_entry_artifacts(service)
