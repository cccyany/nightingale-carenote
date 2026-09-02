import assert from "node:assert/strict";
import test from "node:test";

import { persistRuntimeClinicalIntelligence } from "../lib/ai/runtime-intelligence.ts";

function fakeSupabase() {
  const calls = [];
  const spanByEvidence = new Map();
  let spanIndex = 0;

  return {
    calls,
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === "create_provenance_for_transcript_span") {
        const key = `${params.p_entry_id}:${params.p_evidence_text}:${params.p_char_start}:${params.p_char_end}`;
        if (!spanByEvidence.has(key)) {
          spanIndex += 1;
          spanByEvidence.set(key, `span-${spanIndex}`);
        }
        return { data: spanByEvidence.get(key), error: null };
      }
      if (name === "create_voice_provenance_for_transcript_span") {
        const key = `${params.p_entry_id}:${params.p_evidence_text}:${params.p_char_start}:${params.p_char_end}:${params.p_transcript_segment_id ?? "none"}`;
        if (!spanByEvidence.has(key)) {
          spanIndex += 1;
          spanByEvidence.set(key, `span-${spanIndex}`);
        }
        return { data: spanByEvidence.get(key), error: null };
      }
      if (name === "upsert_fact_from_span") {
        return { data: `fact-${params.p_entity_type}-${params.p_normalized_entity}-${params.p_assertion}`, error: null };
      }
      if (name === "create_runtime_glance_candidate") {
        return { data: { id: `glance-${params.p_rule_key}`, importance_score: 72 }, error: null };
      }
      if (name === "detect_fact_conflicts_for_patient") {
        return { data: 1, error: null };
      }
      if (name === "rerank_patient_glance") {
        return { data: 3, error: null };
      }
      return { data: null, error: new Error(`unexpected rpc ${name}`) };
    }
  };
}

test("runtime AI Scribe extraction persists unverified provenance-bound facts and reranks Glance", async () => {
  const supabase = fakeSupabase();
  const sourceTranscript = [
    "Doctor: Patient has Penicillin allergy.",
    "Patient: No known allergies.",
    "Doctor: Repeat renal panel discussed.",
    "Patient: Nocturnal cough for three weeks."
  ].join("\n");

  const result = await persistRuntimeClinicalIntelligence({
    supabase,
    patientId: "patient-1",
    entryId: "entry-1",
    sourceTranscript,
    sourceLabel: "Runtime synthetic transcript",
    sessionIdentifier: "session-1",
    segments: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.persistedFacts, 2);
  assert.equal(result.createdOrExistingConflicts, 1);
  assert.equal(result.createdOrExistingGlanceItems, 2);

  const factCalls = supabase.calls.filter((call) => call.name === "upsert_fact_from_span");
  assert.equal(factCalls.length, 2);
  assert.deepEqual(factCalls.map((call) => call.params.p_entity_type).sort(), ["allergy", "allergy"]);
  assert.ok(factCalls.every((call) => call.params.p_review_status === "needs_review"));
  assert.ok(factCalls.every((call) => call.params.p_extraction_method === "deterministic_runtime_ai_scribe"));

  const spanCalls = supabase.calls.filter((call) => call.name === "create_provenance_for_transcript_span");
  assert.ok(spanCalls.length >= 4);
  for (const call of spanCalls) {
    const evidence = String(call.params.p_evidence_text);
    assert.equal(sourceTranscript.slice(call.params.p_char_start, call.params.p_char_end), evidence);
  }

  const glanceCalls = supabase.calls.filter((call) => call.name === "create_runtime_glance_candidate");
  assert.deepEqual(glanceCalls.map((call) => call.params.p_rule_key).sort(), ["SYMPTOM_PERSISTENT", "UNRESOLVED_TASK"]);
  assert.equal(supabase.calls.at(-1).name, "rerank_patient_glance");
});

test("voice runtime intelligence attaches direct transcript segment provenance for contextual allergy", async () => {
  const supabase = fakeSupabase();
  const sourceTranscript = [
    "Speaker 0: Do you have any medication allergies?",
    "Speaker 1: Yes. Penicillin.",
    "Speaker 0: Are you taking any regular medication?",
    "Speaker 1: I take metformin 500 mg twice a day."
  ].join("\n");

  const result = await persistRuntimeClinicalIntelligence({
    supabase,
    patientId: "patient-1",
    entryId: "entry-1",
    sourceTranscript,
    sourceLabel: "Voice transcript",
    sessionIdentifier: "session-1",
    provenanceRpcName: "create_voice_provenance_for_transcript_span",
    segments: [
      { id: "segment-question", speaker: "unknown", display_speaker: "Speaker 0", start_ms: 100, end_ms: 2400, text: "Do you have any medication allergies?" },
      { id: "segment-answer", speaker: "unknown", display_speaker: "Speaker 1", start_ms: 4000, end_ms: 6700, text: "Yes. Penicillin." },
      { id: "segment-med-question", speaker: "unknown", display_speaker: "Speaker 0", start_ms: 9000, end_ms: 11000, text: "Are you taking any regular medication?" },
      { id: "segment-med-answer", speaker: "unknown", display_speaker: "Speaker 1", start_ms: 13000, end_ms: 17000, text: "I take metformin 500 mg twice a day." }
    ]
  });

  assert.equal(result.ok, true);
  const factCalls = supabase.calls.filter((call) => call.name === "upsert_fact_from_span");
  assert.deepEqual(factCalls.map((call) => call.params.p_entity_type).sort(), ["allergy", "dosage", "medication"]);
  const allergyFact = factCalls.find((call) => call.params.p_entity_type === "allergy");
  assert.equal(allergyFact.params.p_review_status, "needs_review");

  const spanCalls = supabase.calls.filter((call) => call.name === "create_voice_provenance_for_transcript_span");
  const answerSpan = spanCalls.find((call) => call.params.p_evidence_text === "Speaker 1: Yes. Penicillin.");
  const questionSpan = spanCalls.find((call) => call.params.p_evidence_text === "Speaker 0: Do you have any medication allergies?");
  assert.equal(answerSpan.params.p_transcript_segment_id, "segment-answer");
  assert.equal(questionSpan.params.p_transcript_segment_id, "segment-question");
});

test("runtime AI Scribe does not create Glance cards for low-value unsupported text", async () => {
  const supabase = fakeSupabase();
  const result = await persistRuntimeClinicalIntelligence({
    supabase,
    patientId: "patient-1",
    entryId: "entry-1",
    sourceTranscript: "Doctor: No fever. No shortness of breath.",
    sourceLabel: "Runtime synthetic transcript",
    sessionIdentifier: "session-1",
    segments: []
  });

  assert.equal(result.ok, true);
  assert.equal(result.createdOrExistingGlanceItems, 0);
  assert.equal(supabase.calls.filter((call) => call.name === "create_runtime_glance_candidate").length, 0);
});

test("runtime AI Scribe returns safe failure if provenance persistence fails", async () => {
  const calls = [];
  const supabase = {
    calls,
    async rpc(name, params) {
      calls.push({ name, params });
      if (name === "create_provenance_for_transcript_span") {
        return { data: null, error: { code: "23514", message: "invalid provenance" } };
      }
      return { data: null, error: null };
    }
  };

  const result = await persistRuntimeClinicalIntelligence({
    supabase,
    patientId: "patient-1",
    entryId: "entry-1",
    sourceTranscript: "Patient: No known allergies.",
    sourceLabel: "Runtime synthetic transcript",
    sessionIdentifier: "session-1",
    segments: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "provenance_error");
  assert.equal(supabase.calls.some((call) => call.name === "detect_fact_conflicts_for_patient"), false);
  assert.doesNotMatch(JSON.stringify(result), /No known allergies/);
});
