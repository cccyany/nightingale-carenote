import pytest

from tests.supabase_rest import sign_in


pytestmark = pytest.mark.supabase_integration

JANE_PATIENT_ID = "30000000-0000-0000-0000-000000000001"


@pytest.fixture(scope="module")
def staff_session():
    return sign_in("staff.a@example.test")


def test_warm_glance_read_uses_persisted_ranked_items_without_ai_work(staff_session) -> None:
    status, rows = staff_session.rpc("read_patient_glance", {"p_patient_id": JANE_PATIENT_ID})

    assert status == 200, rows
    assert 1 <= len(rows) <= 5
    scores = [row["importance_score"] for row in rows]
    assert scores == sorted(scores, reverse=True)
    for row in rows:
        assert row["importance_reasons"]
        assert row["storage_class"] in {"HOT", "WARM", "COLD"}
        assert row["ranking_explanation"]
        assert row["provenance_span_id"]
