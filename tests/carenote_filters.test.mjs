import assert from "node:assert/strict";
import test from "node:test";

import { AI_SCRIBE_ENTRY_TYPES, applyTimelineEntryFilter, filterForRole } from "../lib/timeline-filters.ts";

function fakeQuery() {
  const calls = [];
  return {
    calls,
    in(column, values) {
      calls.push(["in", column, [...values]]);
      return this;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    }
  };
}

test("AI Scribe timeline filter uses enum-safe explicit entry types", () => {
  const query = fakeQuery();

  applyTimelineEntryFilter(query, filterForRole("ai"));

  assert.deepEqual(query.calls, [
    [
      "in",
      "entry_type",
      [
        "ai_doctor_consult_summary",
        "ai_nurse_consult_summary",
        "ai_patient_session_summary"
      ]
    ]
  ]);
  assert.deepEqual([...AI_SCRIBE_ENTRY_TYPES], query.calls[0][2]);
});

test("role timeline filters apply author_role equality", () => {
  for (const role of ["clinician", "staff", "patient", "system"]) {
    const query = fakeQuery();

    applyTimelineEntryFilter(query, filterForRole(role));

    assert.deepEqual(query.calls, [["eq", "author_role", role]]);
  }
});

test("all timeline filter does not add a secondary filter", () => {
  const query = fakeQuery();

  applyTimelineEntryFilter(query, filterForRole("all"));

  assert.deepEqual(query.calls, []);
});
