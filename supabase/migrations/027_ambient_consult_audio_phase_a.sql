alter table transcript_sessions add column if not exists status text not null default 'transcript_ready'
  check (status in ('uploaded', 'transcribing', 'transcript_ready', 'summarizing', 'completed', 'transcription_failed', 'summary_failed'));
alter table transcript_sessions add column if not exists provider text;
alter table transcript_sessions add column if not exists model text;
alter table transcript_sessions add column if not exists language_info jsonb not null default '{}'::jsonb;
alter table transcript_sessions add column if not exists audio_metadata jsonb not null default '{}'::jsonb;
alter table transcript_sessions add column if not exists error_code text;
alter table transcript_sessions add column if not exists summary_entry_id uuid references care_entries(id) on delete set null;
alter table transcript_sessions add column if not exists completed_at timestamptz;

alter table transcript_segments add column if not exists raw_speaker_label text;
alter table transcript_segments add column if not exists display_speaker text;
alter table transcript_segments add column if not exists semantic_speaker_role text
  check (semantic_speaker_role is null or semantic_speaker_role in ('patient', 'clinician', 'staff', 'unknown'));
alter table transcript_segments add column if not exists provider_metadata jsonb not null default '{}'::jsonb;
alter table transcript_segments add column if not exists segment_version integer not null default 1 check (segment_version > 0);

create index if not exists idx_transcript_sessions_status on transcript_sessions(patient_id, status, created_at desc);

create or replace function create_voice_capture_session(
  p_patient_id uuid,
  p_source_label text,
  p_provider text,
  p_model text,
  p_audio_metadata jsonb default '{}'::jsonb
) returns transcript_sessions language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  session transcript_sessions;
begin
  select * into target_patient from patients where id = p_patient_id;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_patient.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  insert into transcript_sessions (
    clinic_id, patient_id, source_label, captured_by, status, provider, model, audio_metadata
  )
  values (
    target_patient.clinic_id, target_patient.id, p_source_label, auth.uid(), 'transcribing', p_provider, p_model,
    coalesce(p_audio_metadata, '{}'::jsonb)
  )
  returning * into session;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_patient.clinic_id, auth.uid(), 'voice.session_created', 'transcript_session', session.id,
          jsonb_build_object(
            'provider', p_provider,
            'model', p_model,
            'has_audio_metadata', coalesce(p_audio_metadata, '{}'::jsonb) <> '{}'::jsonb
          ));

  return session;
end;
$$;

create or replace function complete_voice_transcription(
  p_session_id uuid,
  p_segments jsonb,
  p_language_info jsonb default '{}'::jsonb
) returns transcript_sessions language plpgsql security definer set search_path = public as $$
declare
  session transcript_sessions;
  segment jsonb;
begin
  select * into session from transcript_sessions where id = p_session_id for update;
  if not found then raise exception 'Transcript session not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(session.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if session.status not in ('transcribing', 'transcription_failed') then
    raise exception 'Transcript session is not transcribing' using errcode = '40901';
  end if;
  if jsonb_array_length(coalesce(p_segments, '[]'::jsonb)) = 0 then
    raise exception 'Transcript requires at least one segment' using errcode = '22023';
  end if;

  delete from transcript_segments where session_id = session.id;

  for segment in select * from jsonb_array_elements(p_segments) loop
    insert into transcript_segments (
      session_id, speaker, raw_speaker_label, display_speaker, semantic_speaker_role,
      start_ms, end_ms, text, confidence, uncertain, provider_metadata
    )
    values (
      session.id,
      coalesce(segment->>'speaker', 'unknown'),
      coalesce(segment->>'raw_speaker_label', segment->>'display_speaker', segment->>'speaker', 'unknown'),
      coalesce(segment->>'display_speaker', segment->>'speaker', 'unknown'),
      coalesce(segment->>'semantic_speaker_role', segment->>'speaker', 'unknown'),
      (segment->>'start_ms')::integer,
      (segment->>'end_ms')::integer,
      segment->>'text',
      coalesce((segment->>'confidence')::numeric, 0.50),
      coalesce((segment->>'uncertain')::boolean, true),
      coalesce(segment->'provider_metadata', '{}'::jsonb)
    );
  end loop;

  update transcript_sessions
  set status = 'transcript_ready',
      language_info = coalesce(p_language_info, '{}'::jsonb),
      error_code = null
  where id = session.id
  returning * into session;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (session.clinic_id, auth.uid(), 'voice.transcription_completed', 'transcript_session', session.id,
          jsonb_build_object('segment_count', jsonb_array_length(p_segments)));

  return session;
end;
$$;

create or replace function set_voice_session_status(
  p_session_id uuid,
  p_status text,
  p_error_code text default null,
  p_summary_entry_id uuid default null
) returns transcript_sessions language plpgsql security definer set search_path = public as $$
declare
  session transcript_sessions;
begin
  select * into session from transcript_sessions where id = p_session_id for update;
  if not found then raise exception 'Transcript session not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(session.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_status not in ('uploaded', 'transcribing', 'transcript_ready', 'summarizing', 'completed', 'transcription_failed', 'summary_failed') then
    raise exception 'Invalid transcript session status' using errcode = '22023';
  end if;

  update transcript_sessions
  set status = p_status,
      error_code = p_error_code,
      summary_entry_id = coalesce(p_summary_entry_id, summary_entry_id),
      completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = session.id
  returning * into session;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (session.clinic_id, auth.uid(), 'voice.session_status_changed', 'transcript_session', session.id,
          jsonb_build_object('status', p_status, 'error_code', p_error_code, 'summary_entry_present', p_summary_entry_id is not null));

  return session;
end;
$$;

create or replace function confirm_transcript_speaker_mapping(
  p_session_id uuid,
  p_mappings jsonb
) returns integer language plpgsql security definer set search_path = public as $$
declare
  session transcript_sessions;
  mapping jsonb;
  updated integer := 0;
begin
  select * into session from transcript_sessions where id = p_session_id;
  if not found then raise exception 'Transcript session not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(session.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  for mapping in select * from jsonb_array_elements(coalesce(p_mappings, '[]'::jsonb)) loop
    if mapping->>'semantic_speaker_role' not in ('patient', 'clinician', 'staff', 'unknown') then
      raise exception 'Invalid speaker role' using errcode = '22023';
    end if;
    update transcript_segments
    set semantic_speaker_role = mapping->>'semantic_speaker_role',
        display_speaker = case mapping->>'semantic_speaker_role'
          when 'patient' then 'Patient'
          when 'clinician' then 'Clinician'
          when 'staff' then 'Staff'
          else coalesce(display_speaker, raw_speaker_label, 'unknown')
        end
    where id = (mapping->>'segment_id')::uuid
      and session_id = p_session_id;
    get diagnostics updated = row_count;
  end loop;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (session.clinic_id, auth.uid(), 'voice.speaker_mapping_confirmed', 'transcript_session', session.id,
          jsonb_build_object('mapping_count', jsonb_array_length(coalesce(p_mappings, '[]'::jsonb))));

  return updated;
end;
$$;

create or replace function ingest_voice_ai_scribed_note(
  p_patient_id uuid,
  p_session_id uuid,
  p_entry_type entry_type,
  p_content text,
  p_source_label text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  session transcript_sessions;
  new_entry care_entries;
begin
  if p_entry_type not in ('ai_doctor_consult_summary','ai_nurse_consult_summary','ai_patient_session_summary') then
    raise exception 'Invalid AI entry type' using errcode = '22023';
  end if;
  select * into target_patient from patients where id = p_patient_id;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  select * into session from transcript_sessions where id = p_session_id for update;
  if not found then raise exception 'Transcript session not found' using errcode = 'P0002'; end if;
  if session.patient_id <> target_patient.id or session.clinic_id <> target_patient.clinic_id then
    raise exception 'Transcript session is outside patient scope' using errcode = '42501';
  end if;
  if not user_has_clinic_role(target_patient.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if session.summary_entry_id is not null then
    return session.summary_entry_id;
  end if;

  insert into care_entries (clinic_id, patient_id, author_role, author_id, entry_type, visibility, content, current_version, occurred_at)
  values (target_patient.clinic_id, target_patient.id, 'system', null, p_entry_type, 'ai_internal', p_content, 1, now())
  returning * into new_entry;

  insert into entry_versions (entry_id, version_number, content, changed_by, change_reason)
  values (new_entry.id, 1, p_content, auth.uid(), session.id::text);

  update transcript_sessions
  set summary_entry_id = new_entry.id
  where id = session.id;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_patient.clinic_id, auth.uid(), 'voice.ai_scribed_note_ingested', 'care_entry', new_entry.id,
          jsonb_build_object('entry_type', p_entry_type, 'session_id', session.id, 'source_label', p_source_label));

  return new_entry.id;
end;
$$;

create or replace function create_voice_provenance_for_transcript_span(
  p_entry_id uuid,
  p_session_id uuid,
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
  session transcript_sessions;
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
  select * into session from transcript_sessions where id = p_session_id;
  if not found then raise exception 'Transcript session not found' using errcode = 'P0002'; end if;
  if session.patient_id <> entry_record.patient_id or session.clinic_id <> entry_record.clinic_id then
    raise exception 'Transcript session is outside entry scope' using errcode = '42501';
  end if;
  if not user_has_clinic_role(entry_record.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
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
    and src.source_session_identifier = session.id::text
  order by ps.created_at asc
  limit 1;

  if span_id is not null then
    return span_id;
  end if;

  insert into provenance_sources (
    clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label, source_content, source_session_identifier
  )
  values (
    entry_record.clinic_id, entry_record.patient_id, null, null, 'transcript', p_source_label, p_source_content, session.id::text
  )
  returning id into source_id;

  insert into provenance_spans (
    source_id, entry_id, entry_version_id, char_start, char_end, transcript_start_ms, transcript_end_ms, evidence_text
  )
  values (
    source_id, entry_record.id, version_record.id, p_char_start, p_char_end, p_transcript_start_ms, p_transcript_end_ms, p_evidence_text
  )
  returning id into span_id;

  validation := validate_provenance_span(span_id);
  if not (validation->>'ok')::boolean then
    raise exception 'Transcript provenance did not validate: %', validation->>'reason' using errcode = '23514';
  end if;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (entry_record.clinic_id, auth.uid(), 'voice.provenance_attached', 'provenance_span', span_id,
          jsonb_build_object('source_kind', 'transcript', 'session_id', session.id, 'evidence_length', length(p_evidence_text)));

  return span_id;
end;
$$;

create or replace function create_voice_runtime_glance_candidate(
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
  if not user_has_clinic_role(target_patient.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
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
    target_patient.clinic_id, target_patient.id, p_provenance_span_id, p_title, p_summary,
    deterministic_risk_floor(p_rule_key, p_risk),
    p_rule_key || ': deterministic risk remains separate from importance.',
    p_status, 0.75, p_status::text,
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
    target_patient.clinic_id, target_patient.id, highlight_id, p_title, p_summary, p_status,
    deterministic_risk_floor(p_rule_key, p_risk), p_rule_key || ': deterministic risk remains separate from importance.',
    (components->>'score')::integer, components - 'score', p_provenance_span_id,
    'Review evidence', p_status, 'Supported',
    'Exact transcript source span resolved; requires human verification.',
    p_rule_key, p_feature_key, 'review', 'voice_consult',
    components->>'storage_class',
    array_to_string(array(select jsonb_array_elements_text(components->'explanations')), ' ')
  )
  returning * into item;

  return item;
end;
$$;

grant execute on function create_voice_capture_session(uuid, text, text, text, jsonb) to authenticated;
grant execute on function complete_voice_transcription(uuid, jsonb, jsonb) to authenticated;
grant execute on function set_voice_session_status(uuid, text, text, uuid) to authenticated;
grant execute on function confirm_transcript_speaker_mapping(uuid, jsonb) to authenticated;
grant execute on function ingest_voice_ai_scribed_note(uuid, uuid, entry_type, text, text) to authenticated;
grant execute on function create_voice_provenance_for_transcript_span(uuid, uuid, text, text, integer, integer, text, text, integer, integer) to authenticated;
grant execute on function create_voice_runtime_glance_candidate(uuid, uuid, text, text, text, text, risk_level, review_status) to authenticated;
