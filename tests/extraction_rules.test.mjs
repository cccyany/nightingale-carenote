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

test("symptom extraction skips question-form mentions", () => {
  const candidates = extractStructuredCandidates({
    entryId: "entry-1",
    content: "Speaker 0: Any shortness of breath?",
    authorRole: "system"
  });

  assert.equal(candidates.some((candidate) => candidate.candidateType === "symptom" && candidate.normalizedValue === "shortness of breath"), false);
});

test("symptom question does not suppress positive patient answer", () => {
  const content = [
    "Speaker 0: Any dizziness?",
    "Speaker 1: Yes, I felt dizziness yesterday."
  ].join("\n");
  const candidates = extractStructuredCandidates({ entryId: "entry-1", content, authorRole: "system" });
  const symptoms = candidates.filter((candidate) => candidate.candidateType === "symptom" && candidate.normalizedValue === "dizziness");

  assert.equal(symptoms.length, 1);
  assert.equal(symptoms[0].sourceEvidenceText, "dizziness");
  assert.equal(content.slice(symptoms[0].charStart, symptoms[0].charEnd), "dizziness");
});

test("symptom extraction preserves declarative clinician note evidence", () => {
  const content = "Doctor note: Patient reports shortness of breath.";
  const candidates = extractStructuredCandidates({ entryId: "entry-1", content, authorRole: "clinician" });
  const symptom = candidates.find((candidate) => candidate.candidateType === "symptom" && candidate.normalizedValue === "shortness of breath");

  assert.ok(symptom);
  assert.equal(symptom.assertion, "present");
  assert.equal(symptom.reviewState, "suggested");
});

test("dosage extraction recognizes compact mg and milligram variants as mg", () => {
  for (const content of [
    "I take metformin 500 mg twice a day.",
    "I take metformin 500 milligram twice a day.",
    "I take metformin 500 milligrams twice a day."
  ]) {
    const candidates = extractStructuredCandidates({ entryId: "entry-1", content, authorRole: "system" });
    const dosage = candidates.find((candidate) => candidate.candidateType === "dosage");

    assert.ok(dosage, content);
    assert.equal(dosage.normalizedValue, "metformin");
    assert.equal(dosage.value, "500");
    assert.equal(dosage.unit, "mg");
    assert.equal(content.slice(dosage.charStart, dosage.charEnd), dosage.sourceEvidenceText);
  }
});

test("dosage extraction keeps medication extraction and ignores unrelated numeric text", () => {
  const medicationCandidates = extractStructuredCandidates({
    entryId: "entry-1",
    content: "I take metformin 500 milligrams twice a day.",
    authorRole: "system"
  });

  assert.ok(medicationCandidates.some((candidate) => candidate.candidateType === "medication" && candidate.normalizedValue === "metformin"));

  const unrelatedCandidates = extractStructuredCandidates({
    entryId: "entry-1",
    content: "Patient walked 500 meters yesterday and drank 500 milliliters of water.",
    authorRole: "system"
  });

  assert.equal(unrelatedCandidates.some((candidate) => candidate.candidateType === "dosage"), false);
});
