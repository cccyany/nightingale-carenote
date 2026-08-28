import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiScribeContent,
  normalizeTranscriptLabels,
  parseAiScribeTranscript,
  renderGeneratedSummary,
  transcriptEvidenceSpan,
  transcriptSourceForDisplay
} from "../lib/ai/scribe.ts";

test("AI Scribe persisted content remains unverified and records provider metadata", () => {
  const content = buildAiScribeContent(
    {
      provider: "gemini",
      providerDisplayName: "Gemini 3.5 Flash",
      model: "gemini-3.5-flash",
      text: JSON.stringify({
        summary: "Synthetic cough summary.",
        key_points: ["Repeat renal panel discussed."],
        review_state: "needs_review"
      })
    },
    "Runtime synthetic transcript",
    "session-1"
  );

  assert.equal(content.provider, "gemini");
  assert.equal(content.provider_display, "Gemini 3.5 Flash");
  assert.equal(content.model, "gemini-3.5-flash");
  assert.equal(content.review_state, "unverified");
  assert.equal(content.source_label, "Runtime synthetic transcript");
  assert.equal(content.source_session_identifier, "session-1");
});

test("AI Scribe display renders structured provider JSON without trusting it", () => {
  const display = renderGeneratedSummary(JSON.stringify({
    summary: "Patient reports mild headache since yesterday.",
    key_points: ["Denies vomiting."],
    review_state: "needs_review"
  }));

  assert.match(display, /mild headache/);
  assert.match(display, /- Denies vomiting\./);
});

test("transcript evidence span points to exact transcript source text", () => {
  const transcript = "unknown: Patient reports nocturnal cough for three weeks.\nclinician: Repeat renal panel discussed.";
  const span = transcriptEvidenceSpan(transcript);

  assert.equal(transcript.slice(span.charStart, span.charEnd), span.evidenceText);
  assert.match(span.evidenceText, /nocturnal cough/);
});

test("AI Scribe transcript parser preserves explicit Doctor and Patient speaker labels", () => {
  const transcript = parseAiScribeTranscript("Doctor: How has the cough been?\nPatient: I still have a dry cough mainly at night.");

  assert.equal(transcript.sourceTranscript, "Doctor: How has the cough been?\nPatient: I still have a dry cough mainly at night.");
  assert.equal(transcript.segments[0].speaker, "clinician");
  assert.equal(transcript.segments[0].display_speaker, "Doctor");
  assert.equal(transcript.segments[0].text, "How has the cough been?");
  assert.equal(transcript.segments[1].speaker, "patient");
  assert.equal(transcript.segments[1].display_speaker, "Patient");
  assert.equal(transcript.segments[1].text, "I still have a dry cough mainly at night.");
});

test("transcript display does not render unknown before explicit speaker labels", () => {
  const display = normalizeTranscriptLabels("unknown: Doctor: How has the cough been?\nunknown: Patient: Dry cough at night.");

  assert.equal(display, "Doctor: How has the cough been?\nPatient: Dry cough at night.");
  assert.doesNotMatch(display, /unknown: Doctor:/);
  assert.doesNotMatch(display, /Doctor: Doctor:/);
});

test("ambiguous transcript source remains unknown", () => {
  const transcript = parseAiScribeTranscript("Dry cough mainly at night.");

  assert.equal(transcript.sourceTranscript, "unknown: Dry cough mainly at night.");
  assert.equal(transcript.segments[0].speaker, "unknown");
});

test("transcript source display maps evidence without duplicated speaker prefixes", () => {
  const source = "unknown: Doctor: How has the cough been?";
  const span = transcriptEvidenceSpan(source);
  const display = transcriptSourceForDisplay(source, span.charStart, span.charEnd);

  assert.equal(display.content, "Doctor: How has the cough been?");
  assert.equal(display.content.slice(display.evidenceStart, display.evidenceEnd), "Doctor: How has the cough been?");
  assert.doesNotMatch(display.content, /unknown: Doctor:/);
  assert.doesNotMatch(display.content, /Doctor: Doctor:/);
});
