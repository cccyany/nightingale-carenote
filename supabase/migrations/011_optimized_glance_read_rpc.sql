create or replace function read_patient_glance(p_patient_id uuid)
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
  evidence_label text,
  evidence_explanation text,
  rule_key text,
  created_at timestamptz
) language sql stable security invoker set search_path = public as $$
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
    g.evidence_label,
    g.evidence_explanation,
    g.rule_key,
    g.created_at
  from glance_items g
  where g.patient_id = p_patient_id
    and g.status <> 'rejected'::review_status
  order by g.importance_score desc, g.created_at desc, g.id asc
  limit 5;
$$;
