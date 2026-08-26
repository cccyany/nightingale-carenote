import pytest

from tests.rbac_harness import CareNoteBoundary, Forbidden


@pytest.fixture()
def api_boundary() -> CareNoteBoundary:
    return CareNoteBoundary()


def test_patient_can_retrieve_only_approved_patient_facing_content(api_boundary: CareNoteBoundary) -> None:
    entries = api_boundary.list_patient_entries("demo-patient", "patient-jane-tan")

    assert [entry.id for entry in entries] == ["entry-approved"]


def test_patient_cannot_retrieve_internal_comments(api_boundary: CareNoteBoundary) -> None:
    comments = api_boundary.list_comments("demo-patient", "patient-jane-tan")

    assert comments == []


def test_patient_cannot_retrieve_raw_ai_scribed_note_by_direct_api(api_boundary: CareNoteBoundary) -> None:
    with pytest.raises(Forbidden):
        api_boundary.get_entry("demo-patient", "entry-ai-nurse")


def test_patient_cannot_retrieve_staff_or_clinician_internal_notes(api_boundary: CareNoteBoundary) -> None:
    with pytest.raises(Forbidden):
        api_boundary.get_entry("demo-patient", "entry-staff")

    with pytest.raises(Forbidden):
        api_boundary.get_entry("demo-patient", "entry-clinician")


def test_staff_can_create_permitted_staff_note(api_boundary: CareNoteBoundary) -> None:
    entry = api_boundary.create_entry("demo-staff", "patient-jane-tan", "staff", "Synthetic staff update.")

    assert entry.author_role == "staff"
    assert entry.clinic_id == "clinic-a"


def test_staff_cannot_edit_clinician_note(api_boundary: CareNoteBoundary) -> None:
    with pytest.raises(Forbidden):
        api_boundary.edit_entry("demo-staff", "entry-clinician", 1, "Unsafe overwrite attempt.")


def test_clinician_can_read_staff_and_ai_notes(api_boundary: CareNoteBoundary) -> None:
    entries = api_boundary.list_patient_entries("demo-clinician", "patient-jane-tan")
    entry_ids = {entry.id for entry in entries}

    assert "entry-staff" in entry_ids
    assert "entry-ai-nurse" in entry_ids


def test_clinician_cannot_edit_staff_note(api_boundary: CareNoteBoundary) -> None:
    with pytest.raises(Forbidden):
        api_boundary.edit_entry("demo-clinician", "entry-staff", 1, "Unsafe overwrite attempt.")


@pytest.mark.parametrize("token", ["demo-staff", "demo-clinician", "demo-admin"])
def test_clinic_a_users_cannot_access_clinic_b_patient(api_boundary: CareNoteBoundary, token: str) -> None:
    with pytest.raises(Forbidden):
        api_boundary.list_patient_entries(token, "patient-clinic-b")


def test_clinic_b_user_cannot_access_clinic_a_patient(api_boundary: CareNoteBoundary) -> None:
    with pytest.raises(Forbidden):
        api_boundary.list_patient_entries("demo-clinic-b-staff", "patient-jane-tan")
