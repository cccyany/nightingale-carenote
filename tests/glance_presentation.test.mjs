import assert from "node:assert/strict";
import test from "node:test";

import { activeGlanceBadge, presentableGlanceItems } from "../lib/glance-presentation.ts";

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

test("presentable Glance items hide validation artifacts and dedupe clinical issues", () => {
  const visible = presentableGlanceItems([
    item("Allergy conflict"),
    item("Allergy conflict duplicate"),
    item("Synthetic safety baseline"),
    item("Outstanding renal panel"),
    item("Persistent cough")
  ]);

  assert.deepEqual(visible.map((row) => row.title), [
    "Allergy conflict",
    "Outstanding renal panel",
    "Persistent cough"
  ]);
});

test("active Glance badge distinguishes total active items from visible cards", () => {
  assert.equal(activeGlanceBadge(1, 1), "1 active item");
  assert.equal(activeGlanceBadge(3, 3), "3 active items");
  assert.equal(activeGlanceBadge(5, 3), "5 active items · showing 3");
  assert.equal(activeGlanceBadge(6, 5), "6 active items · showing 5");
});
