create or replace function resolve_demo_identity(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  identity demo_identities;
begin
  select * into identity from demo_identities where token = p_token;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'email', identity.email,
    'profile_id', identity.profile_id,
    'clinic_id', identity.clinic_id,
    'role', identity.role
  );
end;
$$;

create or replace function list_demo_access()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'clinics', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'code', c.code
      ) order by c.name)
      from clinics c
      where c.status = 'active'
    ), '[]'::jsonb),
    'demo_identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'token', d.token,
        'profile_id', d.profile_id,
        'clinic_id', d.clinic_id,
        'role', d.role,
        'display_name', p.display_name,
        'platform_admin', is_platform_admin(p.id)
      ) order by c.name, d.role, p.display_name)
      from demo_identities d
      join profiles p on p.id = d.profile_id
      join clinics c on c.id = d.clinic_id
    ), '[]'::jsonb),
    'patient_records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'clinic_id', p.clinic_id,
        'display_name', p.display_name,
        'has_demo_identity', exists (
          select 1 from demo_identities d
          where d.profile_id = p.profile_id
            and d.role = 'patient'
        )
      ) order by c.name, p.display_name)
      from patients p
      join clinics c on c.id = p.clinic_id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function resolve_demo_identity(text) to anon, authenticated;
grant execute on function list_demo_access() to anon, authenticated;
