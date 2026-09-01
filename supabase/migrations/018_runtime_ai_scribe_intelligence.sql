create or replace function create_provenance_for_transcript_span(
  p_entry_id uuid,
  p_source_content text,
  p_evidence_text text,
  p_char_start integer,
  p_char_end integer,
  p_source_label text,
  p_session_identifier text default null,
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
  if entry_record.entry_type not in ('ai_doctor_consult_summary','ai_nurse_consult_summary','ai_patient_session_summary') then
    raise exception 'Transcript provenance can only be attached to AI-scribed entries' using errcode = '22023';
  end if;
  if not user_has_clinic_role(entry_record.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into version_record from entry_versions where entry_id = p_entry_id and version_number = entry_record.current_version;
  if not found then raise exception 'Entry version not found' using errcode = 'P0002'; end if;

  select ps.id into span_id
  from provenance_spans ps
  join provenance_sources src on src.id = ps.source_id
  where ps.entry_id = entry_record.id
    and ps.entry_version_id = version_record.id
    and ps.char_start = p_char_start
    and ps.char_end = p_char_end
    and ps.evidence_text = p_evidence_text
    and ps.transcript_start_ms is not distinct from p_transcript_start_ms
    and ps.transcript_end_ms is not distinct from p_transcript_end_ms
    and src.clinic_id = entry_record.clinic_id
    and src.patient_id = entry_record.patient_id
    and src.source_kind = 'transcript'
    and src.source_label = p_source_label
    and src.source_content = p_source_content
    and src.source_session_identifier is not distinct from p_session_identifier
  order by ps.created_at asc
  limit 1;

  if span_id is not null then
    return span_id;
  end if;

  insert into provenance_sources (
    clinic_id,
    patient_id,
    source_entry_id,
    source_version_id,
    source_kind,
    source_label,
    source_content,
    source_session_identifier
  )
  values (
    entry_record.clinic_id,
    entry_record.patient_id,
    null,
    null,
    'transcript',
    p_source_label,
    p_source_content,
    p_session_identifier
  )
  returning id into source_id;

  insert into provenance_spans (
    source_id,
    entry_id,
    entry_version_id,
    char_start,
    char_end,
    transcript_start_ms,
    transcript_end_ms,
    evidence_text
  )
  values (
    source_id,
    entry_record.id,
    version_record.id,
    p_char_start,
    p_char_end,
    p_transcript_start_ms,
    p_transcript_end_ms,
    p_evidence_text
  )
  returning id into span_id;

  validation := validate_provenance_span(span_id);
  if not (validation->>'ok')::boolean then
    raise exception 'Transcript provenance did not validate: %', validation->>'reason' using errcode = '23514';
  end if;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (entry_record.clinic_id, auth.uid(), 'ai_scribed_note.provenance_attached', 'provenance_span', span_id,
          jsonb_build_object(
            'source_kind', 'transcript',
            'source_label', p_source_label,
            'session_identifier_present', p_session_identifier is not null,
            'evidence_length', length(p_evidence_text)
          ));

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
  version_id uuid;
  fact_id uuid;
  effective_review_status review_status;
begin
  select * into entry_record from care_entries where id = p_entry_id;
  if not found then raise exception 'Entry not found' using errcode = 'P0002'; end if;

  span_validation := validate_provenance_span(p_provenance_span_id);
  version_id := case when (span_validation->>'ok')::boolean then (span_validation->>'version_id')::uuid else null end;
  effective_review_status := case
    when (span_validation->>'ok')::boolean and p_confidence >= 0.75 then p_review_status
    else 'needs_review'::review_status
  end;

  if version_id is not null then
    select id into fact_id
    from clinical_facts
    where source_entry_id = entry_record.id
      and source_version_id = version_id
      and entity_type = p_entity_type
      and normalized_entity = lower(p_normalized_entity)
      and value is not distinct from p_value
      and unit is not distinct from p_unit
      and assertion = p_assertion
      and extraction_method = p_extraction_method
    order by created_at asc
    limit 1;
    if fact_id is not null then
      return fact_id;
    end if;
  end if;

  insert into clinical_facts (
    clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion,
    authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id,
    extraction_method, review_status
  )
  values (
    entry_record.clinic_id, entry_record.patient_id, p_entity_type, lower(p_normalized_entity), p_value, p_unit, p_assertion,
    entry_record.author_role, p_provenance_span_id, p_confidence, entry_record.id,
    version_id,
    p_extraction_method,
    effective_review_status
  )
  returning id into fact_id;
  return fact_id;
end;
$$;

create or replace function create_runtime_glance_candidate(
  p_patient_id uuid,
  p_provenance_span_id uuid,
  p_title text,
  p_summary text,
  p_rule_key text,
  p_feature_key text,
  p_risk risk_level default 'medium',
  p_status review_status default 'needs_review'
) returns glance_items language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  validation jsonb;
  highlight_id uuid;
  item glance_items;
  components jsonb;
begin
  select * into target_patient from patients where id = p_patient_id;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_patient.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  validation := validate_provenance_span(p_provenance_span_id);
  if not (validation->>'ok')::boolean then
    raise exception 'Cannot create runtime candidate with invalid provenance' using errcode = '23514';
  end if;
  if not exists (
    select 1 from care_entries
    where id = (validation->>'entry_id')::uuid
      and patient_id = target_patient.id
      and clinic_id = target_patient.clinic_id
  ) then
    raise exception 'Candidate provenance belongs outside patient or clinic scope' using errcode = '42501';
  end if;

  select g.* into item
  from glance_items g
  where g.patient_id = target_patient.id
    and g.provenance_span_id = p_provenance_span_id
    and g.rule_key = p_rule_key
  order by g.created_at asc
  limit 1;
  if found then
    return item;
  end if;

  insert into highlights (clinic_id, patient_id, provenance_span_id, title, summary, risk, risk_reason, review_status, evidence_confidence, state, confidence_explanation, rule_key)
  values (
    target_patient.clinic_id,
    target_patient.id,
    p_provenance_span_id,
    p_title,
    p_summary,
    deterministic_risk_floor(p_rule_key, p_risk),
    p_rule_key || ': deterministic risk remains separate from importance.',
    p_status,
    0.75,
    p_status::text,
    'Exact transcript source span resolved; AI-derived item remains unverified until human review.',
    p_rule_key
  )
  returning id into highlight_id;

  components := calculate_importance_components(
    target_patient.clinic_id,
    p_rule_key,
    deterministic_risk_floor(p_rule_key, p_risk),
    p_status,
    p_status,
    p_feature_key,
    now()
  );

  insert into glance_items (
    clinic_id, patient_id, highlight_id, title, short_summary, status, risk, risk_reason,
    importance_score, importance_reasons, provenance_span_id, available_action,
    confirmation_status, evidence_label, evidence_explanation, rule_key, feature_key,
    action_type, source_type, storage_class, ranking_explanation
  )
  values (
    target_patient.clinic_id,
    target_patient.id,
    highlight_id,
    p_title,
    p_summary,
    p_status,
    deterministic_risk_floor(p_rule_key, p_risk),
    p_rule_key || ': deterministic risk remains separate from importance.',
    (components->>'score')::integer,
    components - 'score',
    p_provenance_span_id,
    'Review evidence',
    p_status,
    'Supported',
    'Exact transcript source span resolved; requires human verification.',
    p_rule_key,
    p_feature_key,
    'review',
    'ai_scribe',
    components->>'storage_class',
    array_to_string(array(select jsonb_array_elements_text(components->'explanations')), ' ')
  )
  returning * into item;

  return item;
end;
$$;

grant execute on function create_runtime_glance_candidate(uuid, uuid, text, text, text, text, risk_level, review_status) to authenticated;
