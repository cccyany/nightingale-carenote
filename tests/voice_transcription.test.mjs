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
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), body: init?.body, headers: init?.headers });
      if (String(url).includes("/upload/v1beta/files") && init?.headers?.["x-goog-upload-command"] === "start") {
        return new Response(null, { status: 200, headers: { "X-Goog-Upload-URL": "https://upload.example/session" } });
      }
      if (String(url) === "https://upload.example/session") {
        assert.equal(init?.headers?.["x-goog-upload-command"], "upload, finalize");
        return new Response(JSON.stringify({
          file: { name: "files/test-audio", uri: "files/test-audio", mimeType: "audio/webm" }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      assert.match(String(url), /\/v1beta\/interactions/);
      const body = JSON.parse(String(init?.body ?? "{}"));
      assert.equal(body.model, "gemini-3.5-transcribe");
      assert.equal(body.input[0].uri, "files/test-audio");
      assert.equal(body.input[0].mime_type, "audio/webm");
      return new Response(JSON.stringify({
        steps: [{
          content: [{
            type: "text",
            text: "Ada cough at night.",
            annotations: [{
              type: "word_info",
              text: "Ada cough at night.",
              speaker: "spk:1",
              start_offset: "1.200s",
              end_offset: "4.200s"
            }]
          }]
        }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const provider = new GeminiTranscriptionProvider("synthetic-key", "gemini-3.5-transcribe", 1000);
    const result = await provider.transcribe({ audio: new Uint8Array([1, 2, 3]).buffer, mimeType: "audio/webm" });

    assert.equal(requests.length, 3);
    assert.match(requests[0].url, /\/upload\/v1beta\/files/);
    assert.equal(requests[1].url, "https://upload.example/session");
    assert.match(requests[2].url, /\/v1beta\/interactions/);
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-3.5-transcribe");
    assert.equal(result.segments[0].speaker, "unknown");
    assert.equal(result.segments[0].raw_speaker_label, "spk:1");
    assert.equal(result.segments[0].display_speaker, "Speaker 1");
    assert.equal(result.segments[0].start_ms, 1200);
    assert.equal(result.segments[0].end_ms, 4200);
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
