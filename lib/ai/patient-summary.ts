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
    const parsed = JSON.parse(response.text) as { summary?: unknown; key_points?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((point): point is string => typeof point === "string" && Boolean(point.trim())).map((point) => point.trim())
      : [];
    if (!summary) return null;
    return { summary, keyPoints };
  } catch {
    return null;
  }
}

export function defaultPatientSummaryTitle(contentType: PatientContentType, sourceDates: string[]) {
  const label = patientContentTypeLabel(contentType);
  if (!sourceDates.length) return label;
  const uniqueDates = Array.from(new Set(sourceDates));
  return uniqueDates.length === 1 ? `${label} - ${uniqueDates[0]}` : `${label} - ${uniqueDates.length} care-record dates`;
}
