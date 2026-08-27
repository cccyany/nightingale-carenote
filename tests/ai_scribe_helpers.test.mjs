import assert from "node:assert/strict";
import test from "node:test";

import { buildAiScribeContent, renderGeneratedSummary, transcriptEvidenceSpan } from "../lib/ai/scribe.ts";

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
