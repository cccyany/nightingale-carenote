export type TimelineFilter = "all" | "ai" | "clinician" | "staff" | "patient" | "system";

export const AI_SCRIBE_ENTRY_TYPES = [
  "ai_doctor_consult_summary",
  "ai_nurse_consult_summary",
  "ai_patient_session_summary"
] as const;

export function filterForRole(role: string): TimelineFilter {
  if (role === "ai") return "ai";
  if (role === "clinician") return "clinician";
  if (role === "staff") return "staff";
  if (role === "patient") return "patient";
  if (role === "system") return "system";
  return "all";
}

type EntryFilterQuery<T> = {
  in(column: string, values: readonly string[]): T;
  eq(column: string, value: string): T;
};

export function applyTimelineEntryFilter<T extends EntryFilterQuery<T>>(query: T, filter: TimelineFilter): T {
  if (filter === "ai") {
    return query.in("entry_type", AI_SCRIBE_ENTRY_TYPES);
  }
  if (filter !== "all") {
    return query.eq("author_role", filter);
  }
  return query;
}
