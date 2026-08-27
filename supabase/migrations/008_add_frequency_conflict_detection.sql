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
      ctype || ' floor: deterministic clinical contradiction requires review until resolved.',
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
