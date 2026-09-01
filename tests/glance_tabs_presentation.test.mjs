import assert from "node:assert/strict";
import test from "node:test";

import { glanceViewBadge, splitGlancePresentationItems } from "../lib/glance-presentation.ts";

function item(title, status = "needs_review", overrides = {}) {
  return {
    title,
    status,
    confirmation_status: status,
    short_summary: `${title} summary`,
    risk_reason: `${title} reason`,
    rule_key: title.toUpperCase().replaceAll(" ", "_"),
    ...overrides
  };
}

test("Glance tabs split active attention from confirmed non-conflict items", () => {
  const split = splitGlancePresentationItems([
    item("Allergy conflict", "needs_review", { rule_key: "ALLERGY_CONFLICT" }),
    item("Medication conflict", "confirmed", { rule_key: "MEDICATION_CONFLICT" }),
    item("Persistent cough", "confirmed", { rule_key: "SYMPTOM_PERSISTENT" }),
    item("Outstanding renal panel", "needs_review", { rule_key: "UNRESOLVED_RENAL_PANEL" }),
    item("Resolved dose conflict", "resolved", { rule_key: "MEDICATION_DOSE_CONFLICT" })
  ]);

  assert.deepEqual(split.active.map((row) => row.title), [
    "Allergy conflict",
    "Medication conflict",
    "Outstanding renal panel"
  ]);
  assert.deepEqual(split.confirmed.map((row) => row.title), ["Persistent cough"]);
});

test("confirmed Glance badge text operates within the selected view", () => {
  assert.equal(glanceViewBadge("confirmed", 1, 1), "1 confirmed item");
  assert.match(glanceViewBadge("confirmed", 5, 3), /^5 confirmed items . showing 3$/);
});
