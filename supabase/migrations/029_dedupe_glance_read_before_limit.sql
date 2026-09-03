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
    return;
  end if;

  if not user_has_clinic_role(target_patient.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  with eligible as (
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
      ps.entry_id as provenance_entry_id,
      ps.char_start as provenance_char_start,
      ps.char_end as provenance_char_end,
      ps.evidence_text as provenance_evidence_text,
      src.source_label as provenance_source_label,
      case
        when lower(g.title) like '%allergy%' and lower(g.title) like '%conflict%' then 'allergy_conflict'
        when lower(g.title) like '%dose%' and lower(g.title) like '%conflict%' then 'medication_dose_conflict'
        when lower(g.title) like '%medication%' and lower(g.title) like '%conflict%' then 'medication_conflict'
        when lower(g.title) like '%renal%' then 'renal_panel_action'
        when lower(g.title) like '%cough%' then 'persistent_cough'
        else coalesce(g.rule_key, 'item') || ':' || lower(g.title)
      end as semantic_key,
      g.created_at
    from glance_items g
    join provenance_spans ps on ps.id = g.provenance_span_id
    left join provenance_sources src on src.id = ps.source_id
    where g.patient_id = target_patient.id
      and g.clinic_id = target_patient.clinic_id
      and g.status not in ('rejected'::review_status, 'resolved'::review_status)
  ),
  deduped as (
    select *
    from (
      select
        eligible.*,
        row_number() over (
          partition by semantic_key
          order by eligible.importance_score desc, eligible.created_at desc, eligible.id asc
        ) as semantic_rank
      from eligible
    ) ranked
    where semantic_rank = 1
  )
  select
    d.id,
    d.highlight_id,
    d.title,
    d.short_summary,
    d.status,
    d.risk,
    d.risk_reason,
    d.importance_score,
    d.importance_reasons,
    d.storage_class,
    d.ranking_explanation,
    d.provenance_span_id,
    d.available_action,
    d.confirmation_status,
    d.evidence_label,
    d.evidence_explanation,
    d.rule_key,
    d.provenance_entry_id,
    d.provenance_char_start,
    d.provenance_char_end,
    d.provenance_evidence_text,
    d.provenance_source_label
  from deduped d
  order by d.importance_score desc, d.created_at desc, d.id asc
  limit 5;
end;
$$;

grant execute on function read_patient_glance(uuid) to authenticated;
