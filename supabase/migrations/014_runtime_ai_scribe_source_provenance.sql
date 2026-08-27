alter table provenance_sources add column if not exists source_content text;
alter table provenance_sources add column if not exists source_session_identifier text;

create index if not exists idx_provenance_sources_session_identifier
  on provenance_sources(source_session_identifier)
  where source_session_identifier is not null;

create or replace function validate_provenance_span(p_span_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  span_record provenance_spans;
  source_record provenance_sources;
  entry_record care_entries;
  version_record entry_versions;
  source_content text;
begin
  select * into span_record from provenance_spans where id = p_span_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'required source span is missing');
  end if;

  select * into source_record from provenance_sources where id = span_record.source_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'provenance source is missing');
  end if;

  if source_record.source_kind = 'transcript' and source_record.source_content is not null then
    select * into entry_record from care_entries where id = span_record.entry_id;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'generated AI entry is missing');
    end if;
    if entry_record.patient_id <> source_record.patient_id or entry_record.clinic_id <> source_record.clinic_id then
      return jsonb_build_object('ok', false, 'reason', 'source transcript belongs outside entry scope');
    end if;
    if span_record.entry_version_id is not null then
      select * into version_record from entry_versions where id = span_record.entry_version_id;
      if not found then
        return jsonb_build_object('ok', false, 'reason', 'generated entry version is missing');
      end if;
      if version_record.entry_id <> entry_record.id then
        return jsonb_build_object('ok', false, 'reason', 'generated version does not belong to generated entry');
      end if;
    end if;
    source_content := source_record.source_content;
  else
    select * into entry_record from care_entries where id = coalesce(span_record.entry_id, source_record.source_entry_id);
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'source entry is missing');
    end if;

    select * into version_record from entry_versions where id = coalesce(span_record.entry_version_id, source_record.source_version_id);
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'source version is missing');
    end if;

    if version_record.entry_id <> entry_record.id then
      return jsonb_build_object('ok', false, 'reason', 'source version does not belong to source entry');
    end if;
    source_content := version_record.content;
  end if;

  if span_record.char_start is not null or span_record.char_end is not null then
    if span_record.char_start is null or span_record.char_end is null
       or span_record.char_start < 0
       or span_record.char_end < span_record.char_start
       or span_record.char_end > length(source_content) then
      return jsonb_build_object('ok', false, 'reason', 'evidence offsets are outside source bounds');
    end if;
    if substring(source_content from span_record.char_start + 1 for span_record.char_end - span_record.char_start) <> span_record.evidence_text then
      return jsonb_build_object('ok', false, 'reason', 'evidence text does not match source span');
    end if;
  end if;

  if span_record.transcript_start_ms is not null and span_record.transcript_end_ms is not null
     and span_record.transcript_end_ms < span_record.transcript_start_ms then
    return jsonb_build_object('ok', false, 'reason', 'transcript timestamps are invalid');
  end if;

  return jsonb_build_object(
    'ok', true,
    'span_id', span_record.id,
    'entry_id', entry_record.id,
    'version_id', version_record.id,
    'evidence_text', span_record.evidence_text,
    'char_start', span_record.char_start,
    'char_end', span_record.char_end,
    'source_label', source_record.source_label,
    'source_kind', source_record.source_kind,
    'source_session_identifier', source_record.source_session_identifier
  );
end;
$$;

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
