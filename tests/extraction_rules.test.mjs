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

test("contextual allergy extraction uses allergy question plus affirmative penicillin answer", () => {
  const content = [
    "Speaker 0: Do you have any medication allergies?",
    "Speaker 1: Yes. Penicillin."
  ].join("\n");
  const candidates = extractStructuredCandidates({ entryId: "entry-1", content, authorRole: "system" });
  const allergy = candidates.find((candidate) => candidate.candidateType === "allergy" && candidate.assertion === "present");
  assert.ok(allergy);
  assert.equal(allergy.normalizedValue, "penicillin");
  assert.equal(allergy.sourceEvidenceText, "Speaker 1: Yes. Penicillin.");
  assert.equal(content.slice(allergy.charStart, allergy.charEnd), allergy.sourceEvidenceText);
  assert.equal(allergy.reviewState, "needs_review");
  assert.equal(allergy.evidenceQualityState, "needs_review");
  assert.equal(allergy.supportingEvidence?.[0].sourceEvidenceText, "Speaker 0: Do you have any medication allergies?");
});

test("contextual allergy extraction does not create positive allergy for negative answer", () => {
  const content = [
    "Speaker 0: Do you have any medication allergies?",
    "Speaker 1: No."
  ].join("\n");
  const candidates = extractStructuredCandidates({ entryId: "entry-1", content, authorRole: "system" });
  assert.equal(candidates.some((candidate) => candidate.candidateType === "allergy" && candidate.assertion === "present"), false);
});

test("contextual allergy extraction rejects unrelated penicillin mentions", () => {
  for (const content of [
    "Patient: I was prescribed penicillin.",
    "Staff: Do you stock penicillin?",
    "Patient: My mother is allergic to penicillin.",
    "Clinician: We discussed penicillin yesterday."
  ]) {
    const candidates = extractStructuredCandidates({ entryId: "entry-1", content, authorRole: "system" });
    assert.equal(candidates.some((candidate) => candidate.candidateType === "allergy" && candidate.assertion === "present"), false, content);
  }
});
