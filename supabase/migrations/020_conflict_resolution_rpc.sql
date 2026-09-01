create or replace function resolve_fact_conflict(
  p_conflict_id uuid,
  p_outcome text,
  p_rationale text,
  p_expected_status conflict_status default 'unresolved',
  p_corrected_entity_type fact_entity_type default null,
  p_corrected_normalized_entity text default null,
  p_corrected_value text default null,
  p_corrected_unit text default null,
  p_corrected_assertion assertion_value default 'present'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_conflict fact_conflicts;
  actor_role app_role;
  fact_a clinical_facts;
  fact_b clinical_facts;
  accepted_fact clinical_facts;
  next_status conflict_status;
  decision_entry care_entries;
  decision_version entry_versions;
  decision_text text;
  corrected_span_id uuid;
  corrected_fact uuid;
  corrected_evidence text;
  corrected_start integer;
begin
  if p_outcome not in ('accept_fact_a', 'accept_fact_b', 'corrected_value', 'unable_to_determine') then
    return jsonb_build_object('status', 'invalid', 'message', 'Invalid conflict resolution outcome');
  end if;

  select * into target_conflict from fact_conflicts where id = p_conflict_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if target_conflict.status <> p_expected_status then
    return jsonb_build_object(
      'status', 'conflict',
      'current_status', target_conflict.status,
      'expected_status', p_expected_status
    );
  end if;

  if target_conflict.status not in ('unresolved'::conflict_status, 'needs_further_review'::conflict_status) then
    return jsonb_build_object('status', 'conflict', 'current_status', target_conflict.status);
  end if;

  actor_role := current_profile_role();
  if actor_role not in ('clinician', 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not user_has_clinic_role(target_conflict.clinic_id, array[actor_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  select * into fact_a from clinical_facts where id = target_conflict.fact_a_id;
  select * into fact_b from clinical_facts where id = target_conflict.fact_b_id;
  if fact_a.id is null or fact_b.id is null then
    return jsonb_build_object('status', 'not_found', 'message', 'Conflict source fact is missing');
  end if;

  if p_outcome = 'unable_to_determine' then
    update fact_conflicts
    set status = 'needs_further_review',
        resolution_outcome = 'unable_to_determine',
        resolver_id = auth.uid(),
        resolution_reason = nullif(p_rationale, '')
    where id = p_conflict_id
    returning * into target_conflict;

    update glance_items g
    set status = 'needs_review',
        confirmation_status = 'needs_review',
        available_action = 'Resolve conflict'
    from highlights h
    where g.highlight_id = h.id
      and h.rule_key = target_conflict.conflict_type
      and h.patient_id = target_conflict.patient_id
      and h.provenance_span_id in (fact_a.provenance_span_id, fact_b.provenance_span_id);

    insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
    values (target_conflict.clinic_id, auth.uid(), 'fact_conflict.reviewed_unresolved', 'fact_conflict', target_conflict.id,
            jsonb_build_object(
              'previous_status', p_expected_status,
              'new_status', target_conflict.status,
              'outcome', p_outcome,
              'rationale_present', nullif(p_rationale, '') is not null
            ));

    return jsonb_build_object('status', 'ok', 'conflict_id', target_conflict.id, 'conflict_status', target_conflict.status);
  end if;

  accepted_fact := case when p_outcome = 'accept_fact_b' then fact_b else fact_a end;
  next_status := case
    when p_outcome = 'accept_fact_a' then 'accepted_fact_a'::conflict_status
    when p_outcome = 'accept_fact_b' then 'accepted_fact_b'::conflict_status
    else 'corrected'::conflict_status
  end;

  decision_text := concat_ws(E'\n',
    initcap(replace(lower(target_conflict.conflict_type), '_', ' ')) || ' resolution',
    case
      when p_outcome = 'accept_fact_a' then 'Earlier reviewed evidence was selected as current/correct.'
      when p_outcome = 'accept_fact_b' then 'Later reviewed evidence was selected as current/correct.'
      else 'Neither reviewed value was selected; corrected information was recorded.'
    end,
    case
      when p_outcome = 'corrected_value' then 'Corrected value: ' || coalesce(p_corrected_normalized_entity, 'unspecified') || coalesce(' ' || p_corrected_value, '') || coalesce(' ' || p_corrected_unit, '')
      else 'Selected fact: ' || accepted_fact.entity_type::text || ' ' || accepted_fact.normalized_entity || coalesce(' ' || accepted_fact.value, '') || coalesce(' ' || accepted_fact.unit, '') || ' ' || accepted_fact.assertion::text
    end,
    'Rationale: ' || nullif(p_rationale, ''),
    'Reviewed both original source facts; historical evidence was preserved.'
  );

  insert into care_entries (
    clinic_id, patient_id, author_role, author_id, entry_type, visibility, content, current_version, occurred_at
  )
  values (
    target_conflict.clinic_id, target_conflict.patient_id, actor_role, auth.uid(),
    'clinician_note', 'clinician_internal', decision_text, 1, now()
  )
  returning * into decision_entry;

  insert into entry_versions (entry_id, version_number, content, changed_by, change_reason)
  values (decision_entry.id, 1, decision_text, auth.uid(), 'conflict resolution')
  returning * into decision_version;

  insert into conflict_resolution_sources (
    clinic_id, patient_id, conflict_id, resolution_entry_id, fact_id, provenance_span_id, source_version_id
  )
  values
    (target_conflict.clinic_id, target_conflict.patient_id, target_conflict.id, decision_entry.id, fact_a.id, fact_a.provenance_span_id, fact_a.source_version_id),
    (target_conflict.clinic_id, target_conflict.patient_id, target_conflict.id, decision_entry.id, fact_b.id, fact_b.provenance_span_id, fact_b.source_version_id)
  on conflict do nothing;

  if p_outcome = 'corrected_value' then
    if p_corrected_entity_type is null or nullif(p_corrected_normalized_entity, '') is null then
      raise exception 'Corrected resolution requires corrected entity fields' using errcode = '23514';
    end if;

    corrected_evidence := coalesce(p_corrected_normalized_entity, '') || coalesce(' ' || p_corrected_value, '') || coalesce(' ' || p_corrected_unit, '');
    corrected_start := greatest(0, position(corrected_evidence in decision_text) - 1);
    if corrected_start = 0 and substring(decision_text from 1 for length(corrected_evidence)) <> corrected_evidence then
      raise exception 'Corrected evidence could not be located in resolution entry' using errcode = '23514';
    end if;

    corrected_span_id := create_provenance_for_entry_span(
      decision_entry.id,
      corrected_evidence,
      corrected_start,
      corrected_start + length(corrected_evidence),
      'entry',
      'conflict resolution decision'
    );

    corrected_fact := upsert_fact_from_span(
      decision_entry.id,
      p_corrected_entity_type,
      p_corrected_normalized_entity,
      p_corrected_value,
      p_corrected_unit,
      p_corrected_assertion,
      corrected_span_id,
      1.00,
      'confirmed',
      'clinician_conflict_resolution'
    );

    update clinical_facts
    set superseded_by = corrected_fact
    where id in (fact_a.id, fact_b.id);
  end if;

  update fact_conflicts
  set status = next_status,
      resolver_id = auth.uid(),
      resolved_at = now(),
      resolution_reason = nullif(p_rationale, ''),
      resolution_outcome = p_outcome,
      resolution_entry_id = decision_entry.id,
      corrected_fact_id = corrected_fact
  where id = p_conflict_id
  returning * into target_conflict;

  update glance_items g
  set status = 'resolved',
      confirmation_status = 'resolved',
      available_action = 'Conflict resolved'
  from highlights h
  where g.highlight_id = h.id
    and h.rule_key = target_conflict.conflict_type
    and h.patient_id = target_conflict.patient_id
    and h.provenance_span_id in (fact_a.provenance_span_id, fact_b.provenance_span_id);

  update highlights h
  set review_status = 'resolved',
      state = 'confirmed',
      confidence_explanation = 'Conflict reviewed by clinician/admin; original evidence remains preserved.'
  where h.rule_key = target_conflict.conflict_type
    and h.patient_id = target_conflict.patient_id
    and h.provenance_span_id in (fact_a.provenance_span_id, fact_b.provenance_span_id);

  perform rerank_patient_glance(target_conflict.patient_id);

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_conflict.clinic_id, auth.uid(), 'fact_conflict.resolved', 'fact_conflict', target_conflict.id,
          jsonb_build_object(
            'previous_status', p_expected_status,
            'new_status', target_conflict.status,
            'outcome', p_outcome,
            'resolution_entry_id', decision_entry.id,
            'corrected_fact_created', corrected_fact is not null,
            'rationale_present', nullif(p_rationale, '') is not null
          ));

  return jsonb_build_object(
    'status', 'ok',
    'conflict_id', target_conflict.id,
    'conflict_status', target_conflict.status,
    'resolution_entry_id', decision_entry.id,
    'corrected_fact_id', corrected_fact
  );
end;
$$;

grant execute on function resolve_fact_conflict(uuid, text, text, conflict_status, fact_entity_type, text, text, text, assertion_value) to authenticated;

drop function if exists read_patient_glance(uuid);

create function read_patient_glance(p_patient_id uuid)
returns table (
  id uuid,
  highlight_id uuid,
  title text,
  short_summary text,
  status review_status,
  risk risk_level,
  risk_reason text,
  importance_score integer,
  importance_reasons jsonb,
  storage_class text,
  ranking_explanation text,
  provenance_span_id uuid,
  available_action text,
  confirmation_status review_status,
  evidence_label text,
  evidence_explanation text,
  rule_key text,
  provenance_entry_id uuid,
  provenance_char_start integer,
  provenance_char_end integer,
  provenance_evidence_text text,
  provenance_source_label text
) language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
begin
  select * into target_patient from patients where patients.id = p_patient_id;
  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  if not user_has_clinic_role(target_patient.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    g.id,
    g.highlight_id,
    g.title,
    g.short_summary,
    g.status,
    g.risk,
    g.risk_reason,
    g.importance_score,
    g.importance_reasons,
    g.storage_class,
    g.ranking_explanation,
    g.provenance_span_id,
    g.available_action,
    g.confirmation_status,
    g.evidence_label,
    g.evidence_explanation,
    g.rule_key,
    ps.entry_id,
    ps.char_start,
    ps.char_end,
    ps.evidence_text,
    src.source_label
  from glance_items g
  join provenance_spans ps on ps.id = g.provenance_span_id
  left join provenance_sources src on src.id = ps.source_id
  where g.patient_id = target_patient.id
    and g.clinic_id = target_patient.clinic_id
    and g.status not in ('rejected'::review_status, 'resolved'::review_status)
  order by g.importance_score desc, g.created_at desc, g.id asc
  limit 5;
end;
$$;
