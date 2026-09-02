create or replace function ensure_clinic_has_another_admin(
  p_clinic_id uuid,
  p_excluding_membership_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1
    from clinic_memberships
    where clinic_id = p_clinic_id
      and role = 'admin'
      and id <> p_excluding_membership_id
    for update
  ) then
    raise exception 'Clinic must retain at least one Clinic Administrator.' using errcode = '23505';
  end if;
end;
$$;

create or replace function update_clinic_member_role(
  p_membership_id uuid,
  p_new_role app_role
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_membership clinic_memberships;
  surviving_membership_id uuid;
begin
  if p_new_role not in ('admin', 'clinician', 'staff') then
    raise exception 'Unsupported management role' using errcode = '23514';
  end if;

  select * into target_membership
  from clinic_memberships
  where id = p_membership_id
  for update;
  if not found then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_membership.clinic_id::text));

  if not can_manage_clinic(target_membership.clinic_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if target_membership.role = 'admin' and p_new_role <> 'admin' then
    perform ensure_clinic_has_another_admin(target_membership.clinic_id, target_membership.id);
  end if;

  select id into surviving_membership_id
  from clinic_memberships
  where clinic_id = target_membership.clinic_id
    and profile_id = target_membership.profile_id
    and role = p_new_role
    and id <> target_membership.id
  for update;

  if surviving_membership_id is not null then
    delete from clinic_memberships where id = target_membership.id;
  else
    update clinic_memberships
    set role = p_new_role
    where id = target_membership.id
    returning id into surviving_membership_id;
  end if;

  delete from demo_identities
  where profile_id = target_membership.profile_id
    and clinic_id = target_membership.clinic_id
    and role <> p_new_role;

  update demo_identities
  set role = p_new_role
  where profile_id = target_membership.profile_id
    and clinic_id = target_membership.clinic_id;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_membership.clinic_id, auth.uid(), 'clinic.member_role_changed', 'clinic_membership', surviving_membership_id,
          jsonb_build_object(
            'target_profile_id', target_membership.profile_id,
            'previous_role', target_membership.role,
            'new_role', p_new_role
          ));

  return jsonb_build_object(
    'status', 'ok',
    'membership_id', surviving_membership_id,
    'clinic_id', target_membership.clinic_id,
    'profile_id', target_membership.profile_id,
    'previous_role', target_membership.role,
    'new_role', p_new_role
  );
end;
$$;

create or replace function remove_clinic_member(
  p_membership_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  target_membership clinic_memberships;
begin
  select * into target_membership
  from clinic_memberships
  where id = p_membership_id
  for update;
  if not found then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_membership.clinic_id::text));

  if not can_manage_clinic(target_membership.clinic_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if target_membership.role = 'admin' then
    perform ensure_clinic_has_another_admin(target_membership.clinic_id, target_membership.id);
  end if;

  delete from clinic_memberships where id = target_membership.id;
  delete from demo_identities
  where profile_id = target_membership.profile_id
    and clinic_id = target_membership.clinic_id
    and role = target_membership.role;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_membership.clinic_id, auth.uid(), 'clinic.member_removed', 'clinic_membership', target_membership.id,
          jsonb_build_object(
            'target_profile_id', target_membership.profile_id,
            'removed_role', target_membership.role
          ));

  return jsonb_build_object(
    'status', 'ok',
    'membership_id', target_membership.id,
    'clinic_id', target_membership.clinic_id,
    'profile_id', target_membership.profile_id,
    'removed_role', target_membership.role
  );
end;
$$;

create or replace function transfer_clinic_member(
  p_membership_id uuid,
  p_target_clinic_id uuid,
  p_target_role app_role
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  source_membership clinic_memberships;
  target_clinic clinics;
  target_membership_id uuid;
  source_identity demo_identities;
begin
  if not is_platform_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_target_role not in ('admin', 'clinician', 'staff') then
    raise exception 'Unsupported management role' using errcode = '23514';
  end if;

  select * into source_membership
  from clinic_memberships
  where id = p_membership_id
  for update;
  if not found then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  if source_membership.clinic_id = p_target_clinic_id then
    raise exception 'Cannot transfer into the same clinic' using errcode = '23505';
  end if;

  select * into target_clinic
  from clinics
  where id = p_target_clinic_id
    and status = 'active'
  for update;
  if not found then
    raise exception 'Target clinic not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext(source_membership.clinic_id::text));
  perform pg_advisory_xact_lock(hashtext(p_target_clinic_id::text));

  if source_membership.role = 'admin' then
    perform ensure_clinic_has_another_admin(source_membership.clinic_id, source_membership.id);
  end if;

  select * into source_identity
  from demo_identities
  where profile_id = source_membership.profile_id
    and clinic_id = source_membership.clinic_id
    and role = source_membership.role
  order by created_at
  limit 1;

  insert into clinic_memberships (clinic_id, profile_id, role)
  values (p_target_clinic_id, source_membership.profile_id, p_target_role)
  on conflict (clinic_id, profile_id, role) do update set role = excluded.role
  returning id into target_membership_id;

  delete from clinic_memberships where id = source_membership.id;

  delete from demo_identities
  where profile_id = source_membership.profile_id
    and clinic_id in (source_membership.clinic_id, p_target_clinic_id);

  if source_identity.token is not null then
    insert into demo_identities (token, profile_id, clinic_id, role, email)
    values (source_identity.token, source_membership.profile_id, p_target_clinic_id, p_target_role, source_identity.email);
  end if;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (source_membership.clinic_id, auth.uid(), 'clinic.member_transferred', 'clinic_membership', target_membership_id,
          jsonb_build_object(
            'target_profile_id', source_membership.profile_id,
            'source_clinic_id', source_membership.clinic_id,
            'target_clinic_id', p_target_clinic_id,
            'previous_role', source_membership.role,
            'new_role', p_target_role
          ));

  return jsonb_build_object(
    'status', 'ok',
    'source_membership_id', source_membership.id,
    'target_membership_id', target_membership_id,
    'profile_id', source_membership.profile_id,
    'source_clinic_id', source_membership.clinic_id,
    'target_clinic_id', p_target_clinic_id,
    'previous_role', source_membership.role,
    'new_role', p_target_role
  );
end;
$$;

grant execute on function ensure_clinic_has_another_admin(uuid, uuid) to authenticated;
grant execute on function update_clinic_member_role(uuid, app_role) to authenticated;
grant execute on function remove_clinic_member(uuid) to authenticated;
grant execute on function transfer_clinic_member(uuid, uuid, app_role) to authenticated;
