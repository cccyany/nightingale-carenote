update provenance_spans
set char_start = 0,
    char_end = 44,
    evidence_text = 'Repeat renal panel has not yet been ordered.'
where id = '71000000-0000-0000-0000-000000000004';

update provenance_spans
set char_start = 18,
    char_end = 74,
    evidence_text = 'nocturnal cough persisting for approximately three weeks'
where id = '71000000-0000-0000-0000-000000000003';
