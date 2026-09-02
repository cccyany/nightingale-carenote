export type TranscriptSegment = {
  id?: string;
  speaker: "patient" | "clinician" | "staff" | "unknown";
  display_speaker?: string;
  raw_speaker_label?: string;
  provider_metadata?: Record<string, unknown>;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number;
  uncertain: boolean;
};

export interface TranscriptionProvider {
  transcribe(input: { syntheticTranscriptText?: string; audio?: ArrayBuffer; mimeType?: string }): Promise<TranscriptionResult>;
}

export type TranscriptionResult = {
  provider: string;
  model: string;
  languageInfo?: Record<string, unknown>;
  segments: TranscriptSegment[];
};

export class TranscriptionProviderError extends Error {
  code: "provider_timeout" | "provider_unavailable" | "provider_error" | "invalid_audio";

  constructor(code: TranscriptionProviderError["code"], message: string) {
    super(message);
    this.name = "TranscriptionProviderError";
    this.code = code;
  }
}

export const DEFAULT_GEMINI_TRANSCRIBE_MODEL = "gemini-3.5-transcribe";
export const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = Number(process.env.TRANSCRIPTION_PROVIDER_TIMEOUT_MS ?? 30000);

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function classifyStatus(status: number) {
  return status === 503 || status === 502 || status === 504 || status === 429 ? "provider_unavailable" : "provider_error";
}

function normalizeSpeakerLabel(label: unknown): Pick<TranscriptSegment, "speaker" | "display_speaker" | "raw_speaker_label"> {
  const raw = typeof label === "string" && label.trim() ? label.trim() : "unknown";
  const normalized = raw.toLowerCase().replace(/[_-]/g, " ");
  if (/doctor|clinician|physician/.test(normalized)) return { speaker: "clinician", display_speaker: "Clinician", raw_speaker_label: raw };
  if (/nurse|staff/.test(normalized)) return { speaker: "staff", display_speaker: "Staff", raw_speaker_label: raw };
  if (/patient/.test(normalized)) return { speaker: "patient", display_speaker: "Patient", raw_speaker_label: raw };
  if (/spk[:_\s-]*\d+/.test(normalized)) return { speaker: "unknown", display_speaker: raw.replace(/^spk[:_\s-]*/i, "Speaker "), raw_speaker_label: raw };
  if (/speaker\s*\d+/.test(normalized)) return { speaker: "unknown", display_speaker: raw.replace(/^speaker/i, "Speaker"), raw_speaker_label: raw };
  return { speaker: "unknown", display_speaker: raw === "unknown" ? "unknown" : raw, raw_speaker_label: raw };
}

export class DeterministicTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: { syntheticTranscriptText?: string }): Promise<TranscriptionResult> {
    const parts = (input.syntheticTranscriptText ?? "").split(/\n+/).filter(Boolean);
    const segments = parts.map((part, index) => {
      const speakerMatch = /^(doctor|clinician|nurse|patient|staff|unknown):\s*/i.exec(part);
      const label = speakerMatch?.[1]?.toLowerCase();
      const speaker = label === "doctor" ? "clinician" : label === "nurse" ? "staff" : label;
      const displaySpeaker = label ? label.charAt(0).toUpperCase() + label.slice(1) : "unknown";
      const text = part.replace(/^(doctor|clinician|nurse|patient|staff|unknown):\s*/i, "");
      return {
        speaker: (speaker as TranscriptSegment["speaker"]) ?? "unknown",
        display_speaker: displaySpeaker,
        raw_speaker_label: label ?? "unknown",
        start_ms: index * 5000,
        end_ms: index * 5000 + Math.max(1000, text.length * 40),
        text,
        confidence: /unclear|inaudible|\[uncertain\]/i.test(text) ? 0.55 : 0.85,
        uncertain: /unclear|inaudible|\[uncertain\]/i.test(text)
      };
    });
    return {
      provider: "deterministic_mock",
      model: "deterministic_transcription",
      languageInfo: { mode: "synthetic_text_fixture" },
      segments
    };
  }
}

type GeminiTranscriptPayload = {
  language_info?: Record<string, unknown>;
  segments?: Array<{
    speaker?: unknown;
    raw_speaker_label?: unknown;
    display_speaker?: unknown;
    start_ms?: unknown;
    end_ms?: unknown;
    text?: unknown;
    confidence?: unknown;
    uncertain?: unknown;
  }>;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type GeminiFileUploadResponse = {
  file?: {
    uri?: string;
    mimeType?: string;
    name?: string;
  };
};

type GeminiInteractionResponse = {
  output_text?: string;
  outputs?: Array<{ type?: string; text?: string }>;
  steps?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{
        type?: string;
        text?: string;
        speaker?: string;
        start_offset?: string;
        end_offset?: string;
      }>;
    }>;
  }>;
};

function offsetToMs(offset?: string) {
  const match = /^([0-9]+(?:\.[0-9]+)?)s$/.exec(offset ?? "");
  return match ? Math.round(Number(match[1]) * 1000) : null;
}

function textFromInteraction(payload: GeminiInteractionResponse) {
  return [
    payload.output_text,
    ...(payload.outputs ?? []).map((output) => output.type === "text" ? output.text : null),
    ...(payload.steps ?? []).flatMap((step) => step.content ?? []).map((content) => content.type === "text" ? content.text : null)
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join("\n").trim();
}

function segmentsFromInteraction(payload: GeminiInteractionResponse): TranscriptSegment[] {
  const annotations = (payload.steps ?? [])
    .flatMap((step) => step.content ?? [])
    .flatMap((content) => content.annotations ?? [])
    .filter((annotation) => annotation.type === "word_info" && annotation.text);
  if (!annotations.length) {
    const text = textFromInteraction(payload);
    if (!text) throw new TranscriptionProviderError("provider_error", "Transcription provider returned no transcript text");
    return [{
      speaker: "unknown",
      display_speaker: "unknown",
      raw_speaker_label: "unknown",
      start_ms: 0,
      end_ms: Math.max(1000, text.length * 40),
      text,
      confidence: 0.5,
      uncertain: true,
      provider_metadata: { timestamp_source: "estimated", speaker_source: "not_returned" }
    }];
  }

  const groups: TranscriptSegment[] = [];
  for (const annotation of annotations) {
    const rawSpeaker = annotation.speaker ?? "unknown";
    const speaker = normalizeSpeakerLabel(rawSpeaker);
    const startMs = offsetToMs(annotation.start_offset) ?? groups.at(-1)?.end_ms ?? 0;
    const endMs = offsetToMs(annotation.end_offset) ?? startMs + Math.max(200, String(annotation.text).length * 40);
    const previous = groups.at(-1);
    if (previous && previous.raw_speaker_label === rawSpeaker && startMs - previous.end_ms < 1500) {
      previous.text = `${previous.text} ${annotation.text}`.trim();
      previous.end_ms = Math.max(previous.end_ms, endMs);
    } else {
      groups.push({
        speaker: speaker.speaker,
        display_speaker: speaker.display_speaker,
        raw_speaker_label: rawSpeaker,
        start_ms: Math.max(0, startMs),
        end_ms: Math.max(startMs, endMs),
        text: String(annotation.text).trim(),
        confidence: 0.5,
        uncertain: true,
        provider_metadata: { timestamp_source: "provider_word_info", speaker_source: rawSpeaker === "unknown" ? "not_returned" : "provider" }
      });
    }
  }
  return groups;
}

function parseGeminiTranscript(text: string): TranscriptSegment[] {
  let parsed: GeminiTranscriptPayload;
  try {
    parsed = JSON.parse(text) as GeminiTranscriptPayload;
  } catch {
    throw new TranscriptionProviderError("provider_error", "Transcription provider returned malformed JSON");
  }
  if (!Array.isArray(parsed.segments) || !parsed.segments.length) {
    throw new TranscriptionProviderError("provider_error", "Transcription provider returned no transcript segments");
  }
  return parsed.segments.map((segment, index) => {
    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    if (!text) throw new TranscriptionProviderError("provider_error", "Transcription provider returned an empty transcript segment");
    const speaker = normalizeSpeakerLabel(segment.display_speaker ?? segment.speaker ?? segment.raw_speaker_label);
    const startMs = typeof segment.start_ms === "number" && Number.isFinite(segment.start_ms) ? Math.max(0, Math.round(segment.start_ms)) : index * 5000;
    const endMs = typeof segment.end_ms === "number" && Number.isFinite(segment.end_ms)
      ? Math.max(startMs, Math.round(segment.end_ms))
      : startMs + Math.max(1000, text.length * 40);
    const confidence = typeof segment.confidence === "number" && Number.isFinite(segment.confidence)
      ? Math.max(0, Math.min(1, segment.confidence))
      : 0.5;
    return {
      speaker: speaker.speaker,
      display_speaker: speaker.display_speaker,
      raw_speaker_label: speaker.raw_speaker_label,
      start_ms: startMs,
      end_ms: endMs,
      text,
      confidence,
      uncertain: Boolean(segment.uncertain) || confidence < 0.7
    };
  });
}

export class GeminiTranscriptionProvider implements TranscriptionProvider {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey: string, model = process.env.GEMINI_TRANSCRIBE_MODEL || DEFAULT_GEMINI_TRANSCRIBE_MODEL, timeoutMs = DEFAULT_TRANSCRIPTION_TIMEOUT_MS) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async transcribe(input: { audio?: ArrayBuffer; mimeType?: string }): Promise<TranscriptionResult> {
    if (!input.audio?.byteLength || !input.mimeType) {
      throw new TranscriptionProviderError("invalid_audio", "Audio file is empty or unsupported");
    }
    const uploadStart = timeoutSignal(this.timeoutMs);
    let uploadUrl: string | null;
    try {
      const startResponse = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
        method: "POST",
        signal: uploadStart.signal,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
          "x-goog-upload-protocol": "resumable",
          "x-goog-upload-command": "start",
          "x-goog-upload-header-content-length": String(input.audio.byteLength),
          "x-goog-upload-header-content-type": input.mimeType
        },
        body: JSON.stringify({ file: { display_name: "nightingale-ambient-consult" } })
      });
      if (!startResponse.ok) {
        throw new TranscriptionProviderError(classifyStatus(startResponse.status), `Transcription upload failed with ${startResponse.status}`);
      }
      uploadUrl = startResponse.headers.get("x-goog-upload-url");
      if (!uploadUrl) throw new TranscriptionProviderError("provider_error", "Transcription upload URL was not returned");
    } catch (error) {
      if (error instanceof TranscriptionProviderError) throw error;
      if (isAbortError(error)) throw new TranscriptionProviderError("provider_timeout", "Transcription upload timed out");
      throw new TranscriptionProviderError("provider_error", "Transcription upload request failed");
    } finally {
      uploadStart.clear();
    }

    const uploadFinalize = timeoutSignal(this.timeoutMs);
    let file: NonNullable<GeminiFileUploadResponse["file"]>;
    try {
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        signal: uploadFinalize.signal,
        headers: {
          "content-length": String(input.audio.byteLength),
          "x-goog-upload-offset": "0",
          "x-goog-upload-command": "upload, finalize"
        },
        body: Buffer.from(input.audio)
      });
      if (!uploadResponse.ok) {
        throw new TranscriptionProviderError(classifyStatus(uploadResponse.status), `Transcription upload failed with ${uploadResponse.status}`);
      }
      const uploadPayload = await uploadResponse.json() as GeminiFileUploadResponse;
      file = uploadPayload.file ?? {};
      if (!file.uri) throw new TranscriptionProviderError("provider_error", "Uploaded audio URI was not returned");
    } catch (error) {
      if (error instanceof TranscriptionProviderError) throw error;
      if (isAbortError(error)) throw new TranscriptionProviderError("provider_timeout", "Transcription upload timed out");
      throw new TranscriptionProviderError("provider_error", "Transcription upload request failed");
    } finally {
      uploadFinalize.clear();
    }

    const timeout = timeoutSignal(this.timeoutMs);
    let response: Response;
    try {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        signal: timeout.signal,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify({
          model: this.model,
          input: [{
            type: "audio",
            uri: file.uri,
            mime_type: file.mimeType ?? input.mimeType
          }],
          generation_config: {
            transcription_config: {
              language_codes: [],
              mode: {
                type: "verbatim",
                diarization_mode: "speaker",
                timestamp_granularities: ["word"]
              }
            }
          }
        })
      });
    } catch (error) {
      if (isAbortError(error)) throw new TranscriptionProviderError("provider_timeout", "Transcription provider timed out");
      throw new TranscriptionProviderError("provider_error", "Transcription provider request failed");
    } finally {
      timeout.clear();
    }

    if (!response.ok) {
      throw new TranscriptionProviderError(classifyStatus(response.status), `Transcription provider failed with ${response.status}`);
    }
    const payload = await response.json() as GeminiInteractionResponse | GeminiGenerateContentResponse;
    const candidateText = "candidates" in payload
      ? payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []).map((part) => part.text ?? "").join("").trim()
      : "";
    const segments = candidateText ? parseGeminiTranscript(candidateText) : segmentsFromInteraction(payload as GeminiInteractionResponse);
    return {
      provider: "gemini",
      model: this.model,
      languageInfo: { provider_model: this.model, file_name: file.name ?? null, file_mime_type: file.mimeType ?? input.mimeType },
      segments
    };
  }
}

export function configuredTranscriptionProvider(): TranscriptionProvider {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new TranscriptionProviderError("provider_unavailable", "Gemini transcription is not configured");
  }
  return new GeminiTranscriptionProvider(geminiApiKey);
}

export function transcriptText(segments: TranscriptSegment[]) {
  return segments.map((segment) => `${segment.display_speaker ?? segment.speaker}: ${segment.text}`).join("\n");
}
