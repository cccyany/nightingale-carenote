alter table patient_facing_content add column if not exists content_revision integer not null default 1
  check (content_revision > 0);
alter table patient_facing_content add column if not exists approved_revision integer
  check (approved_revision is null or approved_revision > 0);

update patient_facing_content
set approved_revision = content_revision
where status = 'approved'
  and approved_revision is null;

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
    if not found
      or source_entry.patient_id <> target_content.patient_id
      or source_entry.clinic_id <> target_content.clinic_id then
      validation := jsonb_build_object('ok', false, 'reason', 'provenance belongs to a different patient or clinic');
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
        else 'needs_review'::review_status
      end,
      approved_by = case when p_status = 'approved' then auth.uid() else null end,
      approved_at = case when p_status = 'approved' then now() else null end,
      approved_revision = case when p_status = 'approved' then content_revision else null end
  where id = p_content_id returning * into target_content;
  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_content.clinic_id, auth.uid(), 'patient_content.status_changed', 'patient_facing_content', target_content.id,
          jsonb_build_object(
            'status', p_status,
            'review_status', target_content.review_status,
            'content_revision', target_content.content_revision,
            'approved_revision', target_content.approved_revision
          ));
  return target_content;
end;
$$;

create or replace function update_patient_facing_content(
  p_content_id uuid,
  p_title text,
  p_body text
) returns patient_facing_content language plpgsql security definer set search_path = public as $$
declare
  target_content patient_facing_content;
  previous_status patient_content_status;
  next_revision integer;
begin
  select * into target_content from patient_facing_content where id = p_content_id;
  if not found then raise exception 'Content not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_content.clinic_id, array['clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  previous_status := target_content.status;
  next_revision := target_content.content_revision + 1;

  update patient_facing_content
  set title = p_title,
      body = p_body,
      content_revision = next_revision,
      status = 'needs_clinician_approval',
      review_status = 'needs_review',
      approved_by = null,
      approved_at = null,
      approved_revision = null
  where id = p_content_id returning * into target_content;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, previous_version, new_version, metadata)
  values (
    target_content.clinic_id,
    auth.uid(),
    'patient_content.edited',
    'patient_facing_content',
    target_content.id,
    next_revision - 1,
    next_revision,
    jsonb_build_object(
      'previous_status', previous_status,
      'status', target_content.status,
      'requires_reapproval', true
    )
  );
  return target_content;
end;
$$;

grant execute on function update_patient_facing_content(uuid, text, text) to authenticated;
