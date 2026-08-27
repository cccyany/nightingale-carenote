create table if not exists transcript_sessions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  source_label text not null,
  captured_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references transcript_sessions(id) on delete cascade,
  speaker text not null check (speaker in ('patient', 'clinician', 'staff', 'unknown')),
  start_ms integer not null check (start_ms >= 0),
  end_ms integer not null check (end_ms >= start_ms),
  text text not null,
  confidence numeric(4,2) not null default 0.80 check (confidence >= 0 and confidence <= 1),
  uncertain boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_transcript_sessions_patient on transcript_sessions(patient_id, created_at desc);
create index if not exists idx_transcript_segments_session_time on transcript_segments(session_id, start_ms);

alter table transcript_sessions enable row level security;
alter table transcript_segments enable row level security;

drop policy if exists transcript_sessions_clinic_select on transcript_sessions;
create policy transcript_sessions_clinic_select on transcript_sessions for select using (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

drop policy if exists transcript_sessions_clinic_insert on transcript_sessions;
create policy transcript_sessions_clinic_insert on transcript_sessions for insert with check (
  user_has_clinic_role(clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
);

drop policy if exists transcript_segments_clinic_select on transcript_segments;
create policy transcript_segments_clinic_select on transcript_segments for select using (
  exists (
    select 1 from transcript_sessions s
    where s.id = transcript_segments.session_id
      and user_has_clinic_role(s.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
  )
);

drop policy if exists transcript_segments_clinic_insert on transcript_segments;
create policy transcript_segments_clinic_insert on transcript_segments for insert with check (
  exists (
    select 1 from transcript_sessions s
    where s.id = transcript_segments.session_id
      and user_has_clinic_role(s.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role])
  )
);

create or replace function create_transcript_session(
  p_patient_id uuid,
  p_source_label text,
  p_segments jsonb
) returns transcript_sessions language plpgsql security definer set search_path = public as $$
declare
  target_patient patients;
  session transcript_sessions;
  segment jsonb;
begin
  select * into target_patient from patients where id = p_patient_id;
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  if not user_has_clinic_role(target_patient.clinic_id, array['staff'::app_role, 'clinician'::app_role, 'admin'::app_role]) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  insert into transcript_sessions (clinic_id, patient_id, source_label, captured_by)
  values (target_patient.clinic_id, target_patient.id, p_source_label, auth.uid())
  returning * into session;

  for segment in select * from jsonb_array_elements(p_segments) loop
    insert into transcript_segments (session_id, speaker, start_ms, end_ms, text, confidence, uncertain)
    values (
      session.id,
      coalesce(segment->>'speaker', 'unknown'),
      (segment->>'start_ms')::integer,
      (segment->>'end_ms')::integer,
      segment->>'text',
      coalesce((segment->>'confidence')::numeric, 0.80),
      coalesce((segment->>'uncertain')::boolean, false)
    );
  end loop;

  insert into audit_events (clinic_id, actor_id, action_type, resource_type, resource_id, metadata)
  values (target_patient.clinic_id, auth.uid(), 'voice.transcript_created', 'transcript_session', session.id,
          jsonb_build_object('segment_count', jsonb_array_length(p_segments), 'source_label_present', p_source_label is not null));
  return session;
end;
$$;
