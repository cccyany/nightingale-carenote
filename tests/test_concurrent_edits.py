import uuid

import pytest

from tests.supabase_rest import sign_in, service_session


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def service():
    return service_session()


def _create_entry(session, entry_type: str, visibility: str, text: str) -> str:
    status, entry = session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": entry_type,
            "p_visibility": visibility,
            "p_content": text,
        },
    )
    assert status == 200, entry
    return entry["id"]


def _entry_content(service, entry_id: str) -> str:
    status, rows = service.get("care_entries", {"select": "content", "id": f"eq.{entry_id}"})
    assert status == 200, rows
    return rows[0]["content"]


def test_independent_staff_and_clinician_entries_do_not_overwrite_each_other(staff_session, clinician_session, service) -> None:
    staff_entry = _create_entry(staff_session, "staff_note", "staff_internal", f"Synthetic staff base {uuid.uuid4()}.")
    clinician_entry = _create_entry(clinician_session, "clinician_note", "clinician_internal", f"Synthetic clinician base {uuid.uuid4()}.")

    staff_status, staff_result = staff_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": staff_entry,
            "p_expected_version": 1,
            "p_content": "Synthetic staff independent update.",
            "p_change_reason": "concurrent staff edit",
        },
    )
    clinician_status, clinician_result = clinician_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": clinician_entry,
            "p_expected_version": 1,
            "p_content": "Synthetic clinician independent update.",
            "p_change_reason": "concurrent clinician edit",
        },
    )

    assert staff_status == 200, staff_result
    assert clinician_status == 200, clinician_result
    assert _entry_content(service, staff_entry) == "Synthetic staff independent update."
    assert _entry_content(service, clinician_entry) == "Synthetic clinician independent update."


def test_stale_same_entry_write_returns_deterministic_conflict_and_preserves_current_content(staff_session, service) -> None:
    entry_id = _create_entry(staff_session, "staff_note", "staff_internal", f"Synthetic concurrent base {uuid.uuid4()}.")

    first_status, first_result = staff_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": entry_id,
            "p_expected_version": 1,
            "p_content": "Synthetic first writer wins.",
            "p_change_reason": "first concurrent edit",
        },
    )
    stale_status, stale_result = staff_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": entry_id,
            "p_expected_version": 1,
            "p_content": "Synthetic stale overwrite attempt.",
            "p_change_reason": "stale concurrent edit",
        },
    )

    assert first_status == 200, first_result
    assert first_result["status"] == "ok"
    assert stale_status == 200, stale_result
    assert stale_result["status"] == "conflict"
    assert stale_result["current_version"] == 2
    assert _entry_content(service, entry_id) == "Synthetic first writer wins."


def test_cross_role_same_entry_edit_is_forbidden_before_any_overwrite(clinician_session, staff_session, service) -> None:
    entry_id = _create_entry(staff_session, "staff_note", "staff_internal", f"Synthetic staff-owned note {uuid.uuid4()}.")
    before = _entry_content(service, entry_id)

    status, payload = clinician_session.rpc(
        "edit_care_entry",
        {
            "p_entry_id": entry_id,
            "p_expected_version": 1,
            "p_content": "Synthetic clinician cross-role overwrite attempt.",
            "p_change_reason": "forbidden cross-role edit",
        },
    )

    assert status == 403, payload
    assert _entry_content(service, entry_id) == before
