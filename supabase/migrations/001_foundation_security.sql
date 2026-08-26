create extension if not exists pgcrypto;

create type app_role as enum ('patient', 'staff', 'clinician', 'admin', 'system');
create type entry_type as enum (
  'patient_note',
  'staff_note',
  'clinician_note',
  'ai_doctor_consult_summary',
  'ai_nurse_consult_summary',
  'ai_patient_session_summary',
  'instruction',
  'admin_event',
  'system_event'
);
create type entry_visibility as enum (
  'patient_approved',
  'patient_submitted',
  'staff_internal',
  'clinician_internal',
  'clinic_internal',
  'ai_internal',
  'admin_only'
);
create type task_status as enum ('open', 'in_progress', 'blocked', 'completed', 'cancelled');
create type risk_level as enum ('low', 'medium', 'high', 'critical');
create type review_status as enum ('needs_review', 'confirmed', 'rejected', 'resolved');
create type fact_entity_type as enum ('allergy', 'medication', 'dosage', 'frequency');
create type assertion_value as enum ('present', 'absent', 'unknown');
create type conflict_status as enum ('unresolved', 'accepted_fact_a', 'accepted_fact_b', 'needs_further_review');
create type feedback_type as enum ('exposure', 'manual_highlight', 'pin', 'clinician_confirmation', 'comment', 'rejection');

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  primary_role app_role not null check (primary_role <> 'system'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clinic_memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role app_role not null check (role in ('patient', 'staff', 'clinician', 'admin')),
  created_at timestamptz not null default now(),
  unique (clinic_id, profile_id, role)
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  display_name text not null,
  date_of_birth date not null,
  synthetic boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table care_entries (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  author_role app_role not null,
  author_id uuid references profiles(id) on delete set null,
  entry_type entry_type not null,
  visibility entry_visibility not null,
  content text not null,
  current_version integer not null default 1 check (current_version > 0),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((author_role = 'system' and author_id is null) or (author_role <> 'system' and author_id is not null)),
  check (
    (entry_type in ('ai_doctor_consult_summary', 'ai_nurse_consult_summary', 'ai_patient_session_summary') and author_role = 'system')
    or entry_type not in ('ai_doctor_consult_summary', 'ai_nurse_consult_summary', 'ai_patient_session_summary')
  )
);

create table entry_versions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references care_entries(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content text not null,
  changed_by uuid references profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  change_reason text,
  reverted_from_version integer,
  unique (entry_id, version_number)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  entry_id uuid not null references care_entries(id) on delete cascade,
  parent_comment_id uuid references comments(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  visibility text not null check (visibility in ('internal', 'patient_visible')),
  body text not null,
  resolved_at timestamptz,
  resolved_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id) on delete cascade,
  mentioned_profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, mentioned_profile_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  source_entry_id uuid references care_entries(id) on delete set null,
  title text not null,
  assignee_id uuid references profiles(id) on delete set null,
  created_by uuid not null references profiles(id) on delete restrict,
  status task_status not null default 'open',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table provenance_sources (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  source_entry_id uuid references care_entries(id) on delete cascade,
  source_version_id uuid references entry_versions(id) on delete cascade,
  source_kind text not null check (source_kind in ('entry', 'transcript', 'document', 'session')),
  source_label text not null,
  created_at timestamptz not null default now()
);

create table provenance_spans (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references provenance_sources(id) on delete cascade,
  entry_id uuid references care_entries(id) on delete cascade,
  entry_version_id uuid references entry_versions(id) on delete cascade,
  char_start integer check (char_start is null or char_start >= 0),
  char_end integer check (char_end is null or char_end >= 0),
  transcript_start_ms integer check (transcript_start_ms is null or transcript_start_ms >= 0),
  transcript_end_ms integer check (transcript_end_ms is null or transcript_end_ms >= 0),
  evidence_text text not null,
  created_at timestamptz not null default now(),
  check (char_end is null or char_start is null or char_end >= char_start),
  check (transcript_end_ms is null or transcript_start_ms is null or transcript_end_ms >= transcript_start_ms)
);

create table highlights (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  provenance_span_id uuid not null references provenance_spans(id) on delete restrict,
  title text not null,
  summary text not null,
  risk risk_level not null,
  risk_reason text not null,
  review_status review_status not null default 'needs_review',
  evidence_confidence numeric(4,2) not null check (evidence_confidence >= 0 and evidence_confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clinical_facts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  entity_type fact_entity_type not null,
  normalized_entity text not null,
  value text,
  unit text,
  assertion assertion_value not null,
  authority_role app_role not null,
  provenance_span_id uuid not null references provenance_spans(id) on delete restrict,
  evidence_confidence numeric(4,2) not null check (evidence_confidence >= 0 and evidence_confidence <= 1),
  superseded_by uuid references clinical_facts(id) on delete set null,
  created_at timestamptz not null default now()
);

create table fact_conflicts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  fact_a_id uuid not null references clinical_facts(id) on delete cascade,
  fact_b_id uuid not null references clinical_facts(id) on delete cascade,
  status conflict_status not null default 'unresolved',
  resolver_id uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  check (fact_a_id <> fact_b_id)
);

create table importance_feedback (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  highlight_id uuid references highlights(id) on delete cascade,
  feature_key text not null,
  feedback_type feedback_type not null,
  actor_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table glance_items (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  highlight_id uuid references highlights(id) on delete cascade,
  title text not null,
  short_summary text not null,
  status review_status not null,
  risk risk_level not null,
  risk_reason text not null,
  importance_score integer not null,
  importance_reasons jsonb not null default '{}'::jsonb,
  provenance_span_id uuid not null references provenance_spans(id) on delete restrict,
  available_action text not null,
  confirmation_status review_status not null default 'needs_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references clinics(id) on delete set null,
  actor_id uuid references profiles(id) on delete set null,
  action_type text not null,
  resource_type text not null,
  resource_id uuid,
  previous_version integer,
  new_version integer,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (metadata::text !~* '(penicillin|renal panel|cough|allerg|known drug)')
);

create index idx_memberships_profile on clinic_memberships(profile_id, clinic_id, role);
create index idx_patients_clinic on patients(clinic_id);
create index idx_entries_patient_time on care_entries(patient_id, occurred_at desc);
create index idx_entries_clinic_patient_visibility on care_entries(clinic_id, patient_id, visibility);
create index idx_versions_entry_version on entry_versions(entry_id, version_number desc);
create index idx_comments_patient_entry on comments(patient_id, entry_id);
create index idx_tasks_patient_status on tasks(patient_id, status);
create index idx_provenance_sources_patient on provenance_sources(patient_id);
create index idx_provenance_spans_entry_version on provenance_spans(entry_id, entry_version_id);
create index idx_highlights_patient_status on highlights(patient_id, review_status, risk);
create index idx_facts_patient_entity on clinical_facts(patient_id, entity_type, normalized_entity);
create index idx_conflicts_patient_status on fact_conflicts(patient_id, status);
create index idx_feedback_clinic_feature on importance_feedback(clinic_id, feature_key, feedback_type);
create index idx_glance_patient_score on glance_items(patient_id, importance_score desc);
create index idx_audit_resource on audit_events(resource_type, resource_id);

create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_clinics before update on clinics for each row execute function touch_updated_at();
create trigger touch_profiles before update on profiles for each row execute function touch_updated_at();
create trigger touch_patients before update on patients for each row execute function touch_updated_at();
create trigger touch_entries before update on care_entries for each row execute function touch_updated_at();
create trigger touch_comments before update on comments for each row execute function touch_updated_at();
create trigger touch_tasks before update on tasks for each row execute function touch_updated_at();
create trigger touch_highlights before update on highlights for each row execute function touch_updated_at();
create trigger touch_glance before update on glance_items for each row execute function touch_updated_at();

create function user_has_clinic_role(target_clinic uuid, allowed_roles app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from clinic_memberships
    where clinic_id = target_clinic
      and profile_id = auth.uid()
      and role = any(allowed_roles)
  );
$$;

create function user_patient_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.id
  from patients p
  where p.profile_id = auth.uid()
  limit 1;
$$;

create function can_read_patient_content(target_clinic uuid, target_patient uuid, target_visibility entry_visibility, target_type entry_type)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (
      user_has_clinic_role(target_clinic, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
      and target_visibility <> 'admin_only'
    )
    or (
      target_patient = user_patient_id()
      and target_visibility in ('patient_approved', 'patient_submitted')
      and target_type not in ('ai_doctor_consult_summary', 'ai_nurse_consult_summary', 'ai_patient_session_summary')
    );
$$;

alter table clinics enable row level security;
alter table profiles enable row level security;
alter table clinic_memberships enable row level security;
alter table patients enable row level security;
alter table care_entries enable row level security;
alter table entry_versions enable row level security;
alter table comments enable row level security;
alter table comment_mentions enable row level security;
alter table tasks enable row level security;
alter table provenance_sources enable row level security;
alter table provenance_spans enable row level security;
alter table highlights enable row level security;
alter table clinical_facts enable row level security;
alter table fact_conflicts enable row level security;
alter table importance_feedback enable row level security;
alter table glance_items enable row level security;
alter table audit_events enable row level security;

create policy clinics_member_select on clinics for select using (
  user_has_clinic_role(id, array['patient'::app_role, 'staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy profiles_self_or_clinic_select on profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from clinic_memberships mine
    join clinic_memberships theirs on theirs.clinic_id = mine.clinic_id
    where mine.profile_id = auth.uid()
      and theirs.profile_id = profiles.id
  )
);

create policy memberships_same_clinic_select on clinic_memberships for select using (
  profile_id = auth.uid()
  or user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy patients_scoped_select on patients for select using (
  profile_id = auth.uid()
  or user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy entries_scoped_select on care_entries for select using (
  can_read_patient_content(clinic_id, patient_id, visibility, entry_type)
);

create policy entries_staff_insert on care_entries for insert with check (
  author_id = auth.uid()
  and author_role = 'staff'
  and user_has_clinic_role(clinic_id, array['staff'::app_role])
);

create policy entries_clinician_insert on care_entries for insert with check (
  author_id = auth.uid()
  and author_role = 'clinician'
  and user_has_clinic_role(clinic_id, array['clinician'::app_role])
);

create policy entries_admin_insert on care_entries for insert with check (
  author_id = auth.uid()
  and author_role = 'admin'
  and user_has_clinic_role(clinic_id, array['admin'::app_role])
);

create policy entries_role_owner_update on care_entries for update using (
  (author_role = 'staff' and author_id = auth.uid() and user_has_clinic_role(clinic_id, array['staff'::app_role]))
  or (author_role = 'clinician' and author_id = auth.uid() and user_has_clinic_role(clinic_id, array['clinician'::app_role]))
  or user_has_clinic_role(clinic_id, array['admin'::app_role])
) with check (
  (author_role = 'staff' and author_id = auth.uid() and user_has_clinic_role(clinic_id, array['staff'::app_role]))
  or (author_role = 'clinician' and author_id = auth.uid() and user_has_clinic_role(clinic_id, array['clinician'::app_role]))
  or user_has_clinic_role(clinic_id, array['admin'::app_role])
);

create policy versions_scoped_select on entry_versions for select using (
  exists (
    select 1 from care_entries e
    where e.id = entry_versions.entry_id
      and can_read_patient_content(e.clinic_id, e.patient_id, e.visibility, e.entry_type)
  )
);

create policy comments_scoped_select on comments for select using (
  (
    visibility = 'patient_visible'
    and patient_id = user_patient_id()
  )
  or user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy comments_staff_clinician_insert on comments for insert with check (
  author_id = auth.uid()
  and user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy tasks_clinic_staff_select on tasks for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy provenance_clinic_staff_select on provenance_sources for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy spans_via_source_select on provenance_spans for select using (
  exists (
    select 1 from provenance_sources s
    where s.id = provenance_spans.source_id
      and user_has_clinic_role(s.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
  )
);

create policy highlights_clinic_staff_select on highlights for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy facts_clinic_clinical_select on clinical_facts for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy conflicts_clinic_clinical_select on fact_conflicts for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy feedback_clinic_clinical_select on importance_feedback for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy glance_clinic_clinical_select on glance_items for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy audit_admin_select on audit_events for select using (
  user_has_clinic_role(clinic_id, array['admin'::app_role])
);

create policy mentions_clinic_select on comment_mentions for select using (
  exists (
    select 1 from comments c
    where c.id = comment_mentions.comment_id
      and user_has_clinic_role(c.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
  )
);
