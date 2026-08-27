import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type TimelineFilter = "all" | "ai" | "clinician" | "staff" | "patient" | "system";
type RelationObject = Record<string, unknown> | null;
export type DisplayProfile = { display_name: string } | null;
export type DisplayClinic = { name: string } | null;
export type CareNotePatient = {
  id: string;
  clinic_id: string;
  display_name: string;
  date_of_birth: string;
  clinics: DisplayClinic;
};
export type CareNoteEntry = {
  id: string;
  clinic_id: string;
  patient_id: string;
  author_role: string;
  author_id: string | null;
  entry_type: string;
  visibility: string;
  content: string;
  current_version: number;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  profiles: DisplayProfile;
};
export type CareNoteComment = {
  id: string;
  entry_id: string;
  parent_comment_id: string | null;
  author_id: string;
  body: string;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  profiles: DisplayProfile;
};
export type CareNoteTask = {
  id: string;
  source_entry_id: string | null;
  title: string;
  assignee_id: string | null;
  status: string;
  due_date: string | null;
  created_at: string;
  profiles: DisplayProfile;
};
export type GlanceItem = {
  id: string;
  highlight_id: string | null;
  title: string;
  short_summary: string;
  status: string;
  risk: string;
  risk_reason: string;
  importance_score: number;
  importance_reasons: Record<string, number>;
  storage_class: string;
  ranking_explanation: string;
  provenance_span_id: string;
  available_action: string;
  confirmation_status: string;
  evidence_label: string;
  evidence_explanation: string;
  rule_key: string | null;
  provenance_spans: {
    entry_id: string | null;
    char_start: number | null;
    char_end: number | null;
    evidence_text: string;
    provenance_sources: { source_label: string } | null;
  } | null;
};
export type ClinicalFact = {
  id: string;
  entity_type: string;
  normalized_entity: string;
  value: string | null;
  unit: string | null;
  assertion: string;
  authority_role: string;
  evidence_confidence: number;
  review_status: string;
  provenance_span_id: string;
};
export type FactConflict = {
  id: string;
  conflict_type: string;
  status: string;
  fact_a_id: string;
  fact_b_id: string;
  created_at: string;
};
export type PatientFacingContent = {
  id: string;
  title: string;
  body: string;
  status: string;
  provenance_span_id: string | null;
  approved_at: string | null;
  created_at: string;
  review_status: string;
  evidence_confidence: number;
};
export type AssignableUser = {
  profile_id: string;
  role: string;
  profiles: DisplayProfile;
};
export type EntryVersion = {
  id: string;
  entry_id: string;
  version_number: number;
  content: string;
  changed_by: string | null;
  changed_at: string;
  change_reason: string | null;
  reverted_from_version: number | null;
  profiles: DisplayProfile;
};

function firstRelation<T extends RelationObject>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function normalizeRelations<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    clinics: firstRelation(row.clinics as RelationObject | RelationObject[] | undefined),
    profiles: firstRelation(row.profiles as RelationObject | RelationObject[] | undefined)
  };
}

const entrySelect = `
  id,
  clinic_id,
  patient_id,
  author_role,
  author_id,
  entry_type,
  visibility,
  content,
  current_version,
  occurred_at,
  created_at,
  updated_at,
  profiles:author_id(display_name)
`;

export function filterForRole(role: string): TimelineFilter {
  if (role === "ai") return "ai";
  if (role === "clinician") return "clinician";
  if (role === "staff") return "staff";
  if (role === "patient") return "patient";
  if (role === "system") return "system";
  return "all";
}

export async function getPatientCareNote(patientId: string, filter: TimelineFilter = "all"): Promise<{
  patient: CareNotePatient;
  entries: CareNoteEntry[];
  comments: CareNoteComment[];
  tasks: CareNoteTask[];
  glanceItems: GlanceItem[];
  clinicalFacts: ClinicalFact[];
  factConflicts: FactConflict[];
  patientFacingContent: PatientFacingContent[];
}> {
  const supabase = createSupabaseAdminClient();
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, clinic_id, display_name, date_of_birth, clinics(name)")
    .eq("id", patientId)
    .single();

  if (patientError) {
    throw patientError;
  }

  let query = supabase
    .from("care_entries")
    .select(entrySelect)
    .eq("patient_id", patientId)
    .order("occurred_at", { ascending: false });

  if (filter === "ai") {
    query = query.like("entry_type", "ai_%");
  } else if (filter !== "all") {
    query = query.eq("author_role", filter);
  }

  const [
    { data: entries, error: entriesError },
    { data: comments, error: commentsError },
    { data: tasks, error: tasksError },
    { data: glanceItems, error: glanceError },
    { data: clinicalFacts, error: factsError },
    { data: factConflicts, error: conflictsError },
    { data: patientFacingContent, error: patientContentError }
  ] =
    await Promise.all([
      query,
      supabase
        .from("comments")
        .select("id, entry_id, parent_comment_id, author_id, body, resolved_at, resolved_by, created_at, profiles:author_id(display_name), comment_mentions(mentioned_profile_id, profiles:mentioned_profile_id(display_name))")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: true }),
      supabase
        .from("tasks")
        .select("id, source_entry_id, title, assignee_id, status, due_date, created_at, profiles:assignee_id(display_name)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("glance_items")
        .select("id, highlight_id, title, short_summary, status, risk, risk_reason, importance_score, importance_reasons, storage_class, ranking_explanation, provenance_span_id, available_action, confirmation_status, evidence_label, evidence_explanation, rule_key, provenance_spans:provenance_span_id(entry_id, char_start, char_end, evidence_text, provenance_sources:source_id(source_label))")
        .eq("patient_id", patientId)
        .neq("status", "rejected")
        .order("importance_score", { ascending: false })
        .limit(5),
      supabase
        .from("clinical_facts")
        .select("id, entity_type, normalized_entity, value, unit, assertion, authority_role, evidence_confidence, review_status, provenance_span_id")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("fact_conflicts")
        .select("id, conflict_type, status, fact_a_id, fact_b_id, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("patient_facing_content")
        .select("id, title, body, status, provenance_span_id, approved_at, created_at, review_status, evidence_confidence")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(8)
    ]);

  if (entriesError) throw entriesError;
  if (commentsError) throw commentsError;
  if (tasksError) throw tasksError;
  if (glanceError) throw glanceError;
  if (factsError) throw factsError;
  if (conflictsError) throw conflictsError;
  if (patientContentError) throw patientContentError;

  return {
    patient: normalizeRelations(patient) as unknown as CareNotePatient,
    entries: (entries ?? []).map((entry) => normalizeRelations(entry) as unknown as CareNoteEntry),
    comments: (comments ?? []).map((comment) => normalizeRelations(comment) as unknown as CareNoteComment),
    tasks: (tasks ?? []).map((task) => normalizeRelations(task) as unknown as CareNoteTask),
    glanceItems: (glanceItems ?? []).map((item) => normalizeRelations(item) as unknown as GlanceItem),
    clinicalFacts: (clinicalFacts ?? []) as ClinicalFact[],
    factConflicts: (factConflicts ?? []) as FactConflict[],
    patientFacingContent: (patientFacingContent ?? []) as PatientFacingContent[]
  };
}

export async function getEntryHistory(entryId: string): Promise<{
  entry: CareNoteEntry;
  versions: EntryVersion[];
}> {
  const supabase = createSupabaseAdminClient();
  const [{ data: entry, error: entryError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase.from("care_entries").select(entrySelect).eq("id", entryId).single(),
    supabase
      .from("entry_versions")
      .select("id, entry_id, version_number, content, changed_by, changed_at, change_reason, reverted_from_version, profiles:changed_by(display_name)")
      .eq("entry_id", entryId)
      .order("version_number", { ascending: false })
  ]);

  if (entryError) throw entryError;
  if (versionsError) throw versionsError;

  return {
    entry: normalizeRelations(entry) as unknown as CareNoteEntry,
    versions: (versions ?? []).map((version) => normalizeRelations(version) as unknown as EntryVersion)
  };
}

export async function getClinicAssignableUsers(clinicId: string): Promise<AssignableUser[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("clinic_memberships")
    .select("profile_id, role, profiles:profile_id(display_name)")
    .eq("clinic_id", clinicId)
    .in("role", ["staff", "clinician", "admin"])
    .order("role", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((membership) => normalizeRelations(membership) as unknown as AssignableUser);
}
