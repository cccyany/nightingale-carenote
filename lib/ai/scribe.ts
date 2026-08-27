import type { LlmProviderResponse } from "./provider.ts";

export const aiScribeEntryTypes = [
  "ai_doctor_consult_summary",
  "ai_nurse_consult_summary",
  "ai_patient_session_summary"
] as const;

export type AiScribeEntryType = typeof aiScribeEntryTypes[number];

export type AiScribePersistedContent = {
  provider: string;
  provider_display: string;
  model: string | null;
  review_state: "unverified";
  generated_at: string;
  source_label: string;
  source_session_identifier: string | null;
  generated: string;
};

export function aiScribeEntryLabel(entryType: AiScribeEntryType) {
  if (entryType === "ai_doctor_consult_summary") return "Doctor-Patient Consult";
  if (entryType === "ai_nurse_consult_summary") return "Nurse-Patient Consult";
  return "AI-Patient Session";
}

export function buildAiScribeContent(
  response: LlmProviderResponse,
  sourceLabel: string,
  sessionIdentifier: string | null
): AiScribePersistedContent {
  return {
    provider: response.provider,
    provider_display: response.providerDisplayName,
    model: response.model ?? null,
    review_state: "unverified",
    generated_at: new Date().toISOString(),
    source_label: sourceLabel,
    source_session_identifier: sessionIdentifier,
    generated: response.text
  };
}

export function renderGeneratedSummary(generated: string) {
  try {
    const parsed = JSON.parse(generated) as { summary?: unknown; key_points?: unknown; review_state?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((point): point is string => typeof point === "string" && Boolean(point.trim()))
      : [];
    if (summary || keyPoints.length) {
      return [summary, ...keyPoints.map((point) => `- ${point.trim()}`)].filter(Boolean).join("\n");
    }
  } catch {
    return generated;
  }
  return generated;
}

export function transcriptEvidenceSpan(sourceTranscript: string) {
  const trimmedLine = sourceTranscript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const evidence = (trimmedLine || sourceTranscript.trim()).slice(0, 240);
  const start = sourceTranscript.indexOf(evidence);
  if (!evidence || start < 0) {
    return {
      evidenceText: "Synthetic transcript source provided.",
      charStart: 0,
      charEnd: Math.min(sourceTranscript.length, "Synthetic transcript source provided.".length)
    };
  }
  return {
    evidenceText: evidence,
    charStart: start,
    charEnd: start + evidence.length
  };
}

export function transcriptTimestampForEvidence(
  evidenceStart: number,
  sourceTranscript: string,
  segments: Array<{ start_ms: number; end_ms: number; text: string; speaker: string }>
) {
  let cursor = 0;
  for (const segment of segments) {
    const rendered = `${segment.speaker}: ${segment.text}`;
    const start = sourceTranscript.indexOf(rendered, cursor);
    if (start < 0) continue;
    const end = start + rendered.length;
    if (evidenceStart >= start && evidenceStart <= end) {
      return { startMs: segment.start_ms, endMs: segment.end_ms };
    }
    cursor = end;
  }
  return { startMs: 0, endMs: Math.max(1000, Math.min(30000, sourceTranscript.length * 40)) };
}
