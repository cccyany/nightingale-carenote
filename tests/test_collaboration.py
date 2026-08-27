import uuid

import pytest

from tests.supabase_rest import sign_in, service_session


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINICIAN_ID = "10000000-0000-0000-0000-000000000003"
STAFF_ID = "10000000-0000-0000-0000-000000000002"


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


@pytest.fixture(scope="module")
def service():
    return service_session()


def test_threaded_comments_mentions_and_task_completion_persist(staff_session, service) -> None:
    status, entry = staff_session.rpc(
        "create_care_entry",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_entry_type": "staff_note",
            "p_visibility": "staff_internal",
            "p_content": f"Synthetic collaboration note {uuid.uuid4()}.",
        },
    )
    assert status == 200, entry

    status, comment = staff_session.rpc(
        "create_comment",
        {
            "p_entry_id": entry["id"],
            "p_body": "Synthetic internal collaboration comment.",
            "p_parent_comment_id": None,
            "p_mentions": [CLINICIAN_ID],
        },
    )
    assert status == 200, comment

    status, reply = staff_session.rpc(
        "create_comment",
        {
            "p_entry_id": entry["id"],
            "p_body": "Synthetic threaded reply.",
            "p_parent_comment_id": comment["id"],
            "p_mentions": [],
        },
    )
    assert status == 200, reply
    assert reply["parent_comment_id"] == comment["id"]

    status, resolved = staff_session.rpc("set_comment_resolved", {"p_comment_id": comment["id"], "p_resolved": True})
    assert status == 200, resolved
    assert resolved["resolved_at"] is not None

    status, unresolved = staff_session.rpc("set_comment_resolved", {"p_comment_id": comment["id"], "p_resolved": False})
    assert status == 200, unresolved
    assert unresolved["resolved_at"] is None

    status, mentions = service.get(
        "comment_mentions",
        {"select": "mentioned_profile_id", "comment_id": f"eq.{comment['id']}"},
    )
    assert status == 200, mentions
    assert mentions == [{"mentioned_profile_id": CLINICIAN_ID}]

    status, task = staff_session.rpc(
        "create_task",
        {
            "p_patient_id": JANE_PATIENT_ID,
            "p_title": "Synthetic collaboration follow-up",
            "p_assignee_id": STAFF_ID,
            "p_source_entry_id": entry["id"],
            "p_due_date": "2026-08-28",
        },
    )
    assert status == 200, task
    assert task["status"] == "open"

    status, completed = staff_session.rpc("set_task_status", {"p_task_id": task["id"], "p_status": "completed"})
    assert status == 200, completed
    assert completed["status"] == "completed"
