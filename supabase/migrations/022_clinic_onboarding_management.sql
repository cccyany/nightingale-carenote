alter table clinics add column if not exists code text unique;
alter table clinics add column if not exists timezone text not null default 'Asia/Singapore';
alter table clinics add column if not exists status text not null default 'active'
  check (status in ('active', 'inactive'));

update clinics set code = lower(replace(name, ' ', '-')) where code is null;

create table if not exists platform_admins (
  profile_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;

create or replace function is_platform_admin(p_profile_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_admins
    where profile_id = p_profile_id
  );
$$;

drop policy if exists platform_admins_self_select on platform_admins;
create policy platform_admins_self_select on platform_admins for select using (
  profile_id = auth.uid() or is_platform_admin()
);

drop policy if exists clinics_platform_admin_select on clinics;
create policy clinics_platform_admin_select on clinics for select using (is_platform_admin());

drop policy if exists profiles_platform_admin_select on profiles;
create policy profiles_platform_admin_select on profiles for select using (is_platform_admin());

drop policy if exists memberships_platform_admin_select on clinic_memberships;
create policy memberships_platform_admin_select on clinic_memberships for select using (is_platform_admin());

drop policy if exists patients_platform_admin_select on patients;
create policy patients_platform_admin_select on patients for select using (is_platform_admin());

create or replace function can_manage_clinic(p_clinic_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_platform_admin() or user_has_clinic_role(p_clinic_id, array['admin'::app_role]);
$$;

create or replace function list_managed_clinics()
returns table (
  id uuid,
  name text,
  code text,
  timezone text,
  status text,
  created_at timestamptz,
  administrator_count bigint,
  clinician_count bigint,
  staff_count bigint,
  patient_count bigint
) language plpgsql security definer set search_path = public as $$
begin
  return query
  select c.id, c.name, c.code, c.timezone, c.status, c.created_at,
    count(distinct m.profile_id) filter (where m.role = 'admin') as administrator_count,
    count(distinct m.profile_id) filter (where m.role = 'clinician') as clinician_count,
    count(distinct m.profile_id) filter (where m.role = 'staff') as staff_count,
    count(distinct p.id) as patient_count
  from clinics c
  left join clinic_memberships m on m.clinic_id = c.id
  left join patients p on p.clinic_id = c.id
  where is_platform_admin() or user_has_clinic_role(c.id, array['admin'::app_role])
  group by c.id, c.name, c.code, c.timezone, c.status, c.created_at
  order by c.created_at desc, c.name asc;
end;
$$;

create or replace function get_clinic_management(p_clinic_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  clinic_record clinics;
begin
  select * into clinic_record from clinics where id = p_clinic_id;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not can_manage_clinic(clinic_record.id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'clinic', jsonb_build_object(
      'id', clinic_record.id,
      'name', clinic_record.name,
      'code', clinic_record.code,
      'timezone', clinic_record.timezone,
      'status', clinic_record.status,
      'created_at', clinic_record.created_at
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'profile_id', m.profile_id,
        'role', m.role,
        'display_name', pr.display_name,
        'primary_role', pr.primary_role,
        'created_at', m.created_at
      ) order by m.role, pr.display_name)
      from clinic_memberships m
      join profiles pr on pr.id = m.profile_id
      where m.clinic_id = clinic_record.id
        and m.role in ('admin', 'clinician', 'staff')
    ), '[]'::jsonb),
    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'date_of_birth', p.date_of_birth,
        'synthetic', p.synthetic,
        'created_at', p.created_at
      ) order by p.display_name)
      from patients p
      where p.clinic_id = clinic_record.id
    ), '[]'::jsonb),
    'available_profiles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'display_name', pr.display_name,
        'primary_role', pr.primary_role
      ) order by pr.display_name)
      from profiles pr
      where pr.primary_role in ('staff', 'clinician', 'admin')
    ), '[]'::jsonb),
    'can_create_clinics', is_platform_admin()
  );
end;
$$;

create or replace function platform_create_clinic(
  p_name text,
  p_code text default null,
  p_timezone text default 'Asia/Singapore',
  p_initial_admin_profile_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  clinic_id uuid;
  normalized_code text;
begin
  if not is_platform_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Clinic name is required' using errcode = '23514';
  end if;

  normalized_code := coalesce(nullif(trim(lower(p_code)), ''), regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  normalized_code := trim(both '-' from normalized_code);

  insert into clinics (name, code, timezone, status)
  values (trim(p_name), normalized_code, coalesce(nullif(trim(p_timezone), ''), 'Asia/Singapore'), 'active')
  returning id into clinic_id;

  if p_initial_admin_profile_id is not null then
    if not exists (select 1 from profiles where id = p_initial_admin_profile_id) then
      raise exception 'Initial admin profile not found' using errcode = 'P0002';
    end if;
    insert into clinic_memberships (clinic_id, profile_id, role)
    values (clinic_id, p_initial_admin_profile_id, 'admin')
    on conflict do nothing;
  end if;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (clinic_id, auth.uid(), 'clinic.created', 'clinic', clinic_id,
          jsonb_build_object('initial_admin_assigned', p_initial_admin_profile_id is not null));

  return clinic_id;
end;
$$;

create or replace function provision_clinic_member(
  p_clinic_id uuid,
  p_profile_id uuid,
  p_role app_role
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  membership_id uuid;
begin
  if p_role not in ('admin', 'clinician', 'staff') then
    raise exception 'Unsupported management role' using errcode = '23514';
  end if;
  if not can_manage_clinic(p_clinic_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  insert into clinic_memberships (clinic_id, profile_id, role)
  values (p_clinic_id, p_profile_id, p_role)
  on conflict (clinic_id, profile_id, role) do update set clinic_id = excluded.clinic_id
  returning id into membership_id;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (p_clinic_id, auth.uid(), 'clinic.member_provisioned', 'clinic_membership', membership_id,
          jsonb_build_object('role', p_role, 'profile_id', p_profile_id));

  return membership_id;
end;
$$;

create or replace function create_managed_patient(
  p_clinic_id uuid,
  p_display_name text,
  p_date_of_birth date,
  p_profile_id uuid default null,
  p_synthetic boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  patient_id uuid;
begin
  if not can_manage_clinic(p_clinic_id) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if nullif(trim(p_display_name), '') is null then
    raise exception 'Patient name is required' using errcode = '23514';
  end if;
  if p_profile_id is not null and not exists (select 1 from profiles where id = p_profile_id) then
    raise exception 'Patient profile not found' using errcode = 'P0002';
  end if;

  insert into patients (clinic_id, profile_id, display_name, date_of_birth, synthetic)
  values (p_clinic_id, p_profile_id, trim(p_display_name), p_date_of_birth, coalesce(p_synthetic, true))
  returning id into patient_id;

  if p_profile_id is not null then
    insert into clinic_memberships (clinic_id, profile_id, role)
    values (p_clinic_id, p_profile_id, 'patient')
    on conflict do nothing;
  end if;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (p_clinic_id, auth.uid(), 'clinic.patient_created', 'patient', patient_id,
          jsonb_build_object('synthetic', coalesce(p_synthetic, true), 'patient_profile_attached', p_profile_id is not null));

  return patient_id;
end;
$$;

grant execute on function is_platform_admin(uuid) to authenticated;
grant execute on function can_manage_clinic(uuid) to authenticated;
grant execute on function list_managed_clinics() to authenticated;
grant execute on function get_clinic_management(uuid) to authenticated;
grant execute on function platform_create_clinic(text, text, text, uuid) to authenticated;
grant execute on function provision_clinic_member(uuid, uuid, app_role) to authenticated;
grant execute on function create_managed_patient(uuid, text, date, uuid, boolean) to authenticated;
