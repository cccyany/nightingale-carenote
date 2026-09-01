import pytest

from tests.supabase_rest import SupabaseUnavailable, service_session, sign_in


JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINIC_B_PATIENT_ID = "30000000-0000-0000-0000-000000000002"
AI_NURSE_ENTRY_ID = "40000000-0000-0000-0000-000000000002"
CLINICIAN_ENTRY_ID = "40000000-0000-0000-0000-000000000001"
STAFF_ENTRY_ID = "40000000-0000-0000-0000-000000000005"
INTERNAL_COMMENT_ID = "50000000-0000-0000-0000-000000000001"


pytestmark = pytest.mark.supabase_integration


@pytest.fixture(scope="module")
def patient_session():
    try:
        return sign_in("patient.jane@example.test")
    except SupabaseUnavailable as exc:
        pytest.skip(str(exc))


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


@pytest.fixture(scope="module")
def clinician_session():
    return sign_in("clinician.a@example.test")


@pytest.fixture(scope="module")
def admin_session():
    return sign_in("admin.a@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


@pytest.fixture(scope="module")
def service():
    return service_session()


def assert_schema_seed_present(service) -> None:
    status, rows = service.get("care_entries", {"select": "id", "id": f"eq.{AI_NURSE_ENTRY_ID}"})
    if status == 404:
        pytest.skip(f"real Supabase schema/seed is not applied: payload={rows}")
    assert status == 200, f"real Supabase schema/seed is not queryable: status={status}, payload={rows}"
    assert rows == [{"id": AI_NURSE_ENTRY_ID}], "synthetic seed data is missing from real Supabase"


def test_patient_cannot_retrieve_raw_ai_scribed_notes(patient_session, service) -> None:
    assert_schema_seed_present(service)

    status, rows = patient_session.get("care_entries", {"select": "id,entry_type,content", "id": f"eq.{AI_NURSE_ENTRY_ID}"})

    assert status == 200
    assert rows == []


def test_patient_cannot_retrieve_internal_comments(patient_session, service) -> None:
    assert_schema_seed_present(service)

    status, rows = patient_session.get("comments", {"select": "id,body", "id": f"eq.{INTERNAL_COMMENT_ID}"})

    assert status == 200
    assert rows == []


def test_patient_cannot_retrieve_staff_or_clinician_internal_notes(patient_session, service) -> None:
    assert_schema_seed_present(service)

    for entry_id in [STAFF_ENTRY_ID, CLINICIAN_ENTRY_ID]:
        status, rows = patient_session.get("care_entries", {"select": "id,content", "id": f"eq.{entry_id}"})
        assert status == 200
        assert rows == []


def test_staff_cannot_modify_clinician_authored_notes(staff_session, service) -> None:
    assert_schema_seed_present(service)
    _, before_rows = service.get("care_entries", {"select": "content", "id": f"eq.{CLINICIAN_ENTRY_ID}"})

    status, payload = staff_session.patch(
        "care_entries",
        {"id": f"eq.{CLINICIAN_ENTRY_ID}"},
        {"content": "Unauthorized staff overwrite attempt."},
    )
    _, after_rows = service.get("care_entries", {"select": "content", "id": f"eq.{CLINICIAN_ENTRY_ID}"})

    assert status == 200
    assert payload == []
    assert after_rows == before_rows


def test_clinician_cannot_modify_staff_authored_notes(clinician_session, service) -> None:
    assert_schema_seed_present(service)
    _, before_rows = service.get("care_entries", {"select": "content", "id": f"eq.{STAFF_ENTRY_ID}"})

    status, payload = clinician_session.patch(
        "care_entries",
        {"id": f"eq.{STAFF_ENTRY_ID}"},
        {"content": "Unauthorized clinician overwrite attempt."},
    )
    _, after_rows = service.get("care_entries", {"select": "content", "id": f"eq.{STAFF_ENTRY_ID}"})

    assert status == 200
    assert payload == []
    assert after_rows == before_rows


@pytest.mark.parametrize("session_fixture", ["staff_session", "clinician_session", "admin_session"])
def test_clinic_a_users_cannot_access_clinic_b_patient_data(request, session_fixture: str, service) -> None:
    assert_schema_seed_present(service)
    session = request.getfixturevalue(session_fixture)

    status, rows = session.get("patients", {"select": "id,display_name", "id": f"eq.{CLINIC_B_PATIENT_ID}"})

    assert status == 200
    assert rows == []


def test_clinic_b_cannot_access_jane_related_data_even_without_app_filter(clinic_b_staff_session, service) -> None:
    assert_schema_seed_present(service)

    status, patients = clinic_b_staff_session.get("patients", {"select": "id,display_name", "id": f"eq.{JANE_PATIENT_ID}"})
    assert status == 200
    assert patients == []

    status, entries = clinic_b_staff_session.get("care_entries", {"select": "id,patient_id", "patient_id": f"eq.{JANE_PATIENT_ID}"})
    assert status == 200
    assert entries == []

    status, content = clinic_b_staff_session.get("patient_facing_content", {"select": "id,patient_id", "patient_id": f"eq.{JANE_PATIENT_ID}"})
    assert status == 200
    assert content == []

    status, glance = clinic_b_staff_session.rpc("read_patient_glance", {"p_patient_id": JANE_PATIENT_ID})
    assert status in {400, 403}, glance


def test_unauthorized_direct_database_access_fails_when_ui_is_bypassed(patient_session, staff_session, service) -> None:
    assert_schema_seed_present(service)

    patient_status, patient_rows = patient_session.get(
        "care_entries",
        {"select": "id", "patient_id": f"eq.{JANE_PATIENT_ID}", "visibility": "eq.ai_internal"},
    )
    staff_status, staff_payload = staff_session.patch(
        "care_entries",
        {"id": f"eq.{CLINICIAN_ENTRY_ID}"},
        {"content": "Direct PostgREST overwrite attempt."},
    )
    _, unchanged_rows = service.get("care_entries", {"select": "content", "id": f"eq.{CLINICIAN_ENTRY_ID}"})

    assert patient_status == 200
    assert patient_rows == []
    assert staff_status == 200
    assert staff_payload == []
    assert unchanged_rows == [{"content": "Penicillin allergy documented."}]
