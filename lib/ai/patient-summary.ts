import type { LlmProviderResponse } from "./provider.ts";

export const patientContentTypes = [
  "visit_summary",
  "follow_up_instructions",
  "medication_instructions",
  "care_plan_update",
  "general_update"
] as const;

export type PatientContentType = typeof patientContentTypes[number];

export function patientContentTypeLabel(value: string) {
  switch (value) {
    case "visit_summary":
      return "Visit summary";
    case "follow_up_instructions":
      return "Follow-up instructions";
    case "medication_instructions":
      return "Medication instructions";
    case "care_plan_update":
      return "Care plan update";
    default:
      return "General patient update";
  }
}

export function parsePatientSummaryResponse(response: LlmProviderResponse) {
  try {
    const parsed = JSON.parse(response.text) as { status?: unknown; summary?: unknown; key_points?: unknown; reason?: unknown };
    if (parsed.status === "no_relevant_content") {
      return {
        status: "no_relevant_content" as const,
        summary: "",
        keyPoints: [],
        reason: typeof parsed.reason === "string" ? parsed.reason : "No relevant source-supported content was found."
      };
    }
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((point): point is string => typeof point === "string" && Boolean(point.trim())).map((point) => point.trim())
      : [];
    if (!summary) return null;
    return { status: "generated" as const, summary, keyPoints };
  } catch {
    return null;
  }
}

function parseGeneratedSummaryText(value: string) {
  try {
    const parsed = JSON.parse(value) as { summary?: unknown; key_points?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((point): point is string => typeof point === "string" && Boolean(point.trim()))
      : [];
    if (summary) return summary;
    if (keyPoints.length) return keyPoints.join(" ");
  } catch {
    return "";
  }
  return "";
}

export function clinicalSourceTextForPatientSummary(entry: { author_role: string; content: string }) {
  if (entry.author_role !== "system") return entry.content;
  try {
    const parsed = JSON.parse(entry.content) as { generated?: unknown; summary?: unknown; key_points?: unknown };
    if (typeof parsed.generated === "string") {
      const generated = parseGeneratedSummaryText(parsed.generated);
      if (generated) return generated;
    }
    if (typeof parsed.summary === "string" && parsed.summary.trim()) return parsed.summary.trim();
    if (Array.isArray(parsed.key_points)) {
      const points = parsed.key_points.filter((point): point is string => typeof point === "string" && Boolean(point.trim()));
      if (points.length) return points.join(" ");
    }
  } catch {
    return entry.content;
  }
  return "";
}

export function patientSummarySourcePreview(entry: { author_role: string; content: string }, max = 130) {
  const text = clinicalSourceTextForPatientSummary(entry).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function canSavePatientFacingDraft(input: { title: string; body: string; sourceEntryIds: string[]; contentType: string }) {
  return Boolean(
    patientContentTypes.includes(input.contentType as PatientContentType)
    && input.title.trim()
    && input.body.trim()
    && input.sourceEntryIds.length
  );
}

export function serializePatientSummarySources(entries: Array<{
  entry_type: string;
  author_role: string;
  content: string;
  occurred_at: string;
  }>, dateFormatter: (value: string) => string) {
  return entries.map((entry, index) => [
    `Source ${index + 1}`,
    `Type: ${entry.author_role === "system" ? "AI Scribe" : entry.entry_type.replaceAll("_", " ")}`,
    `Date: ${dateFormatter(entry.occurred_at)}`,
    `Content: ${clinicalSourceTextForPatientSummary(entry)}`
  ].join("\n")).join("\n\n");
}

export function patientSummaryInstruction(contentType: PatientContentType) {
  switch (contentType) {
    case "follow_up_instructions":
      return "Output type: Follow-up instructions. Include only documented next steps such as follow-up appointments, monitoring instructions, repeat tests, referrals, return/review guidance, or explicitly documented actions. If no follow-up instruction exists, return JSON {\"status\":\"no_relevant_content\",\"reason\":\"No follow-up instructions were found in the selected sources.\"}.";
    case "medication_instructions":
      return "Output type: Medication instructions. Include only documented medication name, dose, frequency, start/stop/change, administration, or explicit medication advice. Do not turn symptoms, hydration advice, or tests into medication instructions. If no medication instruction exists, return JSON {\"status\":\"no_relevant_content\",\"reason\":\"No medication instructions were found in the selected sources.\"}.";
    case "care_plan_update":
      return "Output type: Care plan update. Include only documented plan changes, management changes, pending investigations, treatment adjustments, or unresolved planned actions. If there is no meaningful care-plan information, return JSON {\"status\":\"no_relevant_content\",\"reason\":\"No care-plan update was found in the selected sources.\"}.";
    case "general_update":
      return "Output type: General patient update. Provide a broader patient-friendly update, but remain source-grounded and do not invent information.";
    default:
      return "Output type: Visit summary. Summarize clinically relevant information from the selected sources in patient-friendly language. Include symptoms, findings, management, medications, follow-up plans, investigations, and important changes only when documented.";
  }
}

const medicationPattern = /\b(?:medication|medicine|tablet|capsule|dose|dosage|\d+(?:\.\d+)?\s*(?:mg|mcg|ml)\b|metformin|montelukast|amlodipine|atorvastatin|insulin|paracetamol|amoxicillin|penicillin|inhaler)\b/i;
const followUpPattern = /\b(?:follow[- ]?up|appointment|review|return|monitor|repeat|test|panel|renal panel|referral|refer|ordered|order|due|next visit|seek review)\b/i;
const carePlanPattern = /\b(?:plan|care plan|continue|monitor|management|manage|pending|repeat|test|panel|renal panel|investigation|referral|refer|treatment|adjustment|follow[- ]?up|review|order)\b/i;

export function patientSummaryRelevance(contentType: PatientContentType, entries: Array<{ author_role: string; content: string }>) {
  const sourceText = entries.map((entry) => clinicalSourceTextForPatientSummary(entry)).join("\n");
  if (contentType === "medication_instructions" && !medicationPattern.test(sourceText)) {
    return { ok: false as const, status: "no_relevant_content" as const, message: "No medication instructions were found in the selected care-record sources. Select different sources or choose another output type." };
  }
  if (contentType === "follow_up_instructions" && !followUpPattern.test(sourceText)) {
    return { ok: false as const, status: "no_relevant_content" as const, message: "No follow-up instructions were found in the selected care-record sources. Select different sources or choose another output type." };
  }
  if (contentType === "care_plan_update" && !carePlanPattern.test(sourceText)) {
    return { ok: false as const, status: "no_relevant_content" as const, message: "No care-plan update was found in the selected care-record sources. Select different sources or choose another output type." };
  }
  return { ok: true as const };
}

export function defaultPatientSummaryTitle(contentType: PatientContentType, sourceDates: string[]) {
  const label = patientContentTypeLabel(contentType);
  if (!sourceDates.length) return label;
  const uniqueDates = Array.from(new Set(sourceDates));
  return uniqueDates.length === 1 ? `${label} - ${uniqueDates[0]}` : `${label} - ${uniqueDates.length} care-record dates`;
}
