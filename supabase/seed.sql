-- Auth users are created by scripts/bootstrap-supabase-demo.mjs through
-- Supabase Auth Admin. That is safer for hosted projects than inserting
-- directly into auth.users.

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
