alter table highlights add column if not exists state text not null default 'needs_review'
  check (state in ('suggested', 'confirmed', 'rejected', 'needs_review'));
alter table highlights add column if not exists confidence_explanation text not null default 'Provenance pending review.';
alter table highlights add column if not exists rule_key text;

alter table glance_items add column if not exists evidence_label text not null default 'Needs review';
alter table glance_items add column if not exists evidence_explanation text not null default 'Provenance pending review.';
alter table glance_items add column if not exists rule_key text;

create function risk_rank(p_risk risk_level)
returns integer language sql immutable as $$
  select case p_risk
    when 'low' then 1
    when 'medium' then 2
    when 'high' then 3
    when 'critical' then 4
  end;
$$;

create function ranked_risk(p_rank integer)
returns risk_level language sql immutable as $$
  select case
    when p_rank <= 1 then 'low'::risk_level
    when p_rank = 2 then 'medium'::risk_level
    when p_rank = 3 then 'high'::risk_level
    else 'critical'::risk_level
  end;
$$;

create function deterministic_risk_floor(p_rule_key text, p_suggested risk_level)
returns risk_level language sql immutable as $$
  select ranked_risk(greatest(
    risk_rank(p_suggested),
    risk_rank(case p_rule_key
      when 'ALLERGY_CONFLICT' then 'high'::risk_level
      when 'MEDICATION_CONFLICT' then 'high'::risk_level
      when 'MEDICATION_DOSE_CONFLICT' then 'high'::risk_level
      when 'UNRESOLVED_CRITICAL_TASK' then 'high'::risk_level
      when 'UNRESOLVED_TASK' then 'medium'::risk_level
      else 'low'::risk_level
    end)
  ));
$$;

create function validate_provenance_span(p_span_id uuid)
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
    'source_label', source_record.source_label
  );
end;
$$;

create function seed_jane_trust_glance()
returns void language plpgsql security definer set search_path = public as $$
declare
  clinic_a uuid := '20000000-0000-0000-0000-000000000001';
  jane uuid := '30000000-0000-0000-0000-000000000001';
  allergy_entry uuid := '40000000-0000-0000-0000-000000000001';
  nurse_entry uuid := '40000000-0000-0000-0000-000000000002';
  patient_session_entry uuid := '40000000-0000-0000-0000-000000000003';
  doctor_entry uuid := '40000000-0000-0000-0000-000000000004';
  staff_entry uuid := '40000000-0000-0000-0000-000000000005';
  allergy_version uuid;
  nurse_version uuid;
  patient_version uuid;
  doctor_version uuid;
  staff_version uuid;
  source_id uuid;
  span_id uuid;
  highlight_id uuid;
begin
  select id into allergy_version from entry_versions where entry_id = allergy_entry and version_number = 1 limit 1;
  select id into nurse_version from entry_versions where entry_id = nurse_entry and version_number = 1 limit 1;
  select id into patient_version from entry_versions where entry_id = patient_session_entry and version_number = 1 limit 1;
  select id into doctor_version from entry_versions where entry_id = doctor_entry and version_number = 1 limit 1;
  select id into staff_version from entry_versions where entry_id = staff_entry and version_number = 1 limit 1;

  insert into provenance_sources (id, clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label)
  values ('70000000-0000-0000-0000-000000000001', clinic_a, jane, allergy_entry, allergy_version, 'entry', 'April 15, 2025 clinician note')
  on conflict (id) do update set source_version_id = excluded.source_version_id;
  insert into provenance_sources (id, clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label)
  values ('70000000-0000-0000-0000-000000000002', clinic_a, jane, nurse_entry, nurse_version, 'entry', 'February 6, 2026 AI nurse consult summary')
  on conflict (id) do update set source_version_id = excluded.source_version_id;
  insert into provenance_sources (id, clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label)
  values ('70000000-0000-0000-0000-000000000003', clinic_a, jane, patient_session_entry, patient_version, 'session', 'August 26, 2026 AI patient session')
  on conflict (id) do update set source_version_id = excluded.source_version_id;
  insert into provenance_sources (id, clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label)
  values ('70000000-0000-0000-0000-000000000004', clinic_a, jane, staff_entry, staff_version, 'entry', 'August 26, 2026 staff follow-up')
  on conflict (id) do update set source_version_id = excluded.source_version_id;

  insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, evidence_text)
  values ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', allergy_entry, allergy_version, 0, 30, 'Penicillin allergy documented.')
  on conflict (id) do update set entry_version_id = excluded.entry_version_id;
  insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, evidence_text)
  values ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', nurse_entry, nurse_version, 16, 39, 'no known drug allergies')
  on conflict (id) do update set entry_version_id = excluded.entry_version_id;
  insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, transcript_start_ms, transcript_end_ms, evidence_text)
  values ('71000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000003', patient_session_entry, patient_version, 18, 72, 12000, 26000, 'nocturnal cough persisting for approximately three weeks')
  on conflict (id) do update set entry_version_id = excluded.entry_version_id;
  insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, evidence_text)
  values ('71000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000004', staff_entry, staff_version, 0, 47, 'Repeat renal panel has not yet been ordered.')
  on conflict (id) do update set entry_version_id = excluded.entry_version_id;

  insert into highlights (id, clinic_id, patient_id, provenance_span_id, title, summary, risk, risk_reason, review_status, evidence_confidence, state, confidence_explanation, rule_key)
  values (
    '72000000-0000-0000-0000-000000000001', clinic_a, jane, '71000000-0000-0000-0000-000000000002',
    'Allergy conflict', 'Earlier penicillin allergy conflicts with later no-known-drug-allergies context.',
    deterministic_risk_floor('ALLERGY_CONFLICT', 'medium'), 'ALLERGY_CONFLICT floor: allergy contradictions require HIGH risk until reviewed.',
    'needs_review', 0.90, 'needs_review', 'Exact source span resolved; contradiction detected and requires clinician review.', 'ALLERGY_CONFLICT'
  ) on conflict (id) do update set risk = excluded.risk, risk_reason = excluded.risk_reason, evidence_confidence = excluded.evidence_confidence;

  insert into highlights (id, clinic_id, patient_id, provenance_span_id, title, summary, risk, risk_reason, review_status, evidence_confidence, state, confidence_explanation, rule_key)
  values (
    '72000000-0000-0000-0000-000000000002', clinic_a, jane, '71000000-0000-0000-0000-000000000004',
    'Outstanding renal panel', 'Repeat renal panel has been discussed but remains unordered.',
    deterministic_risk_floor('UNRESOLVED_TASK', 'low'), 'UNRESOLVED_TASK floor: unresolved follow-up actions carry MEDIUM risk.',
    'needs_review', 0.90, 'suggested', 'Exact staff follow-up span resolved.', 'UNRESOLVED_TASK'
  ) on conflict (id) do update set risk = excluded.risk, risk_reason = excluded.risk_reason, evidence_confidence = excluded.evidence_confidence;

  insert into highlights (id, clinic_id, patient_id, provenance_span_id, title, summary, risk, risk_reason, review_status, evidence_confidence, state, confidence_explanation, rule_key)
  values (
    '72000000-0000-0000-0000-000000000003', clinic_a, jane, '71000000-0000-0000-0000-000000000003',
    'Persistent nocturnal cough', 'Nocturnal cough has persisted for approximately three weeks.',
    deterministic_risk_floor('SYMPTOM_PERSISTENT', 'medium'), 'Persistent symptom from exact AI patient-session span; no deterministic high-risk floor.',
    'confirmed', 0.95, 'confirmed', 'Clinician-confirmed AI-derived evidence with exact span.', 'SYMPTOM_PERSISTENT'
  ) on conflict (id) do update set risk = excluded.risk, risk_reason = excluded.risk_reason, evidence_confidence = excluded.evidence_confidence;

  delete from glance_items where patient_id = jane and id in (
    '73000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000002',
    '73000000-0000-0000-0000-000000000003'
  );

  insert into glance_items (
    id, clinic_id, patient_id, highlight_id, title, short_summary, status, risk, risk_reason,
    importance_score, importance_reasons, provenance_span_id, available_action, confirmation_status,
    evidence_label, evidence_explanation, rule_key
  )
  select
    '73000000-0000-0000-0000-000000000001', clinic_a, jane, h.id, h.title, h.summary, h.review_status, h.risk, h.risk_reason,
    92, '{"risk_floor":50,"contradiction":20,"review_needed":22}'::jsonb, h.provenance_span_id, 'Review allergy conflict', h.review_status,
    'Strong evidence', h.confidence_explanation, h.rule_key
  from highlights h where h.id = '72000000-0000-0000-0000-000000000001';

  insert into glance_items (
    id, clinic_id, patient_id, highlight_id, title, short_summary, status, risk, risk_reason,
    importance_score, importance_reasons, provenance_span_id, available_action, confirmation_status,
    evidence_label, evidence_explanation, rule_key
  )
  select
    '73000000-0000-0000-0000-000000000002', clinic_a, jane, h.id, h.title, h.summary, h.review_status, h.risk, h.risk_reason,
    72, '{"risk_floor":25,"unresolved_action":30,"recency":17}'::jsonb, h.provenance_span_id, 'Order or mark renal panel complete', h.review_status,
    'Strong evidence', h.confidence_explanation, h.rule_key
  from highlights h where h.id = '72000000-0000-0000-0000-000000000002';

  insert into glance_items (
    id, clinic_id, patient_id, highlight_id, title, short_summary, status, risk, risk_reason,
    importance_score, importance_reasons, provenance_span_id, available_action, confirmation_status,
    evidence_label, evidence_explanation, rule_key
  )
  select
    '73000000-0000-0000-0000-000000000003', clinic_a, jane, h.id, h.title, h.summary, h.review_status, h.risk, h.risk_reason,
    58, '{"confirmed":20,"chief_complaint":12,"recency":10,"supported":16}'::jsonb, h.provenance_span_id, 'Monitor and review in consult', h.review_status,
    'Strong evidence', h.confidence_explanation, h.rule_key
  from highlights h where h.id = '72000000-0000-0000-0000-000000000003';
end;
$$;

select seed_jane_trust_glance();

create policy provenance_sources_insert_clinical on provenance_sources for insert with check (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);
create policy provenance_spans_insert_clinical on provenance_spans for insert with check (
  exists (
    select 1 from provenance_sources s
    where s.id = provenance_spans.source_id
      and user_has_clinic_role(s.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
  )
);
create policy highlights_insert_clinical on highlights for insert with check (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);
create policy highlights_update_clinical on highlights for update using (
  user_has_clinic_role(clinic_id, array['clinician'::app_role, 'admin'::app_role])
) with check (
  user_has_clinic_role(clinic_id, array['clinician'::app_role, 'admin'::app_role])
);
create policy glance_items_insert_clinical on glance_items for insert with check (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);
