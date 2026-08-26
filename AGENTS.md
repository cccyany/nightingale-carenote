# Nightingale CareNote — Codex Engineering Rules

## 1. Project Goal

Build a safe, trustworthy longitudinal patient care-note web application for the Nightingale 72 Hour Build.

The core product principle is:

**AI proposes. Humans verify. Provenance proves.**

The application must prioritize:
1. Glanceability
2. Clinical trust
3. Provenance
4. Role-based collaboration
5. Security and privacy
6. Auditability

Do not add features that do not directly support the Candidate Brief unless all required functionality is complete.

---

## 2. Technology

Preferred stack:

- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- PostgreSQL / Supabase
- Supabase Auth
- PostgreSQL Row Level Security (RLS)
- Python + pytest for required micro-tests
- Playwright where useful for E2E tests

Keep the architecture simple enough for a 72-hour prototype.

Do not introduce microservices unless absolutely necessary.

---

## 3. Synthetic Data Only

This project must use synthetic patient data only.

Never add real patient data, real medical records, or real PHI to:

- source code
- seed files
- tests
- logs
- screenshots
- documentation
- demo recordings

---

## 4. Mandatory PHI Redaction Gate

Raw names, IC/ID numbers, and phone numbers must never be sent to an LLM.

Every LLM request containing patient-derived text MUST follow:

raw input
→ redact
→ verify redaction
→ LLM

All LLM calls must go through one centralized safe AI gateway.

Do not create direct LLM API calls elsewhere in the application.

If redaction verification fails:

- abort the LLM request
- return a safe failure / needs-review state
- record metadata about the failure without recording PHI

Never silently bypass the redaction gate.

---

## 5. AI-Scribed Notes

AI-scribed notes must always be distinguishable from human-authored notes.

Use:

author_role = system

Supported AI entry types include:

- ai_doctor_consult_summary
- ai_nurse_consult_summary
- ai_patient_session_summary

AI-scribed source records must remain traceable.

Human corrections must not silently overwrite the original AI source.

Corrections should create:

- a new version,
- a new clinician/staff entry,
- or a canonical clinical fact that supersedes the previous interpretation.

---

## 6. Provenance

Every AI-derived highlight must have a provenance pointer.

A provenance pointer must resolve to:

- the source entry
- the relevant entry version
- the exact source span where possible
- source timestamps where the source is a transcript

Do not consider this sufficient:

provenance_pointer != null

Tests must actually resolve the pointer and verify that the referenced evidence exists.

If provenance cannot be resolved, the item must not be promoted as a trusted clinical fact or high-confidence highlight.

---

## 7. RBAC

Authorization must never be implemented only in the UI.

Enforce access control at two levels:

1. Server/backend authorization
2. PostgreSQL/Supabase Row Level Security

Minimum roles:

- patient
- staff
- clinician
- admin

All staff, clinician, and admin access must be clinic-scoped.

Users from Clinic A must not access Clinic B data.

### Patient

Patient may access only explicitly patient-safe and approved content.

Patient must never access:

- raw AI-scribed notes
- internal staff comments
- clinician internal comments
- clinician-only notes
- staff-only notes
- unapproved AI-generated patient guidance

### Staff

Staff may:

- read permitted clinic-scoped patient context
- create staff notes
- edit permitted staff-owned sections
- create comments
- create/receive tasks

Staff must not overwrite clinician-authored sections.

### Clinician

Clinician may:

- read clinic-scoped staff notes
- read AI-scribed notes
- create and edit clinician sections
- review AI suggestions
- resolve clinical conflicts
- approve patient-facing clinical content

Clinicians must not silently overwrite staff-authored notes.

### Admin

Admin has clinic-scoped oversight only.

Admin access must not cross clinic boundaries.

---

## 8. Patient-Facing Safety

AI-generated clinical guidance must never be shown directly to patients without the required approval workflow.

Default workflow:

AI draft
→ pending human approval
→ clinician approval
→ patient-visible

Internal AI content and raw AI-scribed notes must never be exposed to patients.

Patient-facing generation is considered a higher-severity operation.

---

## 9. Revision History

Clinical edits must have immutable revision history.

Editing version N creates version N+1.

Never destroy previous versions.

Reverting to an older version must create a new version containing the older content.

Example:

V1
→ V2
→ V3
→ revert to V1
→ V4 containing V1 content

V2 and V3 must remain in history.

---

## 10. Audit Logs

All important writes must generate audit metadata.

Audit logs may contain:

- actor ID
- action type
- resource ID
- timestamp
- previous version number
- new version number
- request ID

Audit logs must not contain raw clinical note contents or PHI.

---

## 11. Concurrent Editing

Never silently use last-write-wins for clinical text.

Prefer section-level editing so different roles can safely edit different sections concurrently.

Use optimistic concurrency control for the same section.

A write should include an expected version.

If the current version has changed, return a deterministic conflict such as HTTP 409.

The UI should allow the user to review the conflict.

---

## 12. Risk Logic

Do not treat LLM-generated risk labels as authoritative.

Safety-critical classes must have deterministic minimum risk floors.

Examples:

- allergy contradiction → HIGH minimum
- medication contradiction → HIGH minimum
- medication dose contradiction → HIGH minimum
- unresolved critical task → HIGH minimum

The model may suggest additional prioritization but must never lower a deterministic safety floor.

---

## 13. Confidence

Do not display arbitrary LLM self-reported confidence as clinical confidence.

Confidence must represent evidence quality.

Possible factors include:

- clinician confirmation
- deterministic structured match
- exact provenance resolution
- source ambiguity
- contradictions
- extraction validation

Low-confidence or unsupported extraction should abstain rather than silently become clinical truth.

---

## 14. Abstention

The system must support a needs-review / abstain state.

Abstain when appropriate, including when:

- provenance cannot be resolved
- redaction validation fails
- evidence is too ambiguous
- extraction validation fails
- confidence is below the accepted threshold

Abstained information must not silently become a canonical clinical fact.

---

## 15. Conflict Detection

Scope clinical contradiction detection primarily to:

- allergies
- medications
- dosage
- frequency

Do not automatically resolve clinically meaningful contradictions.

Conflicts should remain visible until explicitly reviewed when appropriate.

Store:

- conflicting facts
- provenance for both facts
- resolution status
- resolver
- resolution timestamp
- resolution reason

---

## 16. Glance View

The Glance View must be understandable in under 10 seconds.

Do not overload it.

Prefer a maximum of 3–5 active items.

Each important item should answer:

1. What happened?
2. Why does it matter?
3. What is its status?
4. Where did it come from?
5. What action is available?

Every highlight must expose a risk_reason and provenance.

---

## 17. Importance Ranking

Importance is not the same as clinical risk.

Importance ranking may combine:

- deterministic risk
- unresolved actions
- recency
- clinician confirmation
- clinical entity priority
- bounded learned feedback
- age/decay

The ranking logic must remain explainable.

---

## 18. Self-Learning Safety

The adaptive importance mechanism may adjust ranking based on interactions such as:

- clinician confirmation
- manual highlight
- pin
- comment
- rejection

Track exposure separately from rejection.

An item that was never shown must not be interpreted as rejected.

Adaptive learning must be bounded.

Learning must never reduce deterministic safety floors for critical information.

Dismissal under workload must not permanently suppress safety-critical classes.

---

## 19. Data Decay

Data decay must never delete the source-of-truth clinical history.

Older data may receive lower retrieval/ranking weight or compressed representations.

Safety-critical persistent information should not decay normally, including:

- allergies
- active medications
- unresolved conflicts
- unresolved tasks
- clinician-confirmed persistent conditions

Storage/ranking decay is not evidence deletion.

---

## 20. Performance

The warm-path P95 latency for the consult Glance View must be <= 300 ms.

Do not invoke an LLM during the warm Glance read path.

Prefer precomputed/materialized glance items.

Performance claims must be supported by a reproducible benchmark.

Document:

- request count
- concurrency
- environment
- P50
- P95
- P99 where available

---

## 21. Required Tests

The project must include:

- tests/test_rbac_scope.py
- tests/test_revision_history.py
- tests/test_highlight_provenance.py
- tests/test_concurrent_edits.py
- tests/test_self_learning_importance.py

Also create:

- tests/test_redaction.py

Tests must validate real boundaries and behavior rather than only checking UI state.

Never weaken a test simply to make the implementation pass.

---

## 22. Development Discipline

Before completing a milestone, run relevant validation.

Where available:

npm run lint
npm run typecheck
npm test
pytest

Fix implementation failures instead of deleting assertions.

Keep commits focused and descriptive.

Do not perform unrelated refactors while implementing a milestone.

---

## 23. Scope Discipline

Prioritize in this order:

1. RBAC and clinic isolation
2. Longitudinal timeline
3. Revision history
4. Provenance
5. Glance View
6. Redaction
7. AI Scribe integration
8. Required tests
9. Conflict detection
10. Risk / confidence / abstention
11. Patient-facing approval
12. Concurrent editing
13. Self-learning
14. Data decay
15. Ambient voice capture
16. Visual polish

Do not sacrifice core safety or trust requirements for optional polish.

---

## 24. Definition of Done

A feature is not complete merely because the UI renders.

It is complete only when:

- backend behavior exists
- authorization is enforced
- persistence works
- failure states are handled
- relevant tests pass
- provenance/audit requirements are satisfied where applicable