do $$ begin
  alter type conflict_status add value if not exists 'corrected';
exception when duplicate_object then null;
end $$;

alter table fact_conflicts add column if not exists resolution_outcome text
  check (resolution_outcome is null or resolution_outcome in ('accept_fact_a', 'accept_fact_b', 'corrected_value', 'unable_to_determine'));
alter table fact_conflicts add column if not exists resolution_entry_id uuid references care_entries(id) on delete set null;
alter table fact_conflicts add column if not exists corrected_fact_id uuid references clinical_facts(id) on delete set null;

create table if not exists conflict_resolution_sources (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  conflict_id uuid not null references fact_conflicts(id) on delete cascade,
  resolution_entry_id uuid not null references care_entries(id) on delete cascade,
  fact_id uuid not null references clinical_facts(id) on delete restrict,
  provenance_span_id uuid not null references provenance_spans(id) on delete restrict,
  source_version_id uuid references entry_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (conflict_id, resolution_entry_id, fact_id)
);

create index if not exists idx_conflict_resolution_sources_conflict on conflict_resolution_sources(conflict_id);
create index if not exists idx_conflict_resolution_sources_entry on conflict_resolution_sources(resolution_entry_id);

alter table conflict_resolution_sources enable row level security;

drop policy if exists conflict_resolution_sources_clinic_select on conflict_resolution_sources;
create policy conflict_resolution_sources_clinic_select on conflict_resolution_sources for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);
