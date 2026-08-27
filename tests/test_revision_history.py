import uuid

import pytest

from tests.supabase_rest import sign_in, service_session


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def service():
    return service_session()


def _create_clinician_entry(clinician_session, text: str) -> str:
    status, entry = clinician_session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "clinician_note",
            "p_visibility": "clinician_internal",
            "p_content": text,
        },
    )
    assert status == 200, entry
    return entry["id"]


def _versions(service, entry_id: str) -> list[dict[str, object]]:
    status, rows = service.get(
        "entry_versions",
        {"select": "version_number,content,changed_by,change_reason,reverted_from_version", "entry_id": f"eq.{entry_id}", "order": "version_number.asc"},
    )
    assert status == 200, rows
    return rows


def test_edit_increments_version_and_preserves_old_versions(clinician_session, service) -> None:
    entry_id = _create_clinician_entry(clinician_session, f"Synthetic initial plan {uuid.uuid4()}.")

    status, result = clinician_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": entry_id,
            "p_expected_version": 1,
            "p_content": "Synthetic updated clinician plan.",
            "p_change_reason": "test edit",
        },
    )

    assert status == 200, result
    assert result["status"] == "ok"
    assert result["version"] == 2
    versions = _versions(service, entry_id)
    assert [version["version_number"] for version in versions] == [1, 2]
    assert versions[0]["content"].startswith("Synthetic initial plan")
    assert versions[1]["content"] == "Synthetic updated clinician plan."


def test_revert_creates_new_version_without_deleting_intermediate_versions(clinician_session, service) -> None:
    entry_id = _create_clinician_entry(clinician_session, "Synthetic revision base.")
    clinician_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": entry_id,
            "p_expected_version": 1,
            "p_content": "Synthetic revision middle.",
            "p_change_reason": "test middle",
        },
    )

    status, result = clinician_session.rpc(
        "revert_care_entry",
        {"p_entry_id": entry_id, "p_expected_version": 2, "p_revert_to_version": 1},
    )

    assert status == 200, result
    assert result["status"] == "ok"
    assert result["version"] == 3
    versions = _versions(service, entry_id)
    assert [version["version_number"] for version in versions] == [1, 2, 3]
    assert versions[2]["content"] == "Synthetic revision base."
    assert versions[2]["reverted_from_version"] == 1


def test_audit_metadata_tracks_actor_versions_without_clinical_content(clinician_session, service) -> None:
    entry_id = _create_clinician_entry(clinician_session, "Synthetic audit base.")
    clinician_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": entry_id,
            "p_expected_version": 1,
            "p_content": "Synthetic audit updated content.",
            "p_change_reason": "audit verification",
        },
    )

    status, rows = service.get(
        "audit_events",
        {"select": "actor_id,action_type,resource_id,previous_version,new_version,metadata", "resource_id": f"eq.{entry_id}", "order": "created_at.asc"},
    )

    assert status == 200, rows
    edit_events = [row for row in rows if row["action_type"] == "care_entry.edited"]
    assert edit_events
    assert edit_events[-1]["previous_version"] == 1
    assert edit_events[-1]["new_version"] == 2
    serialized_metadata = str(edit_events[-1]["metadata"]).lower()
    assert "synthetic audit updated content" not in serialized_metadata
    assert "synthetic audit base" not in serialized_metadata
