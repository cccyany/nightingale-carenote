import pytest

from tests.supabase_rest import SupabaseUnavailable, sign_in


JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"
CLINIC_B_PATIENT_ID = "30000000-0000-0000-0000-000000000002"
AI_ENTRY_TYPES = {
    "ai_doctor_consult_summary",
    "ai_nurse_consult_summary",
    "ai_patient_session_summary",
}


pytestmark = pytest.mark.supabase_integration


@pytest.fixture(scope="module")
def clinician_session():
    try:
        return sign_in("clinician.a@example.test")
    except SupabaseUnavailable as exc:
        pytest.skip(str(exc))


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


@pytest.fixture(scope="module")
def clinic_b_staff_session():
    return sign_in("staff.b@example.test")


def test_ai_scribe_filter_uses_enum_values_without_postgres_42883(clinician_session) -> None:
    status, rows = clinician_session.get(
        "care_entries",
        {
            "select": "id,entry_type,author_role",
            "patient_id": f"eq.{JANE_PATIENT_ID}",
            "entry_type": "in.(ai_doctor_consult_summary,ai_nurse_consult_summary,ai_patient_session_summary)",
            "order": "occurred_at.desc",
        },
    )

    assert status == 200, rows
    assert rows, "Jane demo should include AI-scribed timeline entries"
    assert {row["entry_type"] for row in rows}.issubset(AI_ENTRY_TYPES)
    assert {row["author_role"] for row in rows} == {"system"}


@pytest.mark.parametrize(
    ("filter_param", "expected_role"),
    [
        ({}, None),
        ({"entry_type": "in.(ai_doctor_consult_summary,ai_nurse_consult_summary,ai_patient_session_summary)"}, "system"),
        ({"author_role": "eq.clinician"}, "clinician"),
        ({"author_role": "eq.staff"}, "staff"),
        ({"author_role": "eq.patient"}, "patient"),
        ({"author_role": "eq.system"}, "system"),
    ],
)
def test_timeline_filters_return_only_expected_visible_entries(clinician_session, filter_param, expected_role) -> None:
    params = {
        "select": "id,entry_type,author_role",
        "patient_id": f"eq.{JANE_PATIENT_ID}",
        "order": "occurred_at.desc",
        **filter_param,
    }

    status, rows = clinician_session.get("care_entries", params)

    assert status == 200, rows
    if expected_role:
        assert all(row["author_role"] == expected_role for row in rows)
    if "entry_type" in filter_param:
        assert {row["entry_type"] for row in rows}.issubset(AI_ENTRY_TYPES)


def test_timeline_filters_preserve_clinic_isolation(staff_session, clinic_b_staff_session) -> None:
    clinic_a_status, clinic_a_rows = staff_session.get(
        "care_entries",
        {"select": "id", "patient_id": f"eq.{CLINIC_B_PATIENT_ID}"},
    )
    clinic_b_status, clinic_b_rows = clinic_b_staff_session.get(
        "care_entries",
        {"select": "id", "patient_id": f"eq.{JANE_PATIENT_ID}"},
    )

    assert clinic_a_status == 200
    assert clinic_a_rows == []
    assert clinic_b_status == 200
    assert clinic_b_rows == []
