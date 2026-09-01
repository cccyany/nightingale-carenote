alter table patient_facing_content add column if not exists content_type text not null default 'visit_summary'
  check (content_type in ('visit_summary', 'follow_up_instructions', 'medication_instructions', 'care_plan_update', 'general_update'));
alter table patient_facing_content add column if not exists generation_method text not null default 'manual'
  check (generation_method in ('manual', 'ai_assisted'));
alter table patient_facing_content add column if not exists source_count integer not null default 1
  check (source_count >= 0);

create table if not exists patient_content_sources (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  patient_content_id uuid not null references patient_facing_content(id) on delete cascade,
  source_entry_id uuid not null references care_entries(id) on delete restrict,
  source_version_id uuid not null references entry_versions(id) on delete restrict,
  provenance_span_id uuid not null references provenance_spans(id) on delete restrict,
  source_label text not null,
  source_occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (patient_content_id, source_entry_id, source_version_id)
);

create index if not exists idx_patient_content_sources_content on patient_content_sources(patient_content_id);
create index if not exists idx_patient_content_sources_patient on patient_content_sources(patient_id, source_occurred_at desc);

alter table patient_content_sources enable row level security;

drop policy if exists patient_content_sources_clinic_select on patient_content_sources;
create policy patient_content_sources_clinic_select on patient_content_sources for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create or replace function create_patient_facing_draft_from_sources(
  p_patient_id uuid,
  p_source_entry_ids uuid[],
  p_content_type text,
  p_generation_method text,
  p_title text,
  p_body text
) returns patient_facing_content language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  source_id uuid;
  source_entry care_entries;
  source_version entry_versions;
  provenance_source_id uuid;
  span_id uuid;
  validation jsonb;
  content_record patient_facing_content;
  primary_entry_id uuid;
  primary_span_id uuid;
  selected_count integer := 0;
begin
  select * into target_patient from patients where id = p_patient_id;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_patient.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_content_type not in ('visit_summary', 'follow_up_instructions', 'medication_instructions', 'care_plan_update', 'general_update') then
    raise exception 'Invalid patient content type' using errcode = '22023';
  end if;
  if p_generation_method not in ('manual', 'ai_assisted') then
    raise exception 'Invalid generation method' using errcode = '22023';
  end if;
  if array_length(p_source_entry_ids, 1) is null or array_length(p_source_entry_ids, 1) < 1 then
    raise exception 'At least one source entry is required' using errcode = '23514';
  end if;

  insert into patient_facing_content (
    clinic_id,
    patient_id,
    title,
    body,
    status,
    review_status,
    evidence_confidence,
    created_by,
    content_type,
    generation_method,
    source_count
  )
  values (
    target_patient.clinic_id,
    target_patient.id,
    p_title,
    p_body,
    'needs_clinician_approval',
    'needs_review',
    case when p_generation_method = 'ai_assisted' then 0.75 else 0.90 end,
    auth.uid(),
    p_content_type,
    p_generation_method,
    cardinality(p_source_entry_ids)
  )
  returning * into content_record;

  foreach source_id in array p_source_entry_ids loop
    select * into source_entry
    from care_entries
    where id = source_id
      and patient_id = target_patient.id
      and clinic_id = target_patient.clinic_id;
    if not found then
      raise exception 'Selected source entry is not available for this patient' using errcode = '42501';
    end if;
    if source_entry.visibility = 'admin_only' then
      raise exception 'Selected source entry is not eligible for patient-facing drafting' using errcode = '42501';
    end if;
    if source_entry.entry_type = 'system_event' or source_entry.entry_type = 'admin_event' then
      raise exception 'Selected source entry is not eligible for patient-facing drafting' using errcode = '42501';
    end if;

    select * into source_version
    from entry_versions
    where entry_id = source_entry.id
      and version_number = source_entry.current_version;
    if not found then raise exception 'Selected source version is missing' using errcode = 'P0002'; end if;

    insert into provenance_sources (
      clinic_id,
      patient_id,
      source_entry_id,
      source_version_id,
      source_kind,
      source_label
    )
    values (
      source_entry.clinic_id,
      source_entry.patient_id,
      source_entry.id,
      source_version.id,
      'entry',
      source_entry.entry_type::text
    )
    returning id into provenance_source_id;

    insert into provenance_spans (
      source_id,
      entry_id,
      entry_version_id,
      char_start,
      char_end,
      evidence_text
    )
    values (
      provenance_source_id,
      source_entry.id,
      source_version.id,
      0,
      length(source_version.content),
      source_version.content
    )
    returning id into span_id;

    validation := validate_provenance_span(span_id);
    if not (validation->>'ok')::boolean then
      raise exception 'Selected source provenance did not validate' using errcode = '23514';
    end if;

    insert into patient_content_sources (
      clinic_id,
      patient_id,
      patient_content_id,
      source_entry_id,
      source_version_id,
      provenance_span_id,
      source_label,
      source_occurred_at
    )
    values (
      target_patient.clinic_id,
      target_patient.id,
      content_record.id,
      source_entry.id,
      source_version.id,
      span_id,
      source_entry.entry_type::text,
      source_entry.occurred_at
    );

    selected_count := selected_count + 1;
    if primary_span_id is null then
      primary_span_id := span_id;
      primary_entry_id := source_entry.id;
    end if;
  end loop;

  update patient_facing_content
  set source_entry_id = primary_entry_id,
      provenance_span_id = primary_span_id,
      source_count = selected_count
  where id = content_record.id
  returning * into content_record;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_patient.clinic_id, auth.uid(), 'patient_content.drafted_from_sources', 'patient_facing_content', content_record.id,
          jsonb_build_object(
            'status', content_record.status,
            'content_type', p_content_type,
            'generation_method', p_generation_method,
            'source_count', selected_count
          ));

  return content_record;
end;
$$;

grant execute on function create_patient_facing_draft_from_sources(uuid, uuid[], text, text, text, text) to authenticated;
