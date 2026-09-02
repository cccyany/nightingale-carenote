import uuid

import pytest

from tests.supabase_rest import admin_create_auth_user, admin_delete_auth_user, service_session, sign_in


pytestmark = pytest.mark.supabase_integration

CLINIC_A_ID = "20000000-0000-0000-0000-000000000001"
CLINIC_B_ID = "20000000-0000-0000-0000-000000000002"
JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
SAM_PROFILE_ID = "10000000-0000-0000-0000-000000000002"
BO_PROFILE_ID = "10000000-0000-0000-0000-000000000005"
CLARA_EMAIL = "clinic.admin.a@example.test"
AVERY_EMAIL = "admin.a@example.test"
SAM_EMAIL = "staff.a@example.test"


@pytest.fixture()
def service():
    return service_session()


@pytest.fixture()
def platform_admin_session():
    return sign_in(AVERY_EMAIL)


@pytest.fixture()
def clinic_a_admin_session():
    return sign_in(CLARA_EMAIL)


def _create_auth_profile(service, display_name: str, role: str = "staff") -> tuple[str, str]:
    profile_id = str(uuid.uuid4())
    email = f"member-{profile_id[:8]}@example.test"
    admin_create_auth_user(profile_id, email)
    status, payload = service.postgrest_insert(
        "profiles",
        {"id": profile_id, "display_name": display_name, "primary_role": role},
    )
    assert status in (200, 201), payload
    return profile_id, email


def _cleanup_profile(service, profile_id: str) -> None:
    admin_delete_auth_user(profile_id)
    service.delete("audit_events", {"actor_id": f"eq.{profile_id}"})
    service.delete("audit_events", {"metadata->>target_profile_id": f"eq.{profile_id}"})
    service.delete("demo_identities", {"profile_id": f"eq.{profile_id}"})
    service.delete("clinic_memberships", {"profile_id": f"eq.{profile_id}"})
    service.delete("profiles", {"id": f"eq.{profile_id}"})


def _cleanup_clinic(service, clinic_id: str) -> None:
    service.delete("audit_events", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("care_entry_versions", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("care_entries", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("patients", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("demo_identities", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("clinic_memberships", {"clinic_id": f"eq.{clinic_id}"})
    service.delete("clinics", {"id": f"eq.{clinic_id}"})


@pytest.fixture()
def clinic_pair(platform_admin_session, service):
    marker = str(uuid.uuid4())[:8]
    status, source_id = platform_admin_session.rpc(
        "platform_create_clinic",
        {
            "p_name": f"Lifecycle Source {marker}",
            "p_code": f"life-source-{marker}",
            "p_timezone": "Asia/Singapore",
            "p_initial_admin_profile_id": BO_PROFILE_ID,
        },
    )
    assert status == 200, source_id
    status, target_id = platform_admin_session.rpc(
        "platform_create_clinic",
        {
            "p_name": f"Lifecycle Target {marker}",
            "p_code": f"life-target-{marker}",
            "p_timezone": "Asia/Singapore",
            "p_initial_admin_profile_id": None,
        },
    )
    assert status == 200, target_id
    try:
        yield source_id, target_id
    finally:
        _cleanup_clinic(service, source_id)
        _cleanup_clinic(service, target_id)


def _membership_id(service, clinic_id: str, profile_id: str, role: str) -> str:
    status, rows = service.get(
        "clinic_memberships",
        {
            "select": "id",
            "clinic_id": f"eq.{clinic_id}",
            "profile_id": f"eq.{profile_id}",
            "role": f"eq.{role}",
        },
    )
    assert status == 200, rows
    assert rows
    return rows[0]["id"]


def test_clinic_admin_edits_role_inside_own_clinic_and_cannot_edit_other_clinic(
    clinic_a_admin_session, service
) -> None:
    profile_id, _email = _create_auth_profile(service, "Synthetic Role Edit")
    try:
      status, inserted = service.postgrest_insert(
          "clinic_memberships",
          {"clinic_id": CLINIC_A_ID, "profile_id": profile_id, "role": "staff"},
      )
      assert status in (200, 201), inserted
      membership_id = inserted[0]["id"]

      status, payload = clinic_a_admin_session.rpc(
          "update_clinic_member_role",
          {"p_membership_id": membership_id, "p_new_role": "clinician"},
      )
      assert status == 200, payload
      assert payload["previous_role"] == "staff"
      assert payload["new_role"] == "clinician"

      status, rows = service.get(
          "clinic_memberships",
          {"select": "role", "id": f"eq.{payload['membership_id']}"},
      )
      assert status == 200, rows
      assert rows == [{"role": "clinician"}]

      clinic_b_membership = _membership_id(service, CLINIC_B_ID, BO_PROFILE_ID, "staff")
      status, forbidden = clinic_a_admin_session.rpc(
          "update_clinic_member_role",
          {"p_membership_id": clinic_b_membership, "p_new_role": "clinician"},
      )
      assert status == 403, forbidden
    finally:
      _cleanup_profile(service, profile_id)


def test_platform_admin_edits_role_and_staff_cannot_edit_or_assign_platform_admin(
    platform_admin_session, service
) -> None:
    profile_id, _email = _create_auth_profile(service, "Synthetic Platform Edit")
    try:
      status, inserted = service.postgrest_insert(
          "clinic_memberships",
          {"clinic_id": CLINIC_A_ID, "profile_id": profile_id, "role": "staff"},
      )
      assert status in (200, 201), inserted
      membership_id = inserted[0]["id"]

      status, payload = platform_admin_session.rpc(
          "update_clinic_member_role",
          {"p_membership_id": membership_id, "p_new_role": "admin"},
      )
      assert status == 200, payload
      assert payload["new_role"] == "admin"

      staff_session = sign_in(SAM_EMAIL)
      status, forbidden = staff_session.rpc(
          "update_clinic_member_role",
          {"p_membership_id": payload["membership_id"], "p_new_role": "staff"},
      )
      assert status == 403, forbidden

      status, invalid = platform_admin_session.rpc(
          "update_clinic_member_role",
          {"p_membership_id": payload["membership_id"], "p_new_role": "patient"},
      )
      assert status == 400, invalid
    finally:
      _cleanup_profile(service, profile_id)


def test_remove_member_preserves_profile_auth_and_history_but_removes_access(
    platform_admin_session, service, clinic_pair
) -> None:
    source_id, _target_id = clinic_pair
    status, membership = platform_admin_session.rpc(
        "provision_clinic_member",
        {"p_clinic_id": source_id, "p_profile_id": SAM_PROFILE_ID, "p_role": "staff"},
    )
    assert status == 200, membership
    status, patient_id = platform_admin_session.rpc(
        "create_managed_patient",
        {
            "p_clinic_id": source_id,
            "p_display_name": f"Lifecycle Patient {uuid.uuid4()}",
            "p_date_of_birth": "1980-01-01",
            "p_profile_id": None,
            "p_synthetic": True,
        },
    )
    assert status == 200, patient_id
    status, entry = service.postgrest_insert(
        "care_entries",
        {
            "clinic_id": source_id,
            "patient_id": patient_id,
            "author_role": "staff",
            "author_id": SAM_PROFILE_ID,
            "entry_type": "staff_note",
            "visibility": "clinic_internal",
            "content": "Synthetic historical attribution note.",
        },
    )
    assert status in (200, 201), entry

    member_session = sign_in(SAM_EMAIL)
    status, visible_before = member_session.get("patients", {"select": "id", "id": f"eq.{patient_id}"})
    assert status == 200, visible_before
    assert visible_before == [{"id": patient_id}]

    status, removed = platform_admin_session.rpc("remove_clinic_member", {"p_membership_id": membership})
    assert status == 200, removed

    status, profile = service.get("profiles", {"select": "id", "id": f"eq.{SAM_PROFILE_ID}"})
    assert status == 200, profile
    assert profile == [{"id": SAM_PROFILE_ID}]
    sign_in(SAM_EMAIL)

    status, visible_after = member_session.get("patients", {"select": "id", "id": f"eq.{patient_id}"})
    assert status == 200, visible_after
    assert visible_after == []

    status, entries = service.get("care_entries", {"select": "author_id,content", "id": f"eq.{entry[0]['id']}"})
    assert status == 200, entries
    assert entries == [{"author_id": SAM_PROFILE_ID, "content": "Synthetic historical attribution note."}]


def test_last_clinic_admin_cannot_be_removed_or_demoted(platform_admin_session, service, clinic_pair) -> None:
    source_id, _target_id = clinic_pair
    admin_membership = _membership_id(service, source_id, BO_PROFILE_ID, "admin")

    status, demote = platform_admin_session.rpc(
        "update_clinic_member_role",
        {"p_membership_id": admin_membership, "p_new_role": "staff"},
    )
    assert status == 409, demote

    status, remove = platform_admin_session.rpc("remove_clinic_member", {"p_membership_id": admin_membership})
    assert status == 409, remove

    status, rows = service.get(
        "clinic_memberships",
        {"select": "id", "id": f"eq.{admin_membership}"},
    )
    assert status == 200, rows
    assert rows == [{"id": admin_membership}]


def test_only_platform_admin_transfers_and_transfer_updates_access_and_demo_roles(
    platform_admin_session, service, clinic_pair
) -> None:
    source_id, target_id = clinic_pair
    profile_id, email = _create_auth_profile(service, "Synthetic Transfer Member")
    try:
      status, created = platform_admin_session.rpc(
          "create_demo_person_record",
          {
              "p_profile_id": profile_id,
              "p_email": email,
              "p_display_name": "Synthetic Transfer Member",
              "p_clinic_id": source_id,
              "p_role": "staff",
          },
      )
      assert status == 200, created
      token = created["token"]

      membership_id = _membership_id(service, source_id, profile_id, "staff")
      source_admin_session = sign_in("staff.b@example.test")
      status, forbidden = source_admin_session.rpc(
          "transfer_clinic_member",
          {"p_membership_id": membership_id, "p_target_clinic_id": target_id, "p_target_role": "clinician"},
      )
      assert status == 403, forbidden

      status, transferred = platform_admin_session.rpc(
          "transfer_clinic_member",
          {"p_membership_id": membership_id, "p_target_clinic_id": target_id, "p_target_role": "clinician"},
      )
      assert status == 200, transferred
      assert transferred["source_clinic_id"] == source_id
      assert transferred["target_clinic_id"] == target_id
      assert transferred["new_role"] == "clinician"

      status, source_membership = service.get(
          "clinic_memberships",
          {"select": "id", "clinic_id": f"eq.{source_id}", "profile_id": f"eq.{profile_id}"},
      )
      assert status == 200, source_membership
      assert source_membership == []

      status, target_membership = service.get(
          "clinic_memberships",
          {"select": "role", "clinic_id": f"eq.{target_id}", "profile_id": f"eq.{profile_id}"},
      )
      assert status == 200, target_membership
      assert target_membership == [{"role": "clinician"}]

      status, identity = platform_admin_session.rpc("resolve_demo_identity", {"p_token": token})
      assert status == 200, identity
      assert identity["clinic_id"] == target_id
      assert identity["role"] == "clinician"

      status, source_patient_id = platform_admin_session.rpc(
          "create_managed_patient",
          {
              "p_clinic_id": source_id,
              "p_display_name": f"Source Patient {uuid.uuid4()}",
              "p_date_of_birth": "1970-01-01",
              "p_profile_id": None,
              "p_synthetic": True,
          },
      )
      assert status == 200, source_patient_id
      status, target_patient_id = platform_admin_session.rpc(
          "create_managed_patient",
          {
              "p_clinic_id": target_id,
              "p_display_name": f"Target Patient {uuid.uuid4()}",
              "p_date_of_birth": "1970-01-01",
              "p_profile_id": None,
              "p_synthetic": True,
          },
      )
      assert status == 200, target_patient_id

      transferred_session = sign_in(email)
      status, source_visible = transferred_session.get("patients", {"select": "id", "id": f"eq.{source_patient_id}"})
      assert status == 200, source_visible
      assert source_visible == []
      status, target_visible = transferred_session.get("patients", {"select": "id", "id": f"eq.{target_patient_id}"})
      assert status == 200, target_visible
      assert target_visible == [{"id": target_patient_id}]
    finally:
      _cleanup_profile(service, profile_id)


def test_transfer_last_admin_and_same_clinic_transfer_are_rejected(platform_admin_session, service, clinic_pair) -> None:
    source_id, target_id = clinic_pair
    admin_membership = _membership_id(service, source_id, BO_PROFILE_ID, "admin")

    status, same_clinic = platform_admin_session.rpc(
        "transfer_clinic_member",
        {"p_membership_id": admin_membership, "p_target_clinic_id": source_id, "p_target_role": "admin"},
    )
    assert status == 409, same_clinic

    status, last_admin = platform_admin_session.rpc(
        "transfer_clinic_member",
        {"p_membership_id": admin_membership, "p_target_clinic_id": target_id, "p_target_role": "admin"},
    )
    assert status == 409, last_admin
