import assert from "node:assert/strict";
import test from "node:test";

import { requireAiScribePermission } from "../lib/ai/authorization.ts";

function fakeSupabase({ patient, membership, patientError = null, membershipError = null }) {
  return {
    auth: {
      getUser() {
        return { data: { user: { id: "actor-1" } }, error: null };
      }
    },
    from(table) {
      if (table === "patients") {
        return {
          select() { return this; },
          eq() { return this; },
          single() { return { data: patient, error: patientError }; }
        };
      }
      if (table === "clinic_memberships") {
        return {
          select() { return this; },
          eq() { return this; },
          in() { return this; },
          limit() { return { data: membership, error: membershipError }; }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };
}

test("AI Scribe authorization permits clinician/admin scoped memberships", async () => {
  const result = await requireAiScribePermission(fakeSupabase({
    patient: { id: "patient-1", clinic_id: "clinic-a" },
    membership: [{ role: "clinician" }]
  }), "patient-1");

  assert.equal(result.ok, true);
  assert.equal(result.clinicId, "clinic-a");
});

test("AI Scribe authorization denies patient role before provider invocation", async () => {
  const result = await requireAiScribePermission(fakeSupabase({
    patient: { id: "patient-1", clinic_id: "clinic-a" },
    membership: []
  }), "patient-1");

  assert.deepEqual(result, { ok: false, status: 403, message: "Forbidden" });
});

test("AI Scribe authorization hides cross-clinic patients before provider invocation", async () => {
  const result = await requireAiScribePermission(fakeSupabase({
    patient: null,
    membership: [],
    patientError: { code: "PGRST116", message: "0 rows" }
  }), "patient-1");

  assert.deepEqual(result, { ok: false, status: 404, message: "Patient not found" });
});
