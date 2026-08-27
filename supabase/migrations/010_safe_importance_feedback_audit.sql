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
