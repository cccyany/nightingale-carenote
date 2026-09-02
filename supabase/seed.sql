-- Auth users are created by scripts/bootstrap-supabase-demo.mjs through
-- Supabase Auth Admin. That is safer for hosted projects than inserting
-- directly into auth.users.

-- Keep the golden Jane Tan demo readable after repeated integration runs.
-- These patterns target only synthetic test artifacts; fixed longitudinal demo
-- records use stable UUIDs below and are preserved.
delete from tasks
where title like 'Synthetic collaboration follow-up%';

delete from patient_facing_content
where title like 'Synthetic patient approval%'
   or title like 'Synthetic rejected draft%'
   or title like 'Synthetic low trust draft%'
   or title like 'Synthetic approved summary%'
   or title like 'Synthetic dosage approval%'
   or title like 'Synthetic generated patient draft%'
   or title like 'Synthetic manual patient draft%'
   or title like 'Synthetic multi-source patient draft%'
   or title like 'Synthetic partial-date patient draft%'
   or title like 'Synthetic versioned patient draft%'
   or title = 'Synthetic unresolved draft';

delete from transcript_sessions
where source_label like 'Synthetic ambient consult test%';

delete from highlights
where title like 'Synthetic baseline cough candidate%'
   or title like 'Synthetic future cough candidate%'
   or title like 'Synthetic exposure baseline%'
   or title like 'Synthetic exposed future%'
   or title like 'Synthetic rejection baseline%'
   or title like 'Synthetic rejection future%'
   or title like 'Synthetic Clinic A learning item%'
   or title like 'Synthetic Clinic B comparison item%'
   or title like 'Synthetic safety baseline%'
   or title like 'Synthetic safety future%'
   or title like 'Synthetic unsupported candidate%';

with test_entries as (
  select ce.id
  from care_entries ce
  where ce.patient_id = '30000000-0000-0000-0000-000000000001'
    and (
      ce.content like 'Synthetic collaboration note %'
      or ce.content like 'Synthetic initial plan %'
      or ce.content in (
        'Synthetic revision base.',
        'Synthetic revision middle.',
        'Synthetic audit base.',
        'Synthetic audit updated content.',
        'Synthetic updated clinician plan.',
        'Synthetic staff independent update.',
        'Synthetic clinician independent update.',
        'Synthetic first writer wins.',
        'Synthetic stale overwrite attempt.',
        'Synthetic clinician cross-role overwrite attempt.',
        'Synthetic ambient summary.'
      )
      or ce.content like 'Synthetic staff base %'
      or ce.content like 'Synthetic clinician base %'
      or ce.content like 'Synthetic concurrent base %'
      or ce.content like 'Synthetic staff-owned note %'
      or ce.content like 'Synthetic provenance base %'
      or ce.content like 'Synthetic extraction base %'
      or ce.content like 'Synthetic patient-facing source %'
      or ce.content like 'Synthetic patient-facing V1 source %'
      or ce.content like 'Patient: No known allergies. %'
      or ce.content like 'Nurse: Penicillin allergy. %'
    )
),
test_spans as (
  select psn.id
  from provenance_spans psn
  join provenance_sources ps on ps.id = psn.source_id
  where ps.source_entry_id in (select id from test_entries)
     or psn.entry_id in (select id from test_entries)
),
deleted_feedback as (
  delete from importance_feedback ifb
  using highlights h
  where ifb.highlight_id = h.id
    and h.provenance_span_id in (select id from test_spans)
  returning ifb.id
),
deleted_glance as (
  delete from glance_items gi
  where gi.provenance_span_id in (select id from test_spans)
     or gi.highlight_id in (
      select h.id from highlights h where h.provenance_span_id in (select id from test_spans)
     )
  returning gi.id
),
deleted_highlights as (
  delete from highlights h
  where h.provenance_span_id in (select id from test_spans)
  returning h.id
),
deleted_conflicts as (
  delete from fact_conflicts fc
  where fc.fact_a_id in (
      select cf.id from clinical_facts cf where cf.source_entry_id in (select id from test_entries)
         or cf.provenance_span_id in (select id from test_spans)
    )
     or fc.fact_b_id in (
      select cf.id from clinical_facts cf where cf.source_entry_id in (select id from test_entries)
         or cf.provenance_span_id in (select id from test_spans)
    )
  returning fc.id
),
deleted_facts as (
  delete from clinical_facts cf
  where cf.source_entry_id in (select id from test_entries)
     or cf.provenance_span_id in (select id from test_spans)
  returning cf.id
),
deleted_patient_content_sources as (
  delete from patient_content_sources pcs
  where pcs.provenance_span_id in (select id from test_spans)
     or pcs.source_entry_id in (select id from test_entries)
  returning pcs.id
),
deleted_spans as (
  delete from provenance_spans psn
  where psn.id in (select id from test_spans)
  returning psn.id
),
deleted_sources as (
  delete from provenance_sources ps
  where ps.source_entry_id in (select id from test_entries)
  returning ps.id
)
delete from care_entries ce
where ce.id in (select id from test_entries);

delete from care_entries ce
where ce.patient_id = '30000000-0000-0000-0000-000000000001'
  and (
    ce.content like 'Synthetic collaboration note %'
    or ce.content like 'Synthetic initial plan %'
    or ce.content in (
      'Synthetic revision base.',
      'Synthetic revision middle.',
      'Synthetic audit base.',
      'Synthetic audit updated content.',
      'Synthetic updated clinician plan.',
      'Synthetic staff independent update.',
      'Synthetic clinician independent update.',
      'Synthetic first writer wins.',
      'Synthetic stale overwrite attempt.',
      'Synthetic clinician cross-role overwrite attempt.',
      'Synthetic ambient summary.'
    )
    or ce.content like 'Synthetic staff base %'
    or ce.content like 'Synthetic clinician base %'
    or ce.content like 'Synthetic concurrent base %'
    or ce.content like 'Synthetic staff-owned note %'
    or ce.content like 'Synthetic provenance base %'
    or ce.content like 'Synthetic extraction base %'
    or ce.content like 'Synthetic patient-facing source %'
    or ce.content like 'Synthetic patient-facing V1 source %'
    or ce.content like 'Patient: No known allergies. %'
    or ce.content like 'Nurse: Penicillin allergy. %'
  )
  and not exists (
    select 1 from provenance_sources ps where ps.source_entry_id = ce.id
  );

insert into clinics (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Clinic A'),
  ('20000000-0000-0000-0000-000000000002', 'Clinic B')
on conflict (id) do nothing;

insert into profiles (id, display_name, primary_role) values
  ('10000000-0000-0000-0000-000000000001', 'Jane Tan', 'patient'),
  ('10000000-0000-0000-0000-000000000002', 'Sam Lee', 'staff'),
  ('10000000-0000-0000-0000-000000000003', 'Dr Mina Koh', 'clinician'),
  ('10000000-0000-0000-0000-000000000004', 'Avery Ong', 'admin'),
  ('10000000-0000-0000-0000-000000000005', 'Bo Chen', 'staff')
on conflict (id) do nothing;

insert into clinic_memberships (clinic_id, profile_id, role) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'patient'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'staff'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'clinician'),
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 'admin'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'staff')
on conflict do nothing;

insert into platform_admins (profile_id) values
  ('10000000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into patients (id, clinic_id, profile_id, display_name, date_of_birth, synthetic) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Jane Tan', '1968-08-26', true),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', null, 'Alex Lim', '1982-02-14', true)
on conflict (id) do nothing;

insert into care_entries (id, clinic_id, patient_id, author_role, author_id, entry_type, visibility, content, occurred_at) values
  ('40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'clinician', '10000000-0000-0000-0000-000000000003', 'clinician_note', 'clinician_internal', 'Penicillin allergy documented.', '2025-04-15T09:00:00Z'),
  ('40000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'system', null, 'ai_nurse_consult_summary', 'ai_internal', 'Patient reports no known drug allergies.', '2026-02-06T10:30:00Z'),
  ('40000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'system', null, 'ai_patient_session_summary', 'ai_internal', 'Patient reports a nocturnal cough persisting for approximately three weeks.', '2026-08-26T08:15:00Z'),
  ('40000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'system', null, 'ai_doctor_consult_summary', 'ai_internal', 'Persistent nocturnal cough discussed. Repeat renal panel discussed.', '2026-08-26T11:00:00Z'),
  ('40000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'staff', '10000000-0000-0000-0000-000000000002', 'staff_note', 'staff_internal', 'Repeat renal panel has not yet been ordered.', '2026-08-26T14:00:00Z'),
  ('40000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'clinician', '10000000-0000-0000-0000-000000000003', 'instruction', 'patient_approved', 'Please attend the scheduled follow-up appointment.', '2026-08-26T15:00:00Z'),
  ('40000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'staff', '10000000-0000-0000-0000-000000000005', 'staff_note', 'staff_internal', 'Synthetic Clinic B internal note.', '2026-08-26T12:00:00Z')
on conflict (id) do nothing;

insert into entry_versions (entry_id, version_number, content, changed_by, change_reason)
select id, 1, content, author_id, 'initial synthetic seed'
from care_entries
on conflict do nothing;

insert into comments (id, clinic_id, patient_id, entry_id, author_id, visibility, body) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'internal', 'Internal reminder for clinician review.')
on conflict (id) do nothing;

insert into tasks (id, clinic_id, patient_id, source_entry_id, title, assignee_id, created_by, status, due_date) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000005', 'Order repeat renal panel', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'open', '2026-08-28')
on conflict (id) do nothing;
