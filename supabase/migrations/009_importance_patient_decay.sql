alter table glance_items add column if not exists feature_key text;
alter table glance_items add column if not exists action_type text;
alter table glance_items add column if not exists source_type text;
alter table glance_items add column if not exists storage_class text not null default 'HOT'
  check (storage_class in ('HOT', 'WARM', 'COLD'));
alter table glance_items add column if not exists ranking_explanation text not null default 'Ranked from deterministic persisted components.';

alter table patient_facing_content add column if not exists evidence_confidence numeric(4,2) not null default 0.90
  check (evidence_confidence >= 0 and evidence_confidence <= 1);
alter table patient_facing_content add column if not exists review_status review_status not null default 'needs_review';

create index if not exists idx_glance_warm_read on glance_items(clinic_id, patient_id, status, importance_score desc, created_at desc, id);
create index if not exists idx_feedback_clinic_feature_type on importance_feedback(clinic_id, feature_key, feedback_type, created_at);
create index if not exists idx_patient_content_patient_status on patient_facing_content(patient_id, status, approved_at desc);

create or replace function is_persistent_safety_class(p_rule_key text, p_risk risk_level, p_status review_status)
returns boolean language sql immutable as $$
  select p_rule_key in (
    'ALLERGY_CONFLICT',
    'MEDICATION_CONFLICT',
    'MEDICATION_DOSE_CONFLICT',
    'UNRESOLVED_CRITICAL_TASK'
  )
  or (p_risk in ('high'::risk_level, 'critical'::risk_level) and p_status <> 'resolved'::review_status);
$$;

create or replace function storage_class_for_item(
  p_rule_key text,
  p_risk risk_level,
  p_status review_status,
  p_created_at timestamptz
) returns text language plpgsql immutable as $$
declare
  age_days integer := greatest(0, floor(extract(epoch from ('2026-08-27T00:00:00Z'::timestamptz - p_created_at)) / 86400)::integer);
begin
  if is_persistent_safety_class(p_rule_key, p_risk, p_status) or p_status = 'needs_review'::review_status then
    return 'HOT';
  end if;
  if age_days <= 30 then
    return 'HOT';
  end if;
  if age_days <= 365 then
    return 'WARM';
  end if;
  return 'COLD';
end;
$$;

create or replace function adaptive_importance_components(
  p_clinic_id uuid,
  p_feature_key text
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  exposures integer := 0;
  positives integer := 0;
  rejections integer := 0;
  boost integer := 0;
  negative integer := 0;
begin
  select
    count(*) filter (where feedback_type = 'exposure')::integer,
    count(*) filter (where feedback_type in ('manual_highlight', 'pin', 'clinician_confirmation', 'comment'))::integer,
    count(*) filter (where feedback_type = 'rejection')::integer
  into exposures, positives, rejections
  from importance_feedback
  where clinic_id = p_clinic_id
    and feature_key = p_feature_key;

  boost := least(12, positives * 4);
  negative := greatest(-8, rejections * -4);
  return jsonb_build_object(
    'adaptive_boost', boost + negative,
    'positive_feedback_count', positives,
    'exposure_count', exposures,
    'rejection_count', rejections,
    'bounded_positive_cap', 12,
    'bounded_negative_cap', -8,
    'explanation',
    case
      when positives > 0 then 'Clinic care-team feedback modestly increased priority.'
      when rejections > 0 then 'Explicit rejection modestly reduced non-critical priority.'
      when exposures > 0 then 'Exposure was recorded separately and is not treated as rejection.'
      else 'No clinic-specific adaptive signal.'
    end
  );
end;
$$;

create or replace function calculate_importance_components(
  p_clinic_id uuid,
  p_rule_key text,
  p_risk risk_level,
  p_status review_status,
  p_confirmation_status review_status,
  p_feature_key text,
  p_created_at timestamptz
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  risk_component integer := case p_risk when 'critical' then 70 when 'high' then 50 when 'medium' then 25 else 5 end;
  action_component integer := case when p_status in ('needs_review'::review_status, 'confirmed'::review_status) and coalesce(p_rule_key, '') like 'UNRESOLVED%' then 30 else 0 end;
  age_days integer := greatest(0, floor(extract(epoch from ('2026-08-27T00:00:00Z'::timestamptz - p_created_at)) / 86400)::integer);
  recency_component integer;
  confirmation_component integer := case when p_confirmation_status = 'confirmed'::review_status then 20 else 0 end;
  entity_component integer := case
    when coalesce(p_rule_key, '') like 'ALLERGY%' then 20
    when coalesce(p_rule_key, '') like 'MEDICATION%' then 20
    when coalesce(p_rule_key, '') like '%SYMPTOM%' then 12
    else 5
  end;
  decay_component integer;
  adaptive jsonb;
  adaptive_component integer;
  storage text;
  score integer;
begin
  if age_days <= 7 then recency_component := 10;
  elsif age_days <= 30 then recency_component := 5;
  else recency_component := 0;
  end if;

  if is_persistent_safety_class(p_rule_key, p_risk, p_status) then
    decay_component := 0;
  elsif age_days > 365 then
    decay_component := -20;
  elsif age_days > 30 then
    decay_component := -10;
  else
    decay_component := 0;
  end if;

  adaptive := adaptive_importance_components(p_clinic_id, coalesce(p_feature_key, p_rule_key, 'general'));
  adaptive_component := (adaptive->>'adaptive_boost')::integer;
  if is_persistent_safety_class(p_rule_key, p_risk, p_status) and adaptive_component < 0 then
    adaptive_component := 0;
  end if;

  storage := storage_class_for_item(p_rule_key, p_risk, p_status, p_created_at);
  score := risk_component + action_component + recency_component + confirmation_component + entity_component + decay_component + adaptive_component;
  return jsonb_build_object(
    'score', greatest(0, score),
    'risk', risk_component,
    'unresolved_action', action_component,
    'recency', recency_component,
    'clinician_confirmation', confirmation_component,
    'entity_priority', entity_component,
    'decay', decay_component,
    'adaptive', adaptive_component,
    'storage_class', storage,
    'age_days', age_days,
    'adaptive_detail', adaptive,
    'explanations', jsonb_build_array(
      case when risk_component >= 50 then 'High-priority safety conflict' else 'Lower deterministic risk contribution' end,
      case when action_component > 0 then 'Unresolved follow-up requiring action' else 'No unresolved-action boost' end,
      case when recency_component > 0 then 'Recent evidence' else 'Older evidence has limited recency boost' end,
      case when confirmation_component > 0 then 'Clinician confirmed' else 'Not clinician-confirmed' end,
      case when decay_component = 0 and is_persistent_safety_class(p_rule_key, p_risk, p_status) then 'Persistent safety information protected from decay' else 'Ordinary information follows age decay' end,
      adaptive->>'explanation'
    )
  );
end;
$$;

create or replace function rerank_patient_glance(p_patient_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  item record;
  components jsonb;
  changed integer := 0;
begin
  for item in select * from glance_items where patient_id = p_patient_id loop
    components := calculate_importance_components(
      item.clinic_id,
      item.rule_key,
      item.risk,
      item.status,
      item.confirmation_status,
      coalesce(item.feature_key, item.rule_key, item.title),
      item.created_at
    );
    update glance_items
    set importance_score = (components->>'score')::integer,
        importance_reasons = components - 'score',
        storage_class = components->>'storage_class',
        feature_key = coalesce(feature_key, rule_key, title),
        action_type = coalesce(action_type, available_action),
        source_type = coalesce(source_type, 'timeline'),
        ranking_explanation = array_to_string(array(select jsonb_array_elements_text(components->'explanations')), ' ')
    where id = item.id;
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;

create or replace function record_importance_feedback(p_highlight_id uuid, p_feedback_type feedback_type)
returns importance_feedback language plpgsql security definer set search_path = public as $$
declare
  item glance_items;
  feedback importance_feedback;
begin
  select * into item from glance_items where highlight_id = p_highlight_id limit 1;
  if not found then raise exception 'Highlight is not active in Glance' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(item.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  insert into importance_feedback (clinic_id, patient_id, highlight_id, feature_key, feedback_type, actor_id)
  values (item.clinic_id, item.patient_id, p_highlight_id, coalesce(item.feature_key, item.rule_key, item.title), p_feedback_type, auth.uid())
  returning * into feedback;
  perform rerank_patient_glance(item.patient_id);
  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (item.clinic_id, auth.uid(), 'importance.feedback_recorded', 'highlight', p_highlight_id,
          jsonb_build_object('feedback_type', p_feedback_type, 'feature_key_present', coalesce(item.feature_key, item.rule_key, item.title) is not null));
  return feedback;
end;
$$;

create or replace function create_demo_glance_candidate(
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
    raise exception 'Cannot create trusted candidate with invalid provenance' using errcode = '23514';
  end if;
  if not exists (
    select 1 from care_entries
    where id = (validation->>'entry_id')::uuid
      and patient_id = target_patient.id
      and clinic_id = target_patient.clinic_id
  ) then
    raise exception 'Candidate provenance belongs outside patient or clinic scope' using errcode = '42501';
  end if;
  insert into highlights (clinic_id, patient_id, provenance_span_id, title, summary, risk, risk_reason, review_status, evidence_confidence, state, confidence_explanation, rule_key)
  values (target_patient.clinic_id, target_patient.id, p_provenance_span_id, p_title, p_summary, deterministic_risk_floor(p_rule_key, p_risk),
          p_rule_key || ': deterministic risk remains separate from importance.', p_status, 0.90, p_status::text,
          'Exact source span resolved for synthetic candidate.', p_rule_key)
  returning id into highlight_id;
  components := calculate_importance_components(target_patient.clinic_id, p_rule_key, deterministic_risk_floor(p_rule_key, p_risk), p_status, p_status, p_feature_key, now());
  insert into glance_items (clinic_id, patient_id, highlight_id, title, short_summary, status, risk, risk_reason, importance_score, importance_reasons, provenance_span_id, available_action, confirmation_status, evidence_label, evidence_explanation, rule_key, feature_key, action_type, source_type, storage_class, ranking_explanation)
  values (target_patient.clinic_id, target_patient.id, highlight_id, p_title, p_summary, p_status, deterministic_risk_floor(p_rule_key, p_risk),
          p_rule_key || ': deterministic risk remains separate from importance.', (components->>'score')::integer, components - 'score',
          p_provenance_span_id, 'Review candidate', p_status, 'Strong evidence', 'Exact source span resolved.', p_rule_key, p_feature_key,
          'review', 'timeline', components->>'storage_class', array_to_string(array(select jsonb_array_elements_text(components->'explanations')), ' '))
  returning * into item;
  return item;
end;
$$;

create or replace function set_patient_content_status(p_content_id uuid, p_status patient_content_status)
returns patient_facing_content language plpgsql security definer set search_path = public as $$
declare
  target_content patient_facing_content;
  validation jsonb;
  source_entry care_entries;
begin
  select * into target_content from patient_facing_content where id = p_content_id;
  if not found then raise exception 'Content not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_content.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  validation := validate_provenance_span(target_content.provenance_span_id);
  if (validation->>'ok')::boolean then
    select * into source_entry from care_entries where id = (validation->>'entry_id')::uuid;
    if source_entry.patient_id <> target_content.patient_id or source_entry.clinic_id <> target_content.clinic_id then
      validation := jsonb_build_object('ok', false, 'reason', 'provenance belongs outside patient or clinic scope');
    end if;
  end if;
  if p_status = 'approved' and (
    not (validation->>'ok')::boolean
    or target_content.evidence_confidence < 0.75
    or target_content.review_status = 'rejected'::review_status
  ) then
    raise exception 'Cannot approve content that is unresolved, rejected, or below trust threshold' using errcode = '23514';
  end if;
  update patient_facing_content
  set status = p_status,
      review_status = case
        when p_status = 'approved' then 'confirmed'::review_status
        when p_status = 'rejected' then 'rejected'::review_status
        else review_status
      end,
      approved_by = case when p_status = 'approved' then auth.uid() else approved_by end,
      approved_at = case when p_status = 'approved' then now() else approved_at end
  where id = p_content_id returning * into target_content;
  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_content.clinic_id, auth.uid(), 'patient_content.status_changed', 'patient_facing_content', target_content.id,
          jsonb_build_object('status', p_status, 'review_status', target_content.review_status));
  return target_content;
end;
$$;

update glance_items
set feature_key = coalesce(feature_key, rule_key, title),
    action_type = coalesce(action_type, available_action),
    source_type = coalesce(source_type, 'timeline');

select rerank_patient_glance('30000000-0000-0000-0000-000000000001');
