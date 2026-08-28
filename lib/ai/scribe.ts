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

export type TranscriptSpeaker = "patient" | "clinician" | "staff" | "unknown";

export type RuntimeTranscriptSegment = {
  speaker: TranscriptSpeaker;
  display_speaker: string;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number;
  uncertain: boolean;
};

const speakerLabels: Record<string, { speaker: TranscriptSpeaker; display: string }> = {
  doctor: { speaker: "clinician", display: "Doctor" },
  clinician: { speaker: "clinician", display: "Clinician" },
  nurse: { speaker: "staff", display: "Nurse" },
  patient: { speaker: "patient", display: "Patient" },
  staff: { speaker: "staff", display: "Staff" },
  unknown: { speaker: "unknown", display: "unknown" }
};

const speakerPrefixPattern = /^\s*(doctor|clinician|nurse|patient|staff|unknown):\s*/i;
const unknownThenSpeakerPattern = /^\s*unknown:\s*(doctor|clinician|nurse|patient|staff):\s*/i;

export function parseTranscriptSpeakerLine(line: string) {
  const match = speakerPrefixPattern.exec(line);
  if (!match) {
    return {
      speaker: "unknown" as TranscriptSpeaker,
      displaySpeaker: "unknown",
      text: line.trim()
    };
  }

  const normalized = speakerLabels[match[1].toLowerCase()];
  return {
    speaker: normalized.speaker,
    displaySpeaker: normalized.display,
    text: line.slice(match[0].length).trim()
  };
}

export function parseAiScribeTranscript(rawTranscript: string) {
  const lines = rawTranscript.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sourceLines: string[] = [];
  const segments: RuntimeTranscriptSegment[] = [];
  let startMs = 0;

  for (const line of lines.length ? lines : [rawTranscript.trim()]) {
    const parsed = parseTranscriptSpeakerLine(line);
    const duration = Math.max(1000, parsed.text.length * 40);
    segments.push({
      speaker: parsed.speaker,
      display_speaker: parsed.displaySpeaker,
      start_ms: startMs,
      end_ms: startMs + duration,
      text: parsed.text,
      confidence: /unclear|inaudible|\[uncertain\]/i.test(parsed.text) ? 0.55 : 0.85,
      uncertain: /unclear|inaudible|\[uncertain\]/i.test(parsed.text)
    });
    sourceLines.push(`${parsed.displaySpeaker}: ${parsed.text}`);
    startMs += duration;
  }

  return {
    sourceTranscript: sourceLines.join("\n"),
    segments
  };
}

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
  segments: Array<{ start_ms: number; end_ms: number; text: string; speaker: string; display_speaker?: string }>
) {
  let cursor = 0;
  for (const segment of segments) {
    const rendered = `${segment.display_speaker ?? segment.speaker}: ${segment.text}`;
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

export function normalizeTranscriptLabels(content: string) {
  return content.split(/(\r?\n)/).map((part) => {
    if (/^\r?\n$/.test(part)) return part;
    const unknownThenSpeaker = unknownThenSpeakerPattern.exec(part);
    if (unknownThenSpeaker) {
      const label = speakerLabels[unknownThenSpeaker[1].toLowerCase()].display;
      return `${label}: ${part.slice(unknownThenSpeaker[0].length).trimStart()}`;
    }
    const speaker = speakerPrefixPattern.exec(part);
    if (speaker) {
      const label = speakerLabels[speaker[1].toLowerCase()].display;
      return `${label}: ${part.slice(speaker[0].length).trimStart()}`;
    }
    return part;
  }).join("");
}

export function transcriptSourceForDisplay(
  sourceTranscript: string,
  evidenceStart?: number | null,
  evidenceEnd?: number | null
) {
  const content = normalizeTranscriptLabels(sourceTranscript);
  if (evidenceStart === null || evidenceEnd === null || evidenceStart === undefined || evidenceEnd === undefined) {
    return { content, evidenceStart: null, evidenceEnd: null };
  }

  const rawEvidence = sourceTranscript.slice(evidenceStart, evidenceEnd);
  const displayEvidence = normalizeTranscriptLabels(rawEvidence);
  const displayStart = content.indexOf(displayEvidence);
  if (displayEvidence && displayStart >= 0) {
    return {
      content,
      evidenceStart: displayStart,
      evidenceEnd: displayStart + displayEvidence.length
    };
  }

  return { content, evidenceStart: null, evidenceEnd: null };
}
