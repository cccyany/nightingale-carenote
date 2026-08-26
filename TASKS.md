# Nightingale CareNote — Build Tasks

Deadline: 28 August 2026, 5:30 PM SGT

## Rules

- Work milestone by milestone.
- Read AGENTS.md and SPEC.md before implementation.
- Do not start later milestones while current milestone has failing required tests.
- Do not weaken tests to make implementation pass.
- Commit after stable milestones.
- Prioritize hard Candidate Brief requirements over polish.

---

# Phase 1 — Foundation

## M0 — Product Specification

- [x] Create AGENTS.md
- [x] Create SPEC.md
- [x] Create TASKS.md
- [x] Create ATTRIBUTION.txt

---

## M1 — Project Bootstrap

- [x] Initialize Next.js App Router project
- [x] Enable TypeScript
- [x] Configure Tailwind CSS
- [x] Configure environment variables
- [x] Add Supabase client/server setup
- [x] Add basic application shell
- [x] Confirm local application starts
- [x] Configure lint
- [x] Configure typecheck
- [x] Add pytest test environment
- [x] Document local startup

Definition of Done:

- application starts locally
- lint passes
- typecheck passes

Suggested commit:

chore: bootstrap Nightingale CareNote

---

# Phase 2 — Data & Security

## M2 — Database Schema

- [x] Create clinics
- [x] Create profiles/users mapping
- [x] Create clinic_memberships
- [x] Create patients
- [x] Create care_entries
- [x] Create entry_versions
- [x] Create comments
- [x] Create comment_mentions
- [x] Create tasks
- [x] Create provenance_sources
- [x] Create provenance_spans
- [x] Create highlights
- [x] Create clinical_facts
- [x] Create fact_conflicts
- [x] Create importance_feedback
- [x] Create glance_items
- [x] Create audit_events
- [x] Add indexes
- [x] Add timestamps
- [x] Add required foreign keys

Definition of Done:

Schema supports all required relationships from SPEC.md.

Suggested commit:

feat(db): add longitudinal care schema

---

## M3 — Synthetic Seed Data

- [x] Create Clinic A
- [x] Create Clinic B
- [x] Create patient demo user
- [x] Create staff demo user
- [x] Create clinician demo user
- [x] Create admin demo user
- [x] Create Clinic B isolation test user
- [x] Create synthetic Jane Tan patient
- [x] Seed April 15, 2025 clinician allergy note
- [x] Seed February 6, 2026 AI nurse note
- [x] Seed August 26, 2026 AI patient session
- [x] Seed August 26, 2026 AI doctor consult
- [x] Seed unresolved renal-panel staff follow-up

Definition of Done:

One synthetic patient supports all major demo scenarios.

Suggested commit:

feat(seed): add synthetic longitudinal demo patient

---

## M4 — Authentication + RBAC + RLS

- [x] Implement authentication
- [x] Implement clinic membership lookup
- [x] Implement backend authorization
- [x] Implement patient permissions
- [x] Implement staff permissions
- [x] Implement clinician permissions
- [x] Implement admin permissions
- [x] Implement clinic isolation
- [x] Add PostgreSQL/Supabase RLS
- [x] Protect internal API routes
- [x] Ensure UI checks are not the security boundary

Definition of Done:

Server and database reject unauthorized access.

Suggested commit:

feat(auth): enforce clinic-scoped RBAC and RLS

---

## M5 — RBAC Tests

- [x] Implement tests/test_rbac_scope.py
- [x] Test staff cannot edit clinician note
- [x] Test clinician cannot edit staff note
- [x] Test patient cannot retrieve internal comments
- [x] Test patient cannot retrieve raw AI-scribed note
- [x] Test staff cannot access Clinic B
- [x] Test clinician cannot access Clinic B
- [x] Test admin cannot access another clinic

Definition of Done:

All RBAC tests pass through real server/database boundaries.

Suggested commit:

test(auth): cover role and clinic isolation

---

# Phase 3 — Longitudinal Collaboration

## M6 — Patient CareNote Page

- [ ] Build patient header
- [ ] Build CareNote layout
- [ ] Build Timeline container
- [ ] Add date separators
- [ ] Add entry type badges
- [ ] Visually distinguish AI and human entries
- [ ] Add timeline filters

Definition of Done:

Synthetic longitudinal history is readable on one page.

Suggested commit:

feat(timeline): add longitudinal patient CareNote

---

## M7 — Notes & Collaboration

- [ ] Add staff note creation
- [ ] Add clinician note creation
- [ ] Add comments
- [ ] Add replies
- [ ] Add resolve
- [ ] Add unresolve
- [ ] Add @mentions
- [ ] Add task assignment
- [ ] Add task completion
- [ ] Enforce role ownership on writes

Suggested commit:

feat(collaboration): add comments mentions and tasks

---

# Phase 4 — Versioning

## M8 — Revision History

- [ ] Snapshot every editable version
- [ ] Increment version on edit
- [ ] Build history view
- [ ] Show version metadata
- [ ] Add basic diff view
- [ ] Implement revert
- [ ] Ensure revert creates a new version
- [ ] Preserve old versions
- [ ] Add audit metadata

Suggested commit:

feat(history): add immutable revisions and revert

---

## M9 — Revision Tests

- [ ] Implement tests/test_revision_history.py
- [ ] Assert edit increments version
- [ ] Assert revert restores prior content
- [ ] Assert revert creates new version
- [ ] Assert old versions remain
- [ ] Assert audit actor metadata
- [ ] Assert audit does not contain raw note contents

Definition of Done:

All revision tests pass.

---

## M10 — Concurrent Editing

- [ ] Separate independently editable sections where appropriate
- [ ] Add expected_version writes
- [ ] Implement optimistic locking
- [ ] Return HTTP 409 for stale same-section write
- [ ] Build conflict review UI
- [ ] Never silently use last-write-wins

Suggested commit:

feat(concurrency): add optimistic section locking

---

## M11 — Concurrent Edit Tests

- [ ] Implement tests/test_concurrent_edits.py
- [ ] Test separate sections survive concurrent edits
- [ ] Test same-section stale write returns conflict
- [ ] Verify no silent overwrite

---

# Phase 5 — Provenance

## M12 — Provenance Model

- [ ] Implement provenance sources
- [ ] Implement source spans
- [ ] Store entry/version relationship
- [ ] Store evidence text
- [ ] Store character offsets
- [ ] Support transcript timestamps
- [ ] Implement provenance resolver

Suggested commit:

feat(provenance): add resolvable evidence spans

---

## M13 — Provenance Navigation

- [ ] Add View Source button
- [ ] Navigate to source entry
- [ ] Scroll to exact timeline entry
- [ ] Highlight exact evidence span
- [ ] Support AI-scribed source navigation

---

## M14 — Provenance Tests

- [ ] Implement tests/test_highlight_provenance.py
- [ ] Generate highlight
- [ ] Resolve provenance pointer
- [ ] Assert source entry exists
- [ ] Assert source version exists
- [ ] Assert offsets are valid
- [ ] Assert evidence text matches referenced span

Definition of Done:

Every trusted highlight can prove its source.

---

# Phase 6 — Glance & Trust Logic

## M15 — Care Glance

- [ ] Build Glance View
- [ ] Limit active items to approximately 3–5
- [ ] Display title
- [ ] Display short explanation
- [ ] Display status
- [ ] Display risk reason
- [ ] Display evidence state
- [ ] Display available action
- [ ] Display View Source

Suggested commit:

feat(glance): add actionable Care Glance

---

## M16 — Deterministic Risk

- [ ] Implement allergy conflict risk floor
- [ ] Implement medication conflict risk floor
- [ ] Implement medication dose conflict risk floor
- [ ] Implement critical unresolved task floor
- [ ] Separate risk from importance
- [ ] Add explainable risk reason
- [ ] Ensure model cannot lower deterministic floor

Suggested commit:

feat(safety): add deterministic clinical risk floors

---

## M17 — Evidence Confidence + Abstention

- [ ] Implement evidence confidence semantics
- [ ] Detect unresolved provenance
- [ ] Detect ambiguous extraction
- [ ] Implement needs-review state
- [ ] Prevent unsupported candidate from becoming trusted fact
- [ ] Display evidence explanation instead of decorative model confidence

---

# Phase 7 — AI Safety Pipeline

## M18 — PHI Redaction

- [ ] Implement name redaction
- [ ] Implement ID/IC redaction
- [ ] Implement phone redaction
- [ ] Implement redaction verification
- [ ] Block LLM call on verification failure
- [ ] Centralize all LLM calls behind safe gateway
- [ ] Prevent PHI in AI logs

Suggested commit:

feat(ai): add mandatory PHI redaction gateway

---

## M19 — Redaction Tests

- [ ] Implement tests/test_redaction.py
- [ ] Test synthetic names
- [ ] Test synthetic IDs
- [ ] Test Singapore-style phone numbers
- [ ] Test verification failure
- [ ] Assert LLM adapter is not called after failure

---

## M20 — Structured AI Extraction

- [ ] Add LLM adapter interface
- [ ] Add deterministic/mock adapter for tests
- [ ] Add production LLM adapter
- [ ] Request structured facts
- [ ] Require evidence text
- [ ] Require source offsets
- [ ] Validate returned evidence
- [ ] Reject invalid evidence
- [ ] Abstain on unsupported extraction

Suggested commit:

feat(ai): add provenance-aware structured extraction

---

## M21 — AI Scribe Integration

- [ ] Add AI doctor consult entry
- [ ] Add AI nurse consult entry
- [ ] Add AI patient session entry
- [ ] Set author_role = system
- [ ] Add source/session IDs
- [ ] Add provenance
- [ ] Add AI-SCRIBED UI badge
- [ ] Add unverified status
- [ ] Add clinician-confirmed status

Suggested commit:

feat(ai): integrate typed AI-scribed timeline entries

---

# Phase 8 — Clinical Conflict Handling

## M22 — Clinical Facts

- [ ] Normalize allergy facts
- [ ] Normalize medication facts
- [ ] Normalize dosage
- [ ] Normalize frequency
- [ ] Link every fact to provenance

---

## M23 — Conflict Detection

- [ ] Detect allergy contradiction
- [ ] Detect medication contradiction
- [ ] Detect dose contradiction
- [ ] Detect frequency contradiction
- [ ] Create fact conflict records
- [ ] Preserve both sources
- [ ] Add clinician review
- [ ] Add resolution metadata
- [ ] Add Needs Further Review state

Suggested commit:

feat(conflicts): detect and review clinical contradictions

---

# Phase 9 — Importance Learning

## M24 — Explainable Importance Ranking

- [ ] Implement risk contribution
- [ ] Implement unresolved action contribution
- [ ] Implement recency contribution
- [ ] Implement clinician-confirmation contribution
- [ ] Implement entity priority
- [ ] Implement decay
- [ ] Persist explainable score components
- [ ] Rank Glance items

Suggested commit:

feat(glance): add explainable importance ranking

---

## M25 — Adaptive Importance

- [ ] Track exposure
- [ ] Track manual highlight
- [ ] Track pin
- [ ] Track clinician confirmation
- [ ] Track comments
- [ ] Track rejection
- [ ] Calculate clinic-specific adaptive boost
- [ ] Cap adaptive boost
- [ ] Prevent learning from lowering safety floors
- [ ] Treat exposure separately from rejection

Suggested commit:

feat(learning): add bounded importance feedback

---

## M26 — Self-Learning Test

- [ ] Implement tests/test_self_learning_importance.py
- [ ] Record baseline score
- [ ] Simulate clinician pin/confirmation
- [ ] Generate similar future candidate
- [ ] Assert increased bounded priority
- [ ] Assert critical risk floor remains unchanged

---

# Phase 10 — Patient Safety

## M27 — Patient View

- [ ] Build /patient/me
- [ ] Display patient's own submitted information
- [ ] Display approved summaries
- [ ] Display approved instructions
- [ ] Hide internal comments
- [ ] Hide raw AI notes
- [ ] Hide clinician/staff internal notes

---

## M28 — Patient Approval Workflow

- [ ] Create patient-facing AI draft
- [ ] Default draft to not visible
- [ ] Add clinician review
- [ ] Add approve action
- [ ] Record approver
- [ ] Record approval timestamp
- [ ] Only approved content becomes patient-visible

Suggested commit:

feat(patient): add clinician-approved patient summaries

---

# Phase 11 — Bonus

## M29 — Data Decay

- [ ] Implement HOT classification
- [ ] Implement WARM classification
- [ ] Implement COLD classification
- [ ] Reduce ranking weight for older ordinary context
- [ ] Exempt persistent safety information
- [ ] Preserve source history
- [ ] Document policy

Suggested commit:

feat(storage): add longitudinal data decay policy

---

## M30 — Ambient Voice Capture

Only start after all core requirements pass.

- [ ] Record/upload synthetic audio
- [ ] Transcribe audio
- [ ] Add speaker labels
- [ ] Add timestamps
- [ ] Redact before LLM extraction
- [ ] Create AI-scribed entry
- [ ] Link summary to transcript timestamps
- [ ] Mark uncertain transcript segments
- [ ] Document noisy/multilingual limitations

Suggested commit:

feat(voice): add synthetic ambient consult capture

---

# Phase 12 — Performance & Evaluation

## M31 — Glance Read Model

- [ ] Precompute Glance items
- [ ] Ensure warm read path has no LLM call
- [ ] Add indexes
- [ ] Optimize patient Glance query

---

## M32 — Performance Benchmark

- [ ] Create reproducible benchmark
- [ ] Run warm requests
- [ ] Record request count
- [ ] Record concurrency
- [ ] Record P50
- [ ] Record P95
- [ ] Record P99 where available
- [ ] Verify P95 <= 300 ms
- [ ] Document methodology

Suggested commit:

perf(glance): benchmark warm consult path

---

## M33 — Evaluation Fixtures

- [ ] Create redaction_cases.json
- [ ] Create extraction_cases.json
- [ ] Create conflict_cases.json
- [ ] Measure provenance resolution
- [ ] Measure redaction recall
- [ ] Record abstention cases
- [ ] Document limitations

---

# Phase 13 — Final Product

## M34 — UI Polish

Only after core tests pass.

- [ ] Improve Glance hierarchy
- [ ] Improve timeline readability
- [ ] Improve AI badges
- [ ] Improve conflict review UI
- [ ] Improve source highlighting
- [ ] Improve version diff UI
- [ ] Add loading states
- [ ] Add error states
- [ ] Add empty states
- [ ] Verify responsive layout

---

## M35 — README

- [ ] Product overview
- [ ] Architecture
- [ ] Setup instructions
- [ ] Environment variables
- [ ] Demo accounts
- [ ] RBAC explanation
- [ ] RLS explanation
- [ ] Redaction explanation
- [ ] AI trust model
- [ ] Provenance
- [ ] Risk semantics
- [ ] Confidence semantics
- [ ] Abstention
- [ ] Revision strategy
- [ ] Concurrency strategy
- [ ] Conflict detection
- [ ] Self-learning
- [ ] Data decay
- [ ] Performance methodology
- [ ] Test commands
- [ ] Known limitations
- [ ] Synthetic data disclaimer

---

## M36 — ATTRIBUTION

- [ ] List every external library
- [ ] List license for every library
- [ ] List models/services
- [ ] Verify license information from authoritative sources
- [ ] Do not guess licenses

---

## M37 — Technical Brief

2–3 pages.

- [ ] Architecture diagram
- [ ] Architecture explanation
- [ ] Comprehensive schema
- [ ] Trust model
- [ ] Provenance model
- [ ] Risk model
- [ ] Confidence semantics
- [ ] Abstention
- [ ] RBAC
- [ ] Redaction
- [ ] Performance
- [ ] Self-learning
- [ ] Data decay
- [ ] Assumptions
- [ ] Trade-offs

---

## M38 — Demo Video

Scenario A:

- [ ] Staff opens patient
- [ ] Glance understandable immediately
- [ ] Click AI-derived highlight
- [ ] Jump to exact source

Scenario B:

- [ ] Staff adds note
- [ ] Staff comments with @clinician
- [ ] Assign follow-up
- [ ] Clinician confirms AI phrase
- [ ] Clinician edits plan
- [ ] Show revision
- [ ] Revert version

Scenario C:

- [ ] Show April 2025
- [ ] Show February 2026
- [ ] Show August 2026
- [ ] Explain importance
- [ ] Explain adaptive learning
- [ ] Explain decay

Security:

- [ ] Patient request for raw AI note returns 403

Privacy:

- [ ] Show synthetic PHI redaction before LLM

---

# Phase 14 — Final Audit

## M39 — Independent Codex Review

- [ ] Review repository against every Candidate Brief requirement
- [ ] Classify requirements as PASS / PARTIAL / FAIL / UNVERIFIABLE
- [ ] Check server-side RBAC
- [ ] Check clinic isolation
- [ ] Check provenance resolution
- [ ] Check PHI redaction
- [ ] Check risk semantics
- [ ] Check evidence confidence semantics
- [ ] Check abstention
- [ ] Check conflict handling
- [ ] Check self-learning safety
- [ ] Check performance evidence
- [ ] Save findings to REVIEW.md

## M40 — Fix Critical Gaps

- [ ] Fix all hard-requirement FAIL items
- [ ] Re-run complete test suite
- [ ] Fix critical PARTIAL items
- [ ] Do not add unrelated features

## M41 — Final Technical Verification

- [ ] npm run lint passes
- [ ] npm run typecheck passes
- [ ] frontend tests pass
- [ ] pytest passes
- [ ] all required micro-tests pass
- [ ] P95 Glance benchmark is documented and <= 300 ms
- [ ] repository contains synthetic data only
- [ ] no secrets are committed
- [ ] .env is gitignored
- [ ] deployed application works
- [ ] README is complete
- [ ] Technical Brief is complete
- [ ] ATTRIBUTION.txt is complete
- [ ] Demo video scenarios are technically ready
- [ ] git status is clean
