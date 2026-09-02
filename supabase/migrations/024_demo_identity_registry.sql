create table if not exists demo_identities (
  token text primary key check (token like 'demo-%'),
  profile_id uuid not null references profiles(id) on delete cascade,
  clinic_id uuid not null references clinics(id) on delete cascade,
  role app_role not null check (role in ('admin', 'clinician', 'staff', 'patient')),
  email text not null unique,
  created_at timestamptz not null default now(),
  unique (profile_id, clinic_id, role)
);

alter table demo_identities enable row level security;

drop policy if exists demo_identities_select on demo_identities;
create policy demo_identities_select on demo_identities for select using (
  is_platform_admin()
  or user_has_clinic_role(clinic_id, array['admin'::app_role])
  or profile_id = auth.uid()
);

create or replace function create_demo_person_record(
  p_profile_id uuid,
  p_email text,
  p_display_name text,
  p_clinic_id uuid,
  p_role app_role
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  generated_token text;
  membership_id uuid;
begin
  if not is_platform_admin() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'clinician', 'staff') then
    raise exception 'Demo person role is not allowed' using errcode = '23514';
  end if;
  if not exists (select 1 from clinics where id = p_clinic_id) then
    raise exception 'Clinic not found' using errcode = 'P0002';
  end if;
  if nullif(trim(p_display_name), '') is null then
    raise exception 'Display name is required' using errcode = '23514';
  end if;

  insert into profiles (id, display_name, primary_role)
  values (p_profile_id, trim(p_display_name), p_role)
  on conflict (id) do update
    set display_name = excluded.display_name,
        primary_role = excluded.primary_role
  where profiles.id = p_profile_id;

  insert into clinic_memberships (clinic_id, profile_id, role)
  values (p_clinic_id, p_profile_id, p_role)
  on conflict (clinic_id, profile_id, role) do update set clinic_id = excluded.clinic_id
  returning id into membership_id;

  generated_token := 'demo-person-' || replace(p_profile_id::text, '-', '');
  insert into demo_identities (token, profile_id, clinic_id, role, email)
  values (generated_token, p_profile_id, p_clinic_id, p_role, lower(trim(p_email)))
  on conflict (profile_id, clinic_id, role) do update
    set token = excluded.token,
        email = excluded.email
  returning token into generated_token;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (p_clinic_id, auth.uid(), 'demo.person_created', 'clinic_membership', membership_id,
          jsonb_build_object('role', p_role, 'profile_id', p_profile_id));

  return jsonb_build_object(
    'status', 'ok',
    'token', generated_token,
    'profile_id', p_profile_id,
    'clinic_id', p_clinic_id,
    'role', p_role
  );
end;
$$;

grant execute on function create_demo_person_record(uuid, text, text, uuid, app_role) to authenticated;
