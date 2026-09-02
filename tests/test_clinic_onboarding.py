import uuid

import pytest

from tests.supabase_rest import service_session, sign_in


pytestmark = pytest.mark.supabase_integration

CLINIC_A_ID = "20000000-0000-0000-0000-000000000001"
JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
BO_PROFILE_ID = "10000000-0000-0000-0000-000000000005"
SAM_PROFILE_ID = "10000000-0000-0000-0000-000000000002"
DR_MINA_PROFILE_ID = "10000000-0000-0000-0000-000000000003"
AVERY_PROFILE_ID = "10000000-0000-0000-0000-000000000004"


@pytest.fixture(scope="module")
def service():
    return service_session()


@pytest.fixture(scope="module")
def platform_admin_session():
    return sign_in("admin.a@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


@pytest.fixture(scope="module")
def clinic_a_clinician_session():
    return sign_in("clinician.a@example.test")


def _cleanup_clinic(service, clinic_id: str) -> None:
    service.delete("audit_events", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("patients", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("clinic_memberships", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("clinics", {"id": f"eq.{clinic_id}"})


@pytest.fixture()
def clinic_c(platform_admin_session, service):
    marker = str(uuid.uuid4())[:8]
    status, clinic_id = platform_admin_session.rpc(
        "platform_create_clinic",
        {
            "p_name": f"Clinic C {marker}",
            "p_code": f"clinic-c-{marker}",
            "p_timezone": "Asia/Singapore",
            "p_initial_admin_profile_id": BO_PROFILE_ID,
        },
    )
    assert status == 200, clinic_id
    try:
        yield clinic_id
    finally:
        _cleanup_clinic(service, clinic_id)


def test_platform_admin_can_create_clinic_with_initial_admin(platform_admin_session, service, clinic_c) -> None:
    status, rows = service.get(
        "clinic_memberships",
        {"select": "clinic_id,profile_id,role", "clinic_id": f"eq.{clinic_c}", "profile_id": f"eq.{BO_PROFILE_ID}"},
    )
    assert status == 200, rows
    assert any(row["role"] == "admin" for row in rows)

    status, clinics = platform_admin_session.rpc("list_managed_clinics", {})
    assert status == 200, clinics
    assert any(row["id"] == clinic_c for row in clinics)


def test_ordinary_clinic_admin_cannot_create_arbitrary_new_clinic(clinic_b_staff_session, clinic_c) -> None:
    status, payload = clinic_b_staff_session.rpc(
        "platform_create_clinic",
        {
            "p_name": f"Clinic D {uuid.uuid4()}",
            "p_code": f"clinic-d-{uuid.uuid4()}",
            "p_timezone": "Asia/Singapore",
            "p_initial_admin_profile_id": None,
        },
    )
    assert status == 403, payload


def test_clinic_admin_can_add_members_and_patient_inside_own_clinic(clinic_b_staff_session, service, clinic_c) -> None:
    status, clinician_membership = clinic_b_staff_session.rpc(
        "provision_clinic_member",
        {"p_clinic_id": clinic_c, "p_profile_id": AVERY_PROFILE_ID, "p_role": "clinician"},
    )
    assert status == 200, clinician_membership

    status, staff_membership = clinic_b_staff_session.rpc(
        "provision_clinic_member",
        {"p_clinic_id": clinic_c, "p_profile_id": SAM_PROFILE_ID, "p_role": "staff"},
    )
    assert status == 200, staff_membership

    status, patient_id = clinic_b_staff_session.rpc(
        "create_managed_patient",
        {
            "p_clinic_id": clinic_c,
            "p_display_name": f"Synthetic Clinic C Patient {uuid.uuid4()}",
            "p_date_of_birth": "1990-01-15",
            "p_profile_id": None,
            "p_synthetic": True,
        },
    )
    assert status == 200, patient_id

    status, memberships = service.get(
        "clinic_memberships",
        {"select": "profile_id,role", "clinic_id": f"eq.{clinic_c}"},
    )
    assert status == 200, memberships
    assert {"profile_id": AVERY_PROFILE_ID, "role": "clinician"} in memberships
    assert {"profile_id": SAM_PROFILE_ID, "role": "staff"} in memberships

    status, patient = clinic_b_staff_session.get("patients", {"select": "id,clinic_id", "id": f"eq.{patient_id}"})
    assert status == 200, patient
    assert patient == [{"id": patient_id, "clinic_id": clinic_c}]


def test_clinic_admin_cannot_manage_another_clinic_or_use_foreign_clinic_id(
    clinic_b_staff_session, clinic_c
) -> None:
    status, member_payload = clinic_b_staff_session.rpc(
        "provision_clinic_member",
        {"p_clinic_id": CLINIC_A_ID, "p_profile_id": BO_PROFILE_ID, "p_role": "admin"},
    )
    assert status == 403, member_payload

    status, patient_payload = clinic_b_staff_session.rpc(
        "create_managed_patient",
        {
            "p_clinic_id": CLINIC_A_ID,
            "p_display_name": "Synthetic foreign clinic patient",
            "p_date_of_birth": "1991-02-03",
            "p_profile_id": None,
            "p_synthetic": True,
        },
    )
    assert status == 403, patient_payload


def test_new_clinic_patient_is_isolated_from_other_clinics(
    clinic_b_staff_session, clinic_a_clinician_session, clinic_c
) -> None:
    status, patient_id = clinic_b_staff_session.rpc(
        "create_managed_patient",
        {
            "p_clinic_id": clinic_c,
            "p_display_name": f"Synthetic isolated Clinic C Patient {uuid.uuid4()}",
            "p_date_of_birth": "1988-07-04",
            "p_profile_id": None,
            "p_synthetic": True,
        },
    )
    assert status == 200, patient_id

    status, jane = clinic_b_staff_session.get("patients", {"select": "id", "id": f"eq.{JANE_PATIENT_ID}"})
    assert status == 200, jane
    assert jane == []

    status, clinic_c_patient = clinic_a_clinician_session.get("patients", {"select": "id", "id": f"eq.{patient_id}"})
    assert status == 200, clinic_c_patient
    assert clinic_c_patient == []

    status, visible_to_c_admin = clinic_b_staff_session.get("patients", {"select": "id", "id": f"eq.{patient_id}"})
    assert status == 200, visible_to_c_admin
    assert visible_to_c_admin == [{"id": patient_id}]


def test_management_uses_membership_model_not_ui_state(service, clinic_c) -> None:
    status, rows = service.get(
        "clinic_memberships",
        {"select": "clinic_id,profile_id,role", "clinic_id": f"eq.{clinic_c}", "profile_id": f"eq.{BO_PROFILE_ID}"},
    )
    assert status == 200, rows
    assert {"clinic_id": clinic_c, "profile_id": BO_PROFILE_ID, "role": "admin"} in rows
