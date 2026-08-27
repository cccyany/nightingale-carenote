insert into care_entries (id, clinic_id, patient_id, author_role, author_id, entry_type, visibility, content, current_version, occurred_at)
values
  (
    '40000000-0000-0000-0000-000000000008',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'clinician',
    '10000000-0000-0000-0000-000000000003',
    'clinician_note',
    'clinician_internal',
    'Metformin active. Metformin 500 mg twice daily documented.',
    1,
    '2026-08-25T09:00:00Z'
  ),
  (
    '40000000-0000-0000-0000-000000000009',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'system',
    null,
    'ai_doctor_consult_summary',
    'ai_internal',
    'AI summary states metformin stopped and metformin 1000 mg twice daily.',
    1,
    '2026-08-26T12:30:00Z'
  )
on conflict (id) do nothing;

insert into entry_versions (entry_id, version_number, content, changed_by, change_reason)
select id, 1, content, author_id, 'initial medication conflict demo'
from care_entries
where id in ('40000000-0000-0000-0000-000000000008', '40000000-0000-0000-0000-000000000009')
on conflict do nothing;

insert into provenance_sources (id, clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label)
select '70000000-0000-0000-0000-000000000008', e.clinic_id, e.patient_id, e.id, v.id, 'entry', 'Medication clinician note'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000008'
on conflict (id) do update set source_version_id = excluded.source_version_id;

insert into provenance_sources (id, clinic_id, patient_id, source_entry_id, source_version_id, source_kind, source_label)
select '70000000-0000-0000-0000-000000000009', e.clinic_id, e.patient_id, e.id, v.id, 'entry', 'Medication AI consult summary'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000009'
on conflict (id) do update set source_version_id = excluded.source_version_id;

insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, evidence_text)
select '71000000-0000-0000-0000-000000000008', '70000000-0000-0000-0000-000000000008', e.id, v.id, 0, 16, 'Metformin active'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000008'
on conflict (id) do update set entry_version_id = excluded.entry_version_id, char_start = excluded.char_start, char_end = excluded.char_end, evidence_text = excluded.evidence_text;

insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, evidence_text)
select '71000000-0000-0000-0000-000000000009', '70000000-0000-0000-0000-000000000008', e.id, v.id, 18, 34, 'Metformin 500 mg'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000008'
on conflict (id) do update set entry_version_id = excluded.entry_version_id, char_start = excluded.char_start, char_end = excluded.char_end, evidence_text = excluded.evidence_text;

insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, evidence_text)
select '71000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000009', e.id, v.id, 18, 35, 'metformin stopped'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000009'
on conflict (id) do update set entry_version_id = excluded.entry_version_id, char_start = excluded.char_start, char_end = excluded.char_end, evidence_text = excluded.evidence_text;

insert into provenance_spans (id, source_id, entry_id, entry_version_id, char_start, char_end, evidence_text)
select '71000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000009', e.id, v.id, 40, 57, 'metformin 1000 mg'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000009'
on conflict (id) do update set entry_version_id = excluded.entry_version_id, char_start = excluded.char_start, char_end = excluded.char_end, evidence_text = excluded.evidence_text;

insert into clinical_facts (id, clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion, authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id, extraction_method, review_status)
select '74000000-0000-0000-0000-000000000001', e.clinic_id, e.patient_id, 'allergy', 'penicillin', null, null, 'present', e.author_role, '71000000-0000-0000-0000-000000000001', 1.00, e.id, v.id, 'deterministic_seed', 'confirmed'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000001'
on conflict (id) do nothing;

insert into clinical_facts (id, clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion, authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id, extraction_method, review_status)
select '74000000-0000-0000-0000-000000000002', e.clinic_id, e.patient_id, 'allergy', 'penicillin', null, null, 'absent', e.author_role, '71000000-0000-0000-0000-000000000002', 0.90, e.id, v.id, 'deterministic_seed', 'needs_review'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000002'
on conflict (id) do nothing;

insert into clinical_facts (id, clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion, authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id, extraction_method, review_status)
select '74000000-0000-0000-0000-000000000003', e.clinic_id, e.patient_id, 'medication', 'metformin', null, null, 'present', e.author_role, '71000000-0000-0000-0000-000000000008', 1.00, e.id, v.id, 'deterministic_seed', 'confirmed'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000008'
on conflict (id) do nothing;

insert into clinical_facts (id, clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion, authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id, extraction_method, review_status)
select '74000000-0000-0000-0000-000000000004', e.clinic_id, e.patient_id, 'medication', 'metformin', null, null, 'absent', e.author_role, '71000000-0000-0000-0000-000000000010', 0.90, e.id, v.id, 'deterministic_seed', 'needs_review'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000009'
on conflict (id) do nothing;

insert into clinical_facts (id, clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion, authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id, extraction_method, review_status)
select '74000000-0000-0000-0000-000000000005', e.clinic_id, e.patient_id, 'dosage', 'metformin', '500', 'mg', 'present', e.author_role, '71000000-0000-0000-0000-000000000009', 1.00, e.id, v.id, 'deterministic_seed', 'confirmed'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000008'
on conflict (id) do nothing;

insert into clinical_facts (id, clinic_id, patient_id, entity_type, normalized_entity, value, unit, assertion, authority_role, provenance_span_id, evidence_confidence, source_entry_id, source_version_id, extraction_method, review_status)
select '74000000-0000-0000-0000-000000000006', e.clinic_id, e.patient_id, 'dosage', 'metformin', '1000', 'mg', 'present', e.author_role, '71000000-0000-0000-0000-000000000011', 0.90, e.id, v.id, 'deterministic_seed', 'needs_review'
from care_entries e join entry_versions v on v.entry_id = e.id and v.version_number = 1
where e.id = '40000000-0000-0000-0000-000000000009'
on conflict (id) do nothing;

select detect_fact_conflicts_for_patient('30000000-0000-0000-0000-000000000001');
