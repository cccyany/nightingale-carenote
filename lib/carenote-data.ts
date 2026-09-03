import { createSupabaseActorClient } from "@/lib/supabase/request";
import { logSafeError } from "@/lib/safe-error";
import { isValidationNoiseText, presentableGlanceItems, validationNoiseSqlLikePatterns } from "./glance-presentation";
import { applyTimelineEntryFilter, type TimelineFilter } from "./timeline-filters";

type RelationObject = Record<string, unknown> | null;
export type DisplayProfile = { display_name: string } | null;
export type DisplayClinic = { name: string } | null;
export type CareNotePatient = {
  id: string;
  clinic_id: string;
  profile_id: string | null;
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
  provenance_spans?: Array<{
    id: string;
    char_start: number | null;
    char_end: number | null;
    evidence_text: string;
    transcript_start_ms: number | null;
    transcript_end_ms: number | null;
    transcript_segment_id: string | null;
    transcript_segments?: {
      text: string;
      raw_speaker_label: string | null;
      display_speaker: string | null;
      semantic_speaker_role: string | null;
      start_ms: number;
      end_ms: number;
    } | null;
    provenance_sources: {
      source_kind: string;
      source_label: string;
      source_content: string | null;
      source_session_identifier: string | null;
    } | null;
  }> | null;
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
    transcript_segment_id?: string | null;
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
  source_entry_id: string | null;
  source_version_id: string | null;
  provenance_span_id: string;
    provenance_spans: {
    entry_id: string | null;
    char_start: number | null;
    char_end: number | null;
    evidence_text: string;
    transcript_segment_id?: string | null;
  } | null;
};
export type FactConflict = {
  id: string;
  conflict_type: string;
  status: string;
  fact_a_id: string;
  fact_b_id: string;
  created_at: string;
  resolver_id: string | null;
  resolved_at: string | null;
  resolution_reason: string | null;
  resolution_outcome: string | null;
  resolution_entry_id: string | null;
  corrected_fact_id: string | null;
  profiles: DisplayProfile;
  conflict_resolution_sources?: Array<{
    id: string;
    fact_id: string;
    provenance_span_id: string;
    source_version_id: string | null;
  }> | null;
};
export type PatientFacingContent = {
  id: string;
  title: string;
  body: string;
  status: string;
  content_type: string;
  generation_method: string;
  source_count: number;
  provenance_span_id: string | null;
  approved_at: string | null;
  created_at: string;
  review_status: string;
  evidence_confidence: number;
  content_revision: number;
  approved_revision: number | null;
  patient_content_sources?: Array<{
    id: string;
    source_entry_id: string;
    source_version_id: string;
    provenance_span_id: string;
    source_label: string;
    source_occurred_at: string;
    provenance_spans?: {
      entry_id: string | null;
      char_start: number | null;
      char_end: number | null;
      evidence_text: string;
    } | null;
  }>;
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

function logSupabaseError(context: string, error: unknown) {
  const supabaseError = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  };
  logSafeError(context, "database_error", {
    code: supabaseError.code ?? null,
    message: supabaseError.message ?? String(error),
    details: supabaseError.details ?? null,
    hint: supabaseError.hint ?? null
  });
}

function throwSupabaseError(context: string, error: unknown): never {
  logSupabaseError(context, error);
  throw error;
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
  profiles:author_id(display_name),
  provenance_spans(id, char_start, char_end, evidence_text, transcript_start_ms, transcript_end_ms, transcript_segment_id, transcript_segments:transcript_segment_id(text, raw_speaker_label, display_speaker, semantic_speaker_role, start_ms, end_ms), provenance_sources:source_id(source_kind, source_label, source_content, source_session_identifier))
`;

async function careReadClient(actorToken?: string) {
  if (actorToken) return createSupabaseActorClient(actorToken);
  throw new Error("A role-authenticated actor token is required to read CareNote data.");
}

export async function getPatientCareNote(patientId: string, filter: TimelineFilter = "all", actorToken?: string): Promise<{
  patient: CareNotePatient;
  entries: CareNoteEntry[];
  comments: CareNoteComment[];
  tasks: CareNoteTask[];
  glanceItems: GlanceItem[];
  clinicalFacts: ClinicalFact[];
  factConflicts: FactConflict[];
  patientFacingContent: PatientFacingContent[];
}> {
  const supabase = await careReadClient(actorToken);
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, clinic_id, profile_id, display_name, date_of_birth, clinics(name)")
    .eq("id", patientId)
    .single();

  if (patientError) throwSupabaseError("getPatientCareNote.patient", patientError);

  let query = supabase
    .from("care_entries")
    .select(entrySelect)
    .eq("patient_id", patientId)
    .order("occurred_at", { ascending: false });

  query = applyTimelineEntryFilter(query, filter);
  for (const pattern of validationNoiseSqlLikePatterns) {
    query = query.not("content", "ilike", pattern);
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
      validationNoiseSqlLikePatterns.reduce(
        (taskQuery, pattern) => taskQuery.not("title", "ilike", pattern),
        supabase
        .from("tasks")
        .select("id, source_entry_id, title, assignee_id, status, due_date, created_at, profiles:assignee_id(display_name)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
      ),
      supabase
        .from("glance_items")
        .select("id, highlight_id, title, short_summary, status, risk, risk_reason, importance_score, importance_reasons, storage_class, ranking_explanation, provenance_span_id, available_action, confirmation_status, evidence_label, evidence_explanation, rule_key, provenance_spans:provenance_span_id(entry_id, char_start, char_end, evidence_text, transcript_segment_id, provenance_sources:source_id(source_label))")
        .eq("patient_id", patientId)
        .not("status", "in", "(rejected,resolved)")
        .order("importance_score", { ascending: false }),
      supabase
        .from("clinical_facts")
        .select("id, entity_type, normalized_entity, value, unit, assertion, authority_role, evidence_confidence, review_status, source_entry_id, source_version_id, provenance_span_id, provenance_spans:provenance_span_id(entry_id, char_start, char_end, evidence_text, transcript_segment_id)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("fact_conflicts")
        .select("id, conflict_type, status, fact_a_id, fact_b_id, created_at, resolver_id, resolved_at, resolution_reason, resolution_outcome, resolution_entry_id, corrected_fact_id, profiles:resolver_id(display_name), conflict_resolution_sources(id, fact_id, provenance_span_id, source_version_id)")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(8),
      validationNoiseSqlLikePatterns.reduce(
        (contentQuery, pattern) => contentQuery.not("title", "ilike", pattern).not("body", "ilike", pattern),
        supabase
        .from("patient_facing_content")
        .select("id, title, body, status, content_type, generation_method, source_count, provenance_span_id, approved_at, created_at, review_status, evidence_confidence, content_revision, approved_revision, patient_content_sources(id, source_entry_id, source_version_id, provenance_span_id, source_label, source_occurred_at, provenance_spans:provenance_span_id(entry_id, char_start, char_end, evidence_text))")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(8)
      )
    ]);

  if (entriesError) throwSupabaseError("getPatientCareNote.entries", entriesError);
  if (commentsError) throwSupabaseError("getPatientCareNote.comments", commentsError);
  if (tasksError) throwSupabaseError("getPatientCareNote.tasks", tasksError);
  if (glanceError) throwSupabaseError("getPatientCareNote.glanceItems", glanceError);
  if (factsError) throwSupabaseError("getPatientCareNote.clinicalFacts", factsError);
  if (conflictsError) throwSupabaseError("getPatientCareNote.factConflicts", conflictsError);
  if (patientContentError) throwSupabaseError("getPatientCareNote.patientFacingContent", patientContentError);

  const cleanEntries = (entries ?? []).filter((entry) => !isValidationNoiseText(String(entry.content ?? "")));
  const cleanTasks = (tasks ?? []).filter((task) => !/^Synthetic collaboration follow-up\b/i.test(String(task.title ?? "").trim()));
  const cleanGlanceItems = presentableGlanceItems((glanceItems ?? []) as unknown as GlanceItem[]);
  const cleanClinicalFacts = (clinicalFacts ?? []).filter((fact) => !isValidationNoiseText(JSON.stringify(fact)));
  const cleanFactIds = new Set(cleanClinicalFacts.map((fact) => fact.id));
  const cleanFactConflicts = (factConflicts ?? []).filter((conflict) => cleanFactIds.has(conflict.fact_a_id) && cleanFactIds.has(conflict.fact_b_id));
  const cleanPatientFacingContent = (patientFacingContent ?? [])
    .filter((item) => !isValidationNoiseText(`${item.title} ${item.body}`))
    .map((item) => ({
      ...item,
      patient_content_sources: item.patient_content_sources?.map((source) => ({
        ...source,
        provenance_spans: firstRelation(source.provenance_spans as RelationObject | RelationObject[] | undefined)
      }))
    }));

  return {
    patient: normalizeRelations(patient) as unknown as CareNotePatient,
    entries: cleanEntries.map((entry) => normalizeRelations(entry) as unknown as CareNoteEntry),
    comments: (comments ?? []).map((comment) => normalizeRelations(comment) as unknown as CareNoteComment),
    tasks: cleanTasks.map((task) => normalizeRelations(task) as unknown as CareNoteTask),
    glanceItems: cleanGlanceItems.map((item) => normalizeRelations(item) as unknown as GlanceItem),
    clinicalFacts: cleanClinicalFacts.map((fact) => normalizeRelations(fact) as unknown as ClinicalFact),
    factConflicts: cleanFactConflicts.map((conflict) => normalizeRelations(conflict) as unknown as FactConflict),
    patientFacingContent: cleanPatientFacingContent as unknown as PatientFacingContent[]
  };
}

export async function getEntryHistory(entryId: string, actorToken?: string): Promise<{
  entry: CareNoteEntry;
  versions: EntryVersion[];
}> {
  const supabase = await careReadClient(actorToken);
  const [{ data: entry, error: entryError }, { data: versions, error: versionsError }] = await Promise.all([
    supabase.from("care_entries").select(entrySelect).eq("id", entryId).single(),
    supabase
      .from("entry_versions")
      .select("id, entry_id, version_number, content, changed_by, changed_at, change_reason, reverted_from_version, profiles:changed_by(display_name)")
      .eq("entry_id", entryId)
      .order("version_number", { ascending: false })
  ]);

  if (entryError) throwSupabaseError("getEntryHistory.entry", entryError);
  if (versionsError) throwSupabaseError("getEntryHistory.versions", versionsError);

  return {
    entry: normalizeRelations(entry) as unknown as CareNoteEntry,
    versions: (versions ?? []).map((version) => normalizeRelations(version) as unknown as EntryVersion)
  };
}

export async function getClinicAssignableUsers(clinicId: string, actorToken?: string): Promise<AssignableUser[]> {
  const supabase = await careReadClient(actorToken);
  const { data, error } = await supabase
    .from("clinic_memberships")
    .select("profile_id, role, profiles:profile_id(display_name)")
    .eq("clinic_id", clinicId)
    .in("role", ["staff", "clinician", "admin"])
    .order("role", { ascending: true });

  if (error) throwSupabaseError("getClinicAssignableUsers.memberships", error);
  return (data ?? []).map((membership) => normalizeRelations(membership) as unknown as AssignableUser);
}
