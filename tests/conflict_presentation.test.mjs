import assert from "node:assert/strict";
import test from "node:test";

import { chronologicalConflictEvidence, outcomeForConflictEvidenceSide } from "../lib/conflict-presentation.ts";

test("conflict evidence presentation labels older source earlier even when fact A is newer", () => {
  const factA = {
    id: "fact-newer",
    normalized_entity: "penicillin",
    source_entry_id: "fresh-entry",
    provenance_span_id: "fresh-span"
  };
  const factB = {
    id: "fact-older",
    normalized_entity: "penicillin",
    source_entry_id: "historical-entry",
    provenance_span_id: "historical-span"
  };
  const [earlier, later] = chronologicalConflictEvidence([
    { side: "fact_a", fact: factA, entry: { occurred_at: "2026-09-03T09:00:00+08:00" } },
    { side: "fact_b", fact: factB, entry: { occurred_at: "2026-08-26T09:00:00+08:00" } }
  ]);

  assert.equal(earlier.fact.id, "fact-older");
  assert.equal(earlier.side, "fact_b");
  assert.equal(earlier.fact.source_entry_id, "historical-entry");
  assert.equal(earlier.fact.provenance_span_id, "historical-span");
  assert.equal(later.fact.id, "fact-newer");
  assert.equal(later.side, "fact_a");
  assert.equal(later.fact.source_entry_id, "fresh-entry");
  assert.equal(later.fact.provenance_span_id, "fresh-span");
  assert.equal(outcomeForConflictEvidenceSide(earlier.side), "accept_fact_b");
  assert.equal(outcomeForConflictEvidenceSide(later.side), "accept_fact_a");
});
