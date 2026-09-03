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

- [x] Implement risk contribution
- [x] Implement unresolved action contribution
- [x] Implement recency contribution
- [x] Implement clinician-confirmation contribution
- [x] Implement entity priority
- [x] Implement decay
- [x] Persist explainable score components
- [x] Rank Glance items

Suggested commit:

feat(glance): add explainable importance ranking

---

## M25 — Adaptive Importance

- [x] Track exposure
- [x] Track manual highlight
- [x] Track pin
- [x] Track clinician confirmation
- [x] Track comments
- [x] Track rejection
- [x] Calculate clinic-specific adaptive boost
- [x] Cap adaptive boost
- [x] Prevent learning from lowering safety floors
- [x] Treat exposure separately from rejection

Suggested commit:

feat(learning): add bounded importance feedback

---

## M26 — Self-Learning Test

- [x] Implement tests/test_self_learning_importance.py
- [x] Record baseline score
- [x] Simulate clinician pin/confirmation
- [x] Generate similar future candidate
- [x] Assert increased bounded priority
- [x] Assert critical risk floor remains unchanged

---

# Phase 10 — Patient Safety

## M27 — Patient View

- [x] Build /patient/me
- [x] Display patient's own submitted information
- [x] Display approved summaries
- [x] Display approved instructions
- [x] Hide internal comments
- [x] Hide raw AI notes
- [x] Hide clinician/staff internal notes

---

## M28 — Patient Approval Workflow

- [x] Create patient-facing AI draft
- [x] Default draft to not visible
- [x] Add clinician review
- [x] Add approve action
- [x] Record approver
- [x] Record approval timestamp
- [x] Only approved content becomes patient-visible

Suggested commit:

feat(patient): add clinician-approved patient summaries

---

# Phase 11 — Bonus

## M29 — Data Decay

- [x] Implement HOT classification
- [x] Implement WARM classification
- [x] Implement COLD classification
- [x] Reduce ranking weight for older ordinary context
- [x] Exempt persistent safety information
- [x] Preserve source history
- [x] Document policy

Suggested commit:

feat(storage): add longitudinal data decay policy

---

## M30 — Ambient Voice Capture

Only start after all core requirements pass.

- [x] Record/upload synthetic audio
- [x] Transcribe audio
- [x] Add speaker labels
- [x] Add timestamps
- [x] Redact transcript text before downstream LLM extraction/summarization
- [x] Create AI-scribed entry
- [x] Link summary to transcript timestamps
- [x] Mark uncertain transcript segments
- [x] Document noisy/multilingual limitations

Note: Ambient Consult is post-consult. Real Gemini transcription is used when configured; deterministic transcription is retained for tests/offline fixtures.

Suggested commit:

feat(voice): add synthetic ambient consult capture

---

# Phase 12 — Performance & Evaluation

## M31 — Glance Read Model

- [x] Precompute Glance items
- [x] Ensure warm read path has no LLM call
- [x] Add indexes
- [x] Optimize patient Glance query

---

## M32 — Performance Benchmark

- [x] Create reproducible benchmark
- [x] Run warm requests
- [x] Record request count
- [x] Record concurrency
- [x] Record P50
- [x] Record P95
- [x] Record P99 where available
- [x] Verify P95 <= 300 ms
- [x] Document methodology

Suggested commit:

perf(glance): benchmark warm consult path

---

## M33 — Evaluation Fixtures

- [x] Create redaction_cases.json
- [x] Create extraction_cases.json
- [x] Create conflict_cases.json
- [x] Measure provenance resolution
- [x] Measure redaction recall
- [x] Record abstention cases
- [x] Document limitations

---

# Phase 13 — Final Product

## M34 — UI Polish

Only after core tests pass.

- [x] Improve Glance hierarchy
- [x] Improve timeline readability
- [x] Improve AI badges
- [x] Improve conflict review UI
- [x] Improve source highlighting
- [x] Improve version diff UI
- [x] Add loading states
- [x] Add error states
- [x] Add empty states
- [x] Verify responsive layout

---

## M35 — README

- [x] Product overview
- [x] Architecture
- [x] Setup instructions
- [x] Environment variables
- [x] Demo accounts
- [x] RBAC explanation
- [x] RLS explanation
- [x] Redaction explanation
- [x] AI trust model
- [x] Provenance
- [x] Risk semantics
- [x] Confidence semantics
- [x] Abstention
- [x] Revision strategy
- [x] Concurrency strategy
- [x] Conflict detection
- [x] Self-learning
- [x] Data decay
- [x] Performance methodology
- [x] Test commands
- [x] Known limitations
- [x] Synthetic data disclaimer

---

## M36 — ATTRIBUTION

- [x] List every external library
- [x] List license for every library
- [x] List models/services
- [x] Verify license information from authoritative sources
- [x] Do not guess licenses

---

## M37 — Technical Brief

2–3 pages.

- [x] Architecture diagram
- [x] Architecture explanation
- [x] Comprehensive schema
- [x] Trust model
- [x] Provenance model
- [x] Risk model
- [x] Confidence semantics
- [x] Abstention
- [x] RBAC
- [x] Redaction
- [x] Performance
- [x] Self-learning
- [x] Data decay
- [x] Assumptions
- [x] Trade-offs

---

## M38 — Demo Video

Scenario A:

- [x] Staff opens patient
- [x] Glance understandable immediately
- [x] Click AI-derived highlight
- [x] Jump to exact source

Scenario B:

- [x] Staff adds note
- [x] Staff comments with @clinician
- [x] Assign follow-up
- [x] Clinician confirms AI phrase
- [x] Clinician edits plan
- [x] Show revision
- [x] Revert version

Scenario C:

- [x] Show April 2025
- [x] Show February 2026
- [x] Show August 2026
- [x] Explain importance
- [x] Explain adaptive learning
- [x] Explain decay

Security:

- [x] Patient request for raw AI note returns 403

Privacy:

- [x] Show synthetic PHI redaction before LLM

---

# Phase 14 — Final Audit

## M39 — Independent Codex Review

- [x] Review repository against every Candidate Brief requirement
- [x] Classify requirements as PASS / PARTIAL / FAIL / UNVERIFIABLE
- [x] Check server-side RBAC
- [x] Check clinic isolation
- [x] Check provenance resolution
- [x] Check PHI redaction
- [x] Check risk semantics
- [x] Check evidence confidence semantics
- [x] Check abstention
- [x] Check conflict handling
- [x] Check self-learning safety
- [x] Check performance evidence
- [x] Save findings to REVIEW.md

## M40 — Fix Critical Gaps

- [x] Fix all hard-requirement FAIL items
- [x] Re-run complete test suite
- [x] Fix critical PARTIAL items
- [x] Do not add unrelated features

## M41 — Final Technical Verification

- [x] npm run lint passes
- [x] npm run typecheck passes
- [x] frontend tests pass
- [x] pytest passes
- [x] all required micro-tests pass
- [x] P95 Glance benchmark is documented and <= 300 ms
- [x] repository contains synthetic data only
- [x] no secrets are committed
- [x] .env is gitignored
- [ ] deployed application works
- [x] README is complete
- [x] Technical Brief is complete
- [x] ATTRIBUTION.txt is complete
- [x] Demo video scenarios are technically ready
- [ ] git status is clean

Note: this checklist records technical readiness inside the repository. The final submitted brief and demo video are prepared separately from this source repo.
