do $$ begin
  create type patient_content_status as enum ('draft', 'needs_clinician_approval', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

alter table fact_conflicts add column if not exists conflict_type text not null default 'clinical_conflict';
alter table clinical_facts add column if not exists source_entry_id uuid references care_entries(id) on delete set null;
alter table clinical_facts add column if not exists source_version_id uuid references entry_versions(id) on delete set null;
alter table clinical_facts add column if not exists extraction_method text not null default 'deterministic';
alter table clinical_facts add column if not exists review_status review_status not null default 'needs_review';

create table if not exists patient_facing_content (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  source_entry_id uuid references care_entries(id) on delete set null,
  provenance_span_id uuid references provenance_spans(id) on delete set null,
  title text not null,
  body text not null,
  status patient_content_status not null default 'needs_clinician_approval',
  created_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_content_scope_status on patient_facing_content(patient_id, status);
alter table patient_facing_content enable row level security;

drop policy if exists patient_content_clinic_select on patient_facing_content;
create policy patient_content_clinic_select on patient_facing_content for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
  or (status = 'approved' and patient_id = user_patient_id())
);

drop policy if exists patient_content_clinician_insert on patient_facing_content;
create policy patient_content_clinician_insert on patient_facing_content for insert with check (
  user_has_clinic_role(clinic_id, array['clinician'::app_role, 'admin'::app_role])
);

drop policy if exists patient_content_clinician_update on patient_facing_content;
create policy patient_content_clinician_update on patient_facing_content for update using (
  user_has_clinic_role(clinic_id, array['clinician'::app_role, 'admin'::app_role])
) with check (
  user_has_clinic_role(clinic_id, array['clinician'::app_role, 'admin'::app_role])
);

drop trigger if exists touch_patient_content on patient_facing_content;
create trigger touch_patient_content before update on patient_facing_content for each row execute function touch_updated_at();

create or replace function create_provenance_for_entry_span(
  p_entry_id uuid,
  p_evidence_text text,
  p_char_start integer,
  p_char_end integer,
  p_source_kind text default 'entry',
  p_source_label text default null,
  p_transcript_start_ms integer default null,
  p_transcript_end_ms integer default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  entry_record care_entries;
  version_record entry_versions;
  source_id uuid;
  span_id uuid;
  validation jsonb;
begin
  select * into entry_record from care_entries where id = p_entry_id;
  if not found then raise exception 'Entry not found' using errcode = 'P0002'; end if;

  select * into version_record from entry_versions where entry_id = p_entry_id and version_number = entry_record.current_version;
  if not found then raise exception 'Entry version not found' using errcode = 'P0002'; end if;

  insert into provenance_sources (clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label)
  values (entry_record.clinic_id, entry_record.patient_id, entry_record.id, version_record.id, p_source_kind, coalesce(p_source_label, entry_record.entry_type::text))
  returning id into source_id;

  insert into provenance_spans (source_id, entry_id, entry_version_id, char_start, char_end, transcript_start_ms, transcript_end_ms, evidence_text)
  values (source_id, entry_record.id, version_record.id, p_char_start, p_char_end, p_transcript_start_ms, p_transcript_end_ms, p_evidence_text)
  returning id into span_id;

  validation := validate_provenance_span(span_id);
  if not (validation->>'ok')::boolean then
    return span_id;
  end if;

  return span_id;
end;
$$;

create or replace function upsert_fact_from_span(
  p_entry_id uuid,
  p_entity_type fact_entity_type,
  p_normalized_entity text,
  p_value text,
  p_unit text,
  p_assertion assertion_value,
  p_provenance_span_id uuid,
  p_confidence numeric,
  p_review_status review_status default 'needs_review',
  p_extraction_method text default 'deterministic'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  entry_record care_entries;
  span_validation jsonb;
  fact_id uuid;
begin
  select * into entry_record from care_entries where id = p_entry_id;
  if not found then raise exception 'Entry not found' using errcode = 'P0002'; end if;

  span_validation := validate_provenance_span(p_provenance_span_id);
  insert into clinical_facts (
    clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion,
    authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id,
    extraction_method, review_status
  )
  values (
    entry_record.clinic_id, entry_record.patient_id, p_entity_type, lower(p_normalized_entity), p_value, p_unit, p_assertion,
    entry_record.author_role, p_provenance_span_id, p_confidence, entry_record.id,
    case when (span_validation->>'ok')::boolean then (span_validation->>'version_id')::uuid else null end,
    p_extraction_method,
    case when (span_validation->>'ok')::boolean and p_confidence >= 0.75 then p_review_status else 'needs_review'::review_status end
  )
  returning id into fact_id;
  return fact_id;
end;
$$;

create unique index if not exists idx_fact_conflict_pair_unique on fact_conflicts(least(fact_a_id, fact_b_id), greatest(fact_a_id, fact_b_id));

create or replace function detect_fact_conflicts_for_patient(p_patient_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  conflict_count integer := 0;
  conflict_id uuid;
  pair record;
  ctype text;
  highlight_id uuid;
begin
  for pair in
    select a.id as a_id, b.id as b_id, a.clinic_id, a.patient_id, a.entity_type, a.normalized_entity,
           a.value as a_value, b.value as b_value, a.assertion as a_assertion, b.assertion as b_assertion,
           b.provenance_span_id as b_span
    from clinical_facts a
    join clinical_facts b on a.patient_id = b.patient_id and a.id < b.id
    where a.patient_id = p_patient_id
      and a.entity_type = b.entity_type
      and a.normalized_entity = b.normalized_entity
      and (
        a.assertion <> b.assertion
        or (a.entity_type = 'dosage' and coalesce(a.value, '') <> coalesce(b.value, ''))
        or (a.entity_type = 'frequency' and coalesce(a.value, '') <> coalesce(b.value, ''))
      )
  loop
    ctype := case pair.entity_type
      when 'allergy' then 'ALLERGY_CONFLICT'
      when 'medication' then 'MEDICATION_CONFLICT'
      when 'dosage' then 'MEDICATION_DOSE_CONFLICT'
      when 'frequency' then 'MEDICATION_FREQUENCY_CONFLICT'
      else 'CLINICAL_CONFLICT'
    end;

    conflict_id := null;
    insert into fact_conflicts (clinic_id, patient_id, fact_a_id, fact_b_id, status, conflict_type)
    values (pair.clinic_id, pair.patient_id, pair.a_id, pair.b_id, 'unresolved', ctype)
    on conflict do nothing
    returning id into conflict_id;

    if conflict_id is null then
      continue;
    end if;

    insert into highlights (clinic_id, patient_id, provenance_span_id, title, summary, risk, risk_reason, review_status, evidence_confidence, state, confidence_explanation, rule_key)
    values (
      pair.clinic_id, pair.patient_id, pair.b_span,
      initcap(replace(lower(ctype), '_', ' ')),
      pair.normalized_entity || ' has conflicting documented evidence.',
      deterministic_risk_floor(ctype, 'low'),
      ctype || ' floor: deterministic clinical contradiction requires HIGH risk until reviewed.',
      'needs_review', 0.90, 'needs_review', 'Both conflicting facts retain resolvable provenance and require clinician review.', ctype
    )
    returning id into highlight_id;

    insert into glance_items (clinic_id, patient_id, highlight_id, title, short_summary, status, risk, risk_reason, importance_score, importance_reasons, provenance_span_id, available_action, confirmation_status, evidence_label, evidence_explanation, rule_key)
    select clinic_id, patient_id, id, title, summary, review_status, risk, risk_reason, 94,
           jsonb_build_object('risk_floor', 50, 'conflict', 30, 'review_needed', 14),
           provenance_span_id, 'Review conflict', review_status, 'Strong evidence', confidence_explanation, rule_key
    from highlights where id = highlight_id;
    conflict_count := conflict_count + 1;
  end loop;
  return conflict_count;
end;
$$;

create or replace function ingest_ai_scribed_note(
  p_patient_id uuid,
  p_entry_type entry_type,
  p_content text,
  p_source_label text,
  p_session_identifier text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  new_entry care_entries;
begin
  if p_entry_type not in ('ai_doctor_consult_summary','ai_nurse_consult_summary','ai_patient_session_summary') then
    raise exception 'Invalid AI entry type' using errcode = '22023';
  end if;
  select * into target_patient from patients where id = p_patient_id;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_patient.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  insert into care_entries (clinic_id, patient_id, author_role, author_id, entry_type, visibility, content, current_version, occurred_at)
  values (target_patient.clinic_id, target_patient.id, 'system', null, p_entry_type, 'ai_internal', p_content, 1, now())
  returning * into new_entry;
  insert into entry_versions (entry_id, version_number, content, changed_by, change_reason)
  values (new_entry.id, 1, p_content, auth.uid(), coalesce(p_session_identifier, p_source_label));
  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_patient.clinic_id, auth.uid(), 'ai_scribed_note.ingested', 'care_entry', new_entry.id,
          jsonb_build_object('entry_type', p_entry_type, 'source_label', p_source_label, 'session_identifier', p_session_identifier));
  return new_entry.id;
end;
$$;

create or replace function create_patient_facing_draft(
  p_patient_id uuid,
  p_source_entry_id uuid,
  p_provenance_span_id uuid,
  p_title text,
  p_body text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  validation jsonb;
  content_id uuid;
begin
  select * into target_patient from patients where id = p_patient_id;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_patient.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  validation := validate_provenance_span(p_provenance_span_id);
  if (validation->>'ok')::boolean and not exists (
    select 1 from care_entries
    where id = (validation->>'entry_id')::uuid
      and patient_id = target_patient.id
  ) then
    validation := jsonb_build_object('ok', false, 'reason', 'provenance belongs to a different patient');
  end if;
  insert into patient_facing_content (clinic_id, patient_id, source_entry_id, provenance_span_id, title, body, status, created_by)
  values (
    target_patient.clinic_id, target_patient.id, p_source_entry_id, p_provenance_span_id, p_title, p_body,
    case when (validation->>'ok')::boolean then 'needs_clinician_approval'::patient_content_status else 'draft'::patient_content_status end,
    auth.uid()
  ) returning id into content_id;
  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_patient.clinic_id, auth.uid(), 'patient_content.drafted', 'patient_facing_content', content_id,
          jsonb_build_object('status', case when (validation->>'ok')::boolean then 'needs_clinician_approval' else 'draft' end));
  return content_id;
end;
$$;

create or replace function set_patient_content_status(p_content_id uuid, p_status patient_content_status)
returns patient_facing_content language plpgsql security definer set search_path = public as $$
declare
  target_content patient_facing_content;
  validation jsonb;
begin
  select * into target_content from patient_facing_content where id = p_content_id;
  if not found then raise exception 'Content not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_content.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  validation := validate_provenance_span(target_content.provenance_span_id);
  if (validation->>'ok')::boolean and not exists (
    select 1 from care_entries
    where id = (validation->>'entry_id')::uuid
      and patient_id = target_content.patient_id
  ) then
    validation := jsonb_build_object('ok', false, 'reason', 'provenance belongs to a different patient');
  end if;
  if p_status = 'approved' and not (validation->>'ok')::boolean then
    raise exception 'Cannot approve content with unresolved provenance' using errcode = '23514';
  end if;
  update patient_facing_content
  set status = p_status,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      approved_at = case when p_status = 'approved' then now() else approved_at end
  where id = p_content_id returning * into target_content;
  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_content.clinic_id, auth.uid(), 'patient_content.status_changed', 'patient_facing_content', target_content.id,
          jsonb_build_object('status', p_status));
  return target_content;
end;
$$;
