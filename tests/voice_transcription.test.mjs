import assert from "node:assert/strict";
import test from "node:test";
import {
  DeterministicTranscriptionProvider,
  GeminiTranscriptionProvider,
  TranscriptionProviderError,
  transcriptText
} from "../lib/voice/transcription.ts";

test("deterministic transcription normalizes speaker labels and timestamps", async () => {
  const provider = new DeterministicTranscriptionProvider();
  const result = await provider.transcribe({
    syntheticTranscriptText: [
      "Doctor: Any medication allergies?",
      "Patient: Penicillin. Last time I had a rash.",
      "Nurse: Repeat renal panel next week.",
      "No label here"
    ].join("\n")
  });

  assert.equal(result.provider, "deterministic_mock");
  assert.equal(result.segments.length, 4);
  assert.deepEqual(result.segments.map((segment) => segment.speaker), ["clinician", "patient", "staff", "unknown"]);
  assert.deepEqual(result.segments.map((segment) => segment.display_speaker), ["Doctor", "Patient", "Nurse", "unknown"]);
  assert.equal(result.segments[1].start_ms, 5000);
  assert.ok(result.segments[1].end_ms > result.segments[1].start_ms);
  assert.equal(transcriptText(result.segments).includes("Patient: Penicillin"), true);
});

test("Gemini transcription adapter sends audio to dedicated transcription model and normalizes response", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  try {
    globalThis.fetch = async (url, init) => {
      assert.match(String(url), /gemini-3\.5-transcribe:generateContent/);
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                language_info: { languages: ["en", "ms"] },
                segments: [{
                  speaker: "Speaker 1",
                  raw_speaker_label: "Speaker 1",
                  display_speaker: "Speaker 1",
                  start_ms: 1200,
                  end_ms: 4200,
                  text: "Ada cough at night.",
                  confidence: 0.66,
                  uncertain: false
                }]
              })
            }]
          }
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const provider = new GeminiTranscriptionProvider("synthetic-key", "gemini-3.5-transcribe", 1000);
    const result = await provider.transcribe({ audio: new Uint8Array([1, 2, 3]).buffer, mimeType: "audio/webm" });

    assert.match(requestBody, /inline_data/);
    assert.match(requestBody, /audio\/webm/);
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-3.5-transcribe");
    assert.equal(result.segments[0].speaker, "unknown");
    assert.equal(result.segments[0].display_speaker, "Speaker 1");
    assert.equal(result.segments[0].uncertain, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini transcription timeout aborts and returns provider_timeout", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
    const provider = new GeminiTranscriptionProvider("synthetic-key", "gemini-3.5-transcribe", 5);
    await assert.rejects(
      () => provider.transcribe({ audio: new Uint8Array([1]).buffer, mimeType: "audio/webm" }),
      (error) => error instanceof TranscriptionProviderError && error.code === "provider_timeout"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini transcription 503 is classified as provider_unavailable", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    const provider = new GeminiTranscriptionProvider("synthetic-key", "gemini-3.5-transcribe", 1000);
    await assert.rejects(
      () => provider.transcribe({ audio: new Uint8Array([1]).buffer, mimeType: "audio/webm" }),
      (error) => error instanceof TranscriptionProviderError && error.code === "provider_unavailable"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini transcription rejects empty audio without provider call", async () => {
  const provider = new GeminiTranscriptionProvider("synthetic-key", "gemini-3.5-transcribe", 1000);
  await assert.rejects(
    () => provider.transcribe({ audio: new ArrayBuffer(0), mimeType: "audio/webm" }),
    (error) => error instanceof TranscriptionProviderError && error.code === "invalid_audio"
  );
});
