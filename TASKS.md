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

- [x] Build patient header
- [x] Build CareNote layout
- [x] Build Timeline container
- [x] Add date separators
- [x] Add entry type badges
- [x] Visually distinguish AI and human entries
- [x] Add timeline filters

Definition of Done:

Synthetic longitudinal history is readable on one page.

Suggested commit:

feat(timeline): add longitudinal patient CareNote

---

## M7 — Notes & Collaboration

- [x] Add staff note creation
- [x] Add clinician note creation
- [x] Add comments
- [x] Add replies
- [x] Add resolve
- [x] Add unresolve
- [x] Add @mentions
- [x] Add task assignment
- [x] Add task completion
- [x] Enforce role ownership on writes

Suggested commit:

feat(collaboration): add comments mentions and tasks

---

# Phase 4 — Versioning

## M8 — Revision History

- [x] Snapshot every editable version
- [x] Increment version on edit
- [x] Build history view
- [x] Show version metadata
- [x] Add basic diff view
- [x] Implement revert
- [x] Ensure revert creates a new version
- [x] Preserve old versions
- [x] Add audit metadata

Suggested commit:

feat(history): add immutable revisions and revert

---

## M9 — Revision Tests

- [x] Implement tests/test_revision_history.py
- [x] Assert edit increments version
- [x] Assert revert restores prior content
- [x] Assert revert creates new version
- [x] Assert old versions remain
- [x] Assert audit actor metadata
- [x] Assert audit does not contain raw note contents

Definition of Done:

All revision tests pass.

---

## M10 — Concurrent Editing

- [x] Separate independently editable sections where appropriate
- [x] Add expected_version writes
- [x] Implement optimistic locking
- [x] Return HTTP 409 for stale same-section write
- [x] Build conflict review UI
- [x] Never silently use last-write-wins

Suggested commit:

feat(concurrency): add optimistic section locking

---

## M11 — Concurrent Edit Tests

- [x] Implement tests/test_concurrent_edits.py
- [x] Test separate sections survive concurrent edits
- [x] Test same-section stale write returns conflict
- [x] Verify no silent overwrite

---

# Phase 5 — Provenance

## M12 — Provenance Model

- [x] Implement provenance sources
- [x] Implement source spans
- [x] Store entry/version relationship
- [x] Store evidence text
- [x] Store character offsets
- [x] Support transcript timestamps
- [x] Implement provenance resolver

Suggested commit:

feat(provenance): add resolvable evidence spans

---

## M13 — Provenance Navigation

- [x] Add View Source button
- [x] Navigate to source entry
- [x] Scroll to exact timeline entry
- [x] Highlight exact evidence span
- [x] Support AI-scribed source navigation

---

## M14 — Provenance Tests

- [x] Implement tests/test_highlight_provenance.py
- [x] Generate highlight
- [x] Resolve provenance pointer
- [x] Assert source entry exists
- [x] Assert source version exists
- [x] Assert offsets are valid
- [x] Assert evidence text matches referenced span

Definition of Done:

Every trusted highlight can prove its source.

---

# Phase 6 — Glance & Trust Logic

## M15 — Care Glance

- [x] Build Glance View
- [x] Limit active items to approximately 3–5
- [x] Display title
- [x] Display short explanation
- [x] Display status
- [x] Display risk reason
- [x] Display evidence state
- [x] Display available action
- [x] Display View Source

Suggested commit:

feat(glance): add actionable Care Glance

---

## M16 — Deterministic Risk

- [x] Implement allergy conflict risk floor
- [x] Implement medication conflict risk floor
- [x] Implement medication dose conflict risk floor
- [x] Implement critical unresolved task floor
- [x] Separate risk from importance
- [x] Add explainable risk reason
- [x] Ensure model cannot lower deterministic floor

Suggested commit:

feat(safety): add deterministic clinical risk floors

---

## M17 — Evidence Confidence + Abstention

- [x] Implement evidence confidence semantics
- [x] Detect unresolved provenance
- [x] Detect ambiguous extraction
- [x] Implement needs-review state
- [x] Prevent unsupported candidate from becoming trusted fact
- [x] Display evidence explanation instead of decorative model confidence

---

# Phase 7 — AI Safety Pipeline

## M18 — PHI Redaction

- [x] Implement name redaction
- [x] Implement ID/IC redaction
- [x] Implement phone redaction
- [x] Implement redaction verification
- [x] Block LLM call on verification failure
- [x] Centralize all LLM calls behind safe gateway
- [x] Prevent PHI in AI logs

Suggested commit:

feat(ai): add mandatory PHI redaction gateway

---

## M19 — Redaction Tests

- [x] Implement tests/test_redaction.py
- [x] Test synthetic names
- [x] Test synthetic IDs
- [x] Test Singapore-style phone numbers
- [x] Test verification failure
- [x] Assert LLM adapter is not called after failure

---

## M20 — Structured AI Extraction

- [x] Add LLM adapter interface
- [x] Add deterministic/mock adapter for tests
- [x] Add production LLM adapter
- [x] Request structured facts
- [x] Require evidence text
- [x] Require source offsets
- [x] Validate returned evidence
- [x] Reject invalid evidence
- [x] Abstain on unsupported extraction

Suggested commit:

feat(ai): add provenance-aware structured extraction

---

## M21 — AI Scribe Integration

- [x] Add AI doctor consult entry
- [x] Add AI nurse consult entry
- [x] Add AI patient session entry
- [x] Set author_role = system
- [x] Add source/session IDs
- [x] Add provenance
- [x] Add AI-SCRIBED UI badge
- [x] Add unverified status
- [x] Add clinician-confirmed status

Suggested commit:

feat(ai): integrate typed AI-scribed timeline entries

---

# Phase 8 — Clinical Conflict Handling

## M22 — Clinical Facts

- [x] Normalize allergy facts
- [x] Normalize medication facts
- [x] Normalize dosage
- [x] Normalize frequency
- [x] Link every fact to provenance

---

## M23 — Conflict Detection

- [x] Detect allergy contradiction
- [x] Detect medication contradiction
- [x] Detect dose contradiction
- [x] Detect frequency contradiction
- [x] Create fact conflict records
- [x] Preserve both sources
- [x] Add clinician review
- [x] Add resolution metadata
- [x] Add Needs Further Review state

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
