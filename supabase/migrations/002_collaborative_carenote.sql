create type rpc_status as enum ('ok', 'conflict', 'forbidden', 'not_found', 'invalid');

create function current_profile_role()
returns app_role language sql stable security definer set search_path = public as $$
  select primary_role from profiles where id = auth.uid();
$$;

create function entry_edit_allowed(target_entry care_entries)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (
      target_entry.author_role = 'staff'
      and target_entry.author_id = auth.uid()
      and user_has_clinic_role(target_entry.clinic_id, array['staff'::app_role])
    )
    or (
      target_entry.author_role = 'clinician'
      and target_entry.author_id = auth.uid()
      and user_has_clinic_role(target_entry.clinic_id, array['clinician'::app_role])
    )
    or (
      target_entry.author_role = 'admin'
      and target_entry.author_id = auth.uid()
      and user_has_clinic_role(target_entry.clinic_id, array['admin'::app_role])
    );
$$;

create function audit_safe_metadata(input jsonb)
returns jsonb language sql immutable as $$
  select coalesce(input, '{}'::jsonb) - 'content' - 'body' - 'note' - 'clinical_text';
$$;

create function create_care_entry(
  p_patient_id uuid,
  p_entry_type entry_type,
  p_visibility entry_visibility,
  p_content text,
  p_occurred_at timestamptz default now()
)
returns care_entries language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  actor_role app_role;
  new_entry care_entries;
begin
  select * into target_patient from patients where id = p_patient_id;
  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  actor_role := current_profile_role();
  if actor_role not in ('staff', 'clinician', 'admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not user_has_clinic_role(target_patient.clinic_id, array[actor_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if actor_role = 'staff' and p_entry_type <> 'staff_note' then
    raise exception 'Staff may create staff notes only' using errcode = '42501';
  end if;
  if actor_role = 'clinician' and p_entry_type not in ('clinician_note', 'instruction') then
    raise exception 'Clinician may create clinician notes or instructions only' using errcode = '42501';
  end if;

  insert into care_entries (
    clinic_id,
    patient_id,
    author_role,
    author_id,
    entry_type,
    visibility,
    content,
    current_version,
    occurred_at
  )
  values (
    target_patient.clinic_id,
    target_patient.id,
    actor_role,
    auth.uid(),
    p_entry_type,
    p_visibility,
    p_content,
    1,
    coalesce(p_occurred_at, now())
  )
  returning * into new_entry;

  insert into entry_versions (entry_id, version_number, content, changed_by, change_reason)
  values (new_entry.id, 1, p_content, auth.uid(), 'created');

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, new_version, metadata)
  values (
    new_entry.clinic_id,
    auth.uid(),
    'care_entry.created',
    'care_entry',
    new_entry.id,
    1,
    jsonb_build_object('entry_type', p_entry_type, 'visibility', p_visibility)
  );

  return new_entry;
end;
$$;

create function edit_care_entry(
  p_entry_id uuid,
  p_expected_version integer,
  p_content text,
  p_change_reason text default 'edited'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_entry care_entries;
  next_version integer;
begin
  select * into target_entry from care_entries where id = p_entry_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if not entry_edit_allowed(target_entry) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if target_entry.current_version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'current_version', target_entry.current_version,
      'expected_version', p_expected_version,
      'current_content', target_entry.content
    );
  end if;

  next_version := target_entry.current_version + 1;

  update care_entries
  set content = p_content, current_version = next_version
  where id = p_entry_id;

  insert into entry_versions (entry_id, version_number, content, changed_by, change_reason)
  values (p_entry_id, next_version, p_content, auth.uid(), coalesce(p_change_reason, 'edited'));

  insert into audit_events (
    clinic_id,
    actor_id,
    action_type,
    resource_type,
    resource_id,
    previous_version,
    new_version,
    metadata
  )
  values (
    target_entry.clinic_id,
    auth.uid(),
    'care_entry.edited',
    'care_entry',
    p_entry_id,
    target_entry.current_version,
    next_version,
    jsonb_build_object('change_reason', coalesce(p_change_reason, 'edited'))
  );

  return jsonb_build_object('status', 'ok', 'entry_id', p_entry_id, 'version', next_version);
end;
$$;

create function revert_care_entry(
  p_entry_id uuid,
  p_expected_version integer,
  p_revert_to_version integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_entry care_entries;
  source_version entry_versions;
  next_version integer;
begin
  select * into target_entry from care_entries where id = p_entry_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if not entry_edit_allowed(target_entry) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if target_entry.current_version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'current_version', target_entry.current_version,
      'expected_version', p_expected_version,
      'current_content', target_entry.content
    );
  end if;

  select * into source_version
  from entry_versions
  where entry_id = p_entry_id and version_number = p_revert_to_version;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  next_version := target_entry.current_version + 1;

  update care_entries
  set content = source_version.content, current_version = next_version
  where id = p_entry_id;

  insert into entry_versions (
    entry_id,
    version_number,
    content,
    changed_by,
    change_reason,
    reverted_from_version
  )
  values (p_entry_id, next_version, source_version.content, auth.uid(), 'reverted', p_revert_to_version);

  insert into audit_events (
    clinic_id,
    actor_id,
    action_type,
    resource_type,
    resource_id,
    previous_version,
    new_version,
    metadata
  )
  values (
    target_entry.clinic_id,
    auth.uid(),
    'care_entry.reverted',
    'care_entry',
    p_entry_id,
    target_entry.current_version,
    next_version,
    jsonb_build_object('reverted_from_version', p_revert_to_version)
  );

  return jsonb_build_object('status', 'ok', 'entry_id', p_entry_id, 'version', next_version);
end;
$$;

create function create_comment(
  p_entry_id uuid,
  p_body text,
  p_parent_comment_id uuid default null,
  p_mentions uuid[] default '{}'
)
returns comments language plpgsql security definer set search_path = public as $$
declare
  target_entry care_entries;
  mention_id uuid;
  new_comment comments;
begin
  select * into target_entry from care_entries where id = p_entry_id;
  if not found then
    raise exception 'Entry not found' using errcode = 'P0002';
  end if;

  if not user_has_clinic_role(target_entry.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if p_parent_comment_id is not null and not exists (
    select 1 from comments where id = p_parent_comment_id and entry_id = p_entry_id
  ) then
    raise exception 'Parent comment not found' using errcode = 'P0002';
  end if;

  insert into comments (
    clinic_id,
    patient_id,
    entry_id,
    parent_comment_id,
    author_id,
    visibility,
    body
  )
  values (
    target_entry.clinic_id,
    target_entry.patient_id,
    target_entry.id,
    p_parent_comment_id,
    auth.uid(),
    'internal',
    p_body
  )
  returning * into new_comment;

  foreach mention_id in array coalesce(p_mentions, '{}') loop
    if not exists (
      select 1
      from clinic_memberships
      where clinic_id = target_entry.clinic_id
        and profile_id = mention_id
        and role in ('staff', 'clinician', 'admin')
    ) then
      raise exception 'Mention is outside permitted clinic users' using errcode = '42501';
    end if;
    insert into comment_mentions (comment_id, mentioned_profile_id)
    values (new_comment.id, mention_id)
    on conflict do nothing;
  end loop;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_entry.clinic_id, auth.uid(), 'comment.created', 'comment', new_comment.id, '{}'::jsonb);

  return new_comment;
end;
$$;

create function set_comment_resolved(p_comment_id uuid, p_resolved boolean)
returns comments language plpgsql security definer set search_path = public as $$
declare
  target_comment comments;
begin
  select * into target_comment from comments where id = p_comment_id;
  if not found then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;

  if not user_has_clinic_role(target_comment.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update comments
  set resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then auth.uid() else null end
  where id = p_comment_id
  returning * into target_comment;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (
    target_comment.clinic_id,
    auth.uid(),
    case when p_resolved then 'comment.resolved' else 'comment.unresolved' end,
    'comment',
    target_comment.id,
    '{}'::jsonb
  );

  return target_comment;
end;
$$;

create function create_task(
  p_patient_id uuid,
  p_title text,
  p_assignee_id uuid,
  p_source_entry_id uuid default null,
  p_due_date date default null
)
returns tasks language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  new_task tasks;
begin
  select * into target_patient from patients where id = p_patient_id;
  if not found then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  if not user_has_clinic_role(target_patient.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if not exists (
    select 1 from clinic_memberships
    where clinic_id = target_patient.clinic_id
      and profile_id = p_assignee_id
      and role in ('staff', 'clinician', 'admin')
  ) then
    raise exception 'Assignee is outside permitted clinic users' using errcode = '42501';
  end if;

  insert into tasks (clinic_id, patient_id, source_entry_id, title, assignee_id, created_by, status, due_date)
  values (target_patient.clinic_id, target_patient.id, p_source_entry_id, p_title, p_assignee_id, auth.uid(), 'open', p_due_date)
  returning * into new_task;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (new_task.clinic_id, auth.uid(), 'task.created', 'task', new_task.id, jsonb_build_object('assignee_id', p_assignee_id));

  return new_task;
end;
$$;

create function set_task_status(p_task_id uuid, p_status task_status)
returns tasks language plpgsql security definer set search_path = public as $$
declare
  target_task tasks;
begin
  select * into target_task from tasks where id = p_task_id;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  if not user_has_clinic_role(target_task.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  update tasks set status = p_status where id = p_task_id returning * into target_task;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_task.clinic_id, auth.uid(), 'task.status_changed', 'task', target_task.id, jsonb_build_object('status', p_status));

  return target_task;
end;
$$;

create policy versions_role_owner_insert on entry_versions for insert with check (
  exists (
    select 1 from care_entries e
    where e.id = entry_versions.entry_id
      and entry_edit_allowed(e)
  )
);

create policy tasks_staff_clinician_insert on tasks for insert with check (
  created_by = auth.uid()
  and user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy tasks_staff_clinician_update on tasks for update using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
) with check (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy comments_staff_clinician_update on comments for update using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
) with check (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

create policy mentions_staff_clinician_insert on comment_mentions for insert with check (
  exists (
    select 1
    from comments c
    where c.id = comment_mentions.comment_id
      and user_has_clinic_role(c.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
  )
);
