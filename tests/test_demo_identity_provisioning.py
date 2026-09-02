import uuid

import pytest

from tests.supabase_rest import admin_create_auth_user, admin_delete_auth_user, service_session, sign_in


pytestmark = pytest.mark.supabase_integration

CLINIC_A_ID = "20000000-0000-0000-0000-000000000001"
CLINIC_B_ID = "20000000-0000-0000-0000-000000000002"
JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
ALEX_PATIENT_ID = "30000000-0000-0000-0000-000000000002"


@pytest.fixture()
def service():
    return service_session()


@pytest.fixture()
def platform_admin_session():
    return sign_in("admin.a@example.test")


def test_platform_admin_can_create_demo_person_for_selected_clinic(platform_admin_session, service) -> None:
    profile_id = str(uuid.uuid4())
    email = f"demo-person-{profile_id[:8]}@example.test"
    admin_create_auth_user(profile_id, email)
    try:
        status, payload = platform_admin_session.rpc(
            "create_demo_person_record",
            {
                "p_profile_id": profile_id,
                "p_email": email,
                "p_display_name": "Synthetic Demo Clinician",
                "p_clinic_id": CLINIC_B_ID,
                "p_role": "clinician",
            },
        )
        assert status == 200, payload
        token = payload["token"]
        assert token.startswith("demo-person-")

        status, identity = platform_admin_session.rpc("resolve_demo_identity", {"p_token": token})
        assert status == 200, identity
        assert identity["status"] == "ok"
        assert identity["email"] == email
        assert identity["clinic_id"] == CLINIC_B_ID
        assert identity["role"] == "clinician"

        status, memberships = service.get(
            "clinic_memberships",
            {"select": "clinic_id,profile_id,role", "clinic_id": f"eq.{CLINIC_B_ID}", "profile_id": f"eq.{profile_id}"},
        )
        assert status == 200, memberships
        assert memberships == [{"clinic_id": CLINIC_B_ID, "profile_id": profile_id, "role": "clinician"}]

        demo_person_session = sign_in(email)
        status, jane = demo_person_session.get("patients", {"select": "id", "id": f"eq.{JANE_PATIENT_ID}"})
        assert status == 200, jane
        assert jane == []

        status, alex = demo_person_session.get("patients", {"select": "id", "id": f"eq.{ALEX_PATIENT_ID}"})
        assert status == 200, alex
        assert alex == [{"id": ALEX_PATIENT_ID}]
    finally:
        service.delete("audit_events", {"actor_id": f"eq.{profile_id}"})
        service.delete("demo_identities", {"profile_id": f"eq.{profile_id}"})
        service.delete("clinic_memberships", {"profile_id": f"eq.{profile_id}"})
        service.delete("profiles", {"id": f"eq.{profile_id}"})
        admin_delete_auth_user(profile_id)


def test_demo_person_creation_rejects_patient_and_non_platform_callers(platform_admin_session) -> None:
    status, payload = platform_admin_session.rpc(
        "create_demo_person_record",
        {
            "p_profile_id": str(uuid.uuid4()),
            "p_email": "not-created@example.test",
            "p_display_name": "Not Created",
            "p_clinic_id": CLINIC_A_ID,
            "p_role": "patient",
        },
    )
    assert status == 400, payload

    staff_session = sign_in("staff.a@example.test")
    status, payload = staff_session.rpc(
        "create_demo_person_record",
        {
            "p_profile_id": str(uuid.uuid4()),
            "p_email": "not-authorized@example.test",
            "p_display_name": "Not Authorized",
            "p_clinic_id": CLINIC_A_ID,
            "p_role": "staff",
        },
    )
    assert status == 403, payload
