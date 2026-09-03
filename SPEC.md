# Nightingale CareNote — Product & Technical Specification

## 1. Product Statement

Nightingale CareNote is a shared longitudinal patient context workspace that supplements an Electronic Health Record.

It brings together:

- clinician notes
- staff notes
- patient-provided insights
- AI doctor-consult summaries
- AI nurse-consult summaries
- AI-patient session summaries
- tasks
- comments
- system events

into one trustworthy longitudinal timeline.

The core promise is:

**Know what matters. Know why. Know where it came from.**

The system must not allow AI-generated information to silently become clinical truth.

---

# 2. Core Demo Patient

Use synthetic data only.

Primary synthetic patient:

Jane Tan
58 years old
Clinic A

Synthetic longitudinal history:

### April 15, 2025

Clinician note:

Penicillin allergy documented.

### February 6, 2026

AI nurse consult summary:

Patient reports no known drug allergies.

This creates an allergy contradiction requiring review.

### August 26, 2026 — AI Patient Session

Patient reports a nocturnal cough persisting for approximately three weeks.

### August 26, 2026 — Doctor Consult

AI-scribed consult indicates:

- persistent nocturnal cough
- repeat renal panel discussed

### August 26, 2026 — Staff Follow-up

Repeat renal panel has not yet been ordered.

This should create an unresolved action.

---

# 3. Application Routes

Minimum routes:

/login

/patients

/patients/[id]

/patients/[id]/history

/patient/me

Do not create unnecessary product areas before the required functionality is complete.

---

# 4. Main CareNote Page

The main patient page contains:

## Patient Header

Display basic synthetic patient context.

## Care Glance

Display a maximum of approximately 3–5 highest-priority actionable items.

Example:

1. Allergy conflict
2. Outstanding renal panel
3. Clinician-confirmed persistent cough

## Timeline Filters

Allow filtering by:

- All
- AI Scribe
- Clinician
- Staff
- Patient
- System

## Longitudinal Timeline

Display all permitted patient context chronologically.

---

# 5. Timeline Entry Types

Supported entry types:

- patient_note
- staff_note
- clinician_note
- ai_doctor_consult_summary
- ai_nurse_consult_summary
- ai_patient_session_summary
- instruction
- admin_event
- system_event

Every entry stores:

- id
- clinic_id
- patient_id
- author_role
- author_id where applicable
- entry_type
- timestamp
- visibility
- content
- current_version
- source/provenance relationship where applicable

AI-scribed entries must use:

author_role = system

---

# 6. Collaboration

Users with permission may:

- add notes
- comment on entries
- reply to comments
- resolve/unresolve comments
- mention permitted clinic users
- assign follow-up tasks

Comments must retain author and timestamp metadata.

Tasks should support:

- title
- assignee
- source entry
- status
- optional due date

---

# 7. Revision History

Every editable note/section must support immutable version history.

Required behavior:

Edit V1
→ creates V2

Revert V1 while current version is V2
→ creates V3 containing V1 content

Do not delete V2.

History must display:

- version number
- changed by
- timestamp
- change metadata
- revert relationship where applicable

---

# 8. Concurrency

Different sections should be independently editable where practical.

Same-section edits use optimistic concurrency.

Client submits:

expected_version

If database version differs:

return deterministic conflict / HTTP 409

Never silently overwrite the newer clinical text.

---

# 9. Provenance

Every AI-derived highlight must point to evidence.

Provenance should support:

- source entry
- source version
- character/span offsets where applicable
- transcript timestamps where applicable
- evidence text

Clicking "View Source" from a Glance item must navigate to the relevant timeline entry and visually identify the evidence span.

A highlight without valid provenance must not be promoted as trusted information.

---

# 10. Glance Item Model

Each Glance item should contain:

- title
- short summary
- status
- risk level
- risk reason
- importance score
- provenance pointer
- available action
- confirmation status

Example:

ALLERGY CONFLICT

Penicillin allergy documented in April 2025 conflicts with a February 2026 AI nurse note stating no known drug allergies.

Risk reason:
Allergy contradiction.

Actions:
Review conflict
View sources

---

# 11. Risk Model

Use deterministic safety floors.

Initial rules:

ALLERGY_CONFLICT
minimum risk = HIGH

MEDICATION_CONFLICT
minimum risk = HIGH

MEDICATION_DOSE_CONFLICT
minimum risk = HIGH

UNRESOLVED_CRITICAL_TASK
minimum risk = HIGH

UNRESOLVED_TASK
minimum risk = MEDIUM

LLM suggestions cannot lower these floors.

Risk must remain separate from importance.

---

# 12. Evidence Confidence

Do not use arbitrary model self-confidence.

Initial evidence confidence policy:

1.00
clinician-authored or explicitly clinician-confirmed

0.95
clinician-confirmed AI extraction

0.90
deterministic structured extraction with valid provenance

0.75
validated AI extraction with exact supporting provenance and no detected contradiction

0.50
ambiguous or weakly supported extraction

Below accepted threshold:
abstain / needs review

These values are prototype semantics and must be documented as evidence-quality categories rather than calibrated clinical probabilities.

---

# 13. Abstention

An extracted candidate must enter needs-review rather than trusted state when:

- provenance cannot resolve
- evidence span does not match source
- redaction verification fails
- extraction is structurally invalid
- evidence confidence is below threshold
- ambiguity prevents safe interpretation

---

# 14. PHI Redaction Pipeline

All patient-derived text going to an LLM must follow:

RAW INPUT
→ REDACTION
→ REDACTION VERIFICATION
→ LLM

Required redaction classes:

- names
- IC/ID numbers
- phone numbers

If verification fails:

BLOCK LLM CALL

Use synthetic test cases to evaluate redaction behavior.

Ambient audio is a separate boundary: raw audio reaches the ASR provider before transcript text exists. The transcript then follows the redaction and verification path before downstream generative LLM summarization.

---

# 15. AI Extraction

Prefer structured extraction over unconstrained generation for clinical facts.

Expected output should include fields such as:

- entity_type
- normalized entity/value
- assertion
- evidence text
- evidence offsets
- source relationship

After receiving model output:

validate the evidence against the redacted source.

If the claimed evidence cannot be found:

reject or abstain.

---

# 16. AI Scribe Integration

Support:

- doctor-patient consult summaries
- nurse-patient consult summaries
- AI-patient session summaries

All are distinct timeline entries.

Every AI-scribed entry must include provenance to its original source/session.

UI must visibly identify AI content.

Suggested label:

AI-SCRIBED
Not clinician verified

Once confirmed:

Clinician confirmed

---

# 17. Clinical Facts

Create normalized clinical facts primarily for:

- allergy
- medication
- dosage
- frequency

Each fact should retain provenance.

Possible fields:

- id
- patient_id
- entity_type
- normalized_entity
- value
- unit
- assertion
- authority/source role
- provenance_span_id
- created_at
- superseded_by

---

# 18. Conflict Detection

Detect contradictions primarily for:

- allergies
- medications
- dosage
- frequency

Example:

Source A:
Penicillin allergy = present

Source B:
Penicillin allergy = absent

Create a fact conflict.

Do not automatically erase either source.

Clinician may resolve using:

- accept source A
- accept source B
- needs further review

Store resolution metadata.

---

# 19. Importance Ranking

Prototype importance formula may combine:

risk floor
+ unresolved action
+ recency
+ clinician confirmation
+ clinical entity priority
+ adaptive feedback
- age decay

Example initial weights:

HIGH risk: +50
MEDIUM risk: +25

Unresolved task: +30

Clinician confirmed: +20

Allergy/medication entity: +20
Chief complaint: +12

Created within 7 days: +10
Created within 30 days: +5

Weights must remain explainable.

---

# 20. Adaptive Importance Learning

Record interactions including:

- exposure
- manual highlight
- pin
- clinician confirmation
- comment
- rejection

Learning operates at clinic level rather than globally.

Example:

feature_key = medication

Track:

- exposures
- positive interactions
- rejections

Adaptive boost must be bounded.

Example maximum:

+15 importance points

Learning must never reduce safety-critical deterministic floors.

Exposure bias must be acknowledged:

not surfaced != rejected

---

# 21. Patient View

Patient view must expose only safe approved information.

Patient may see:

- approved patient-facing summaries
- approved instructions
- appropriate follow-up actions
- their own submitted insights

Patient must not see:

- raw AI-scribed notes
- internal staff comments
- internal clinician comments
- internal clinical reasoning
- unapproved AI-generated guidance

AI-generated patient-facing clinical guidance requires clinician approval before publication.

---

# 22. Data Decay

Prototype policy:

HOT:
< 90 days

WARM:
90–365 days

COLD:
> 365 days

Decay may affect:

- retrieval weight
- ranking weight
- cached summary representation

Decay must not delete source-of-truth history.

Persistent safety information should resist decay:

- allergies
- active medications
- unresolved conflicts
- unresolved tasks
- clinician-confirmed persistent conditions

---

# 23. Ambient Voice Capture — Bonus

If implementation time permits:

Support post-consult synthetic consult audio.

Pipeline:

audio
→ ASR transcription
→ speaker-labelled timestamped segments
→ transcript persistence
→ PHI redaction before downstream generative LLM
→ AI-scribed entry
→ deterministic extraction/conflicts/Glance
→ direct transcript-segment provenance

Low-confidence transcript segments should be marked uncertain and should not automatically produce high-risk canonical facts.

This bonus path is post-consult only. It does not implement realtime streaming, live alerts, or production multilingual/noisy-room ASR guarantees.

This feature must not compromise completion of core requirements.

---

# 24. RBAC Acceptance Criteria

## Patient

PASS when:

- can retrieve approved patient-facing content
- cannot retrieve internal comments through direct API
- cannot retrieve raw AI-scribed notes through direct API
- cannot retrieve clinician/staff internal notes

## Staff

PASS when:

- can create permitted staff note
- cannot overwrite clinician note
- cannot access another clinic's patients

## Clinician

PASS when:

- can create/edit clinician section
- can read staff notes
- can read AI-scribed notes
- cannot silently overwrite staff note
- cannot access another clinic

## Admin

PASS when:

- has clinic-scoped oversight
- cannot access another clinic

---

# 25. Revision Acceptance Criteria

PASS when:

- editing increments version
- old version remains immutable
- revert creates a new version
- audit metadata identifies actor and versions
- audit log contains no raw clinical content

---

# 26. Provenance Acceptance Criteria

PASS when:

- AI-derived highlights contain provenance
- provenance resolves to an existing source
- referenced span is valid
- evidence text matches source
- View Source navigates to the correct timeline location

---

# 27. Concurrent Edit Acceptance Criteria

PASS when:

- staff and clinician editing separate sections do not overwrite each other
- two users editing the same version produce deterministic conflict behavior
- no silent last-write-wins occurs

---

# 28. Self-Learning Acceptance Criteria

PASS when:

- an item initially receives a baseline importance score
- simulated clinician interaction is recorded
- a similar subsequent item receives a bounded increase in ranking priority
- critical risk floors remain unchanged
- exposure is tracked separately from rejection

---

# 29. Performance Acceptance Criteria

Warm Glance path:

P95 <= 300 ms

Measure using reproducible performance test.

Warm path must not call an LLM.

Use precomputed Glance items where practical.

---

# 30. Required Automated Tests

Must include:

tests/test_rbac_scope.py

tests/test_revision_history.py

tests/test_highlight_provenance.py

tests/test_concurrent_edits.py

tests/test_self_learning_importance.py

Also include:

tests/test_redaction.py

---

# 31. Demo Scenarios

## Scenario A — Glance + Provenance

Staff opens Jane Tan.

Immediately sees:

- allergy conflict
- outstanding renal panel
- persistent cough

Staff clicks allergy conflict.

Application jumps to exact timeline evidence.

---

## Scenario B — Collaboration + Revision

Staff:

- adds note
- comments with clinician mention
- creates/assigns follow-up

Clinician:

- manually highlights AI-scribed phrase
- confirms it
- edits plan

Then demonstrate:

- revision history
- diff
- revert

---

## Scenario C — Longitudinal Context

Show:

April 2025
February 2026
August 2026

Explain:

- recency
- unresolved actions
- clinician confirmation
- risk floors
- bounded adaptive importance
- data decay

---

# 32. Security Demo

Demonstrate a patient attempting to retrieve an internal AI-scribed note.

Expected:

403 Forbidden

Explain:

The UI is not the security boundary.
Access is denied server-side and by database policy.

---

# 33. Redaction Demo

Use synthetic input containing:

- synthetic name
- synthetic ID
- synthetic phone

Show that the LLM-bound payload contains only placeholders.

Example:

[NAME_1]
[ID_1]
[PHONE_1]

---

# 34. Performance Demo / Evidence

Provide benchmark command and output.

Document:

- warm path
- number of requests
- concurrency
- P50
- P95
- P99 if available

---

# 35. Scope Trade-offs

Prefer:

- section-level optimistic concurrency over full CRDT
- full revision snapshots over complex diff storage
- deterministic safety rules over model-generated severity
- structured extraction over unconstrained generation
- bounded feedback ranking over online model training
- precomputed Glance state over synchronous AI generation

These choices prioritize safety, explainability, reliability and delivery speed.

---

# 36. Product Principle

The final system should make the following transition explicit:

AI suggested
→ evidence linked
→ rules evaluated
→ human reviewed
→ clinician confirmed
→ trusted care state

AI must never silently become clinical truth.
