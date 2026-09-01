import assert from "node:assert/strict";
import test from "node:test";

import { extractStructuredCandidates } from "../lib/ai/extraction.ts";

test("deterministic allergy extraction recognizes no known allergies as absent penicillin context", () => {
  const candidates = extractStructuredCandidates({
    entryId: "entry-1",
    content: "Patient says: No known allergies.",
    authorRole: "system"
  });
  const allergy = candidates.find((candidate) => candidate.candidateType === "allergy");
  assert.ok(allergy);
  assert.equal(allergy.normalizedValue, "penicillin");
  assert.equal(allergy.assertion, "absent");
  assert.equal(allergy.sourceEvidenceText, "No known allergies");
  assert.equal("Patient says: No known allergies.".slice(allergy.charStart, allergy.charEnd), allergy.sourceEvidenceText);
  assert.equal(allergy.reviewState, "needs_review");
});
