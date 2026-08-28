# Nightingale CareNote Independent Evaluator Audit

Date: 2026-08-27

Scope: M39-M41 skeptical audit against AGENTS.md, SPEC.md, TASKS.md, README.md, docs/technical-brief.md, docs/demo-script.md, migrations, application code, tests, generated evaluation artifacts, and benchmark artifacts.

Summary classification count:

- PASS: 74
- PARTIAL: 7
- FAIL: 0
- UNVERIFIABLE: 0
- NOT APPLICABLE: 0

Critical fix made during audit:

- The main Server Component read paths previously used `createSupabaseAdminClient()` through `lib/carenote-data.ts`, which could render internal care data without RLS. Fixed by requiring role-authenticated demo actor tokens for `/patients`, `/patients/[id]`, `/patients/[id]/history`, and `/patient/me`, and by removing service-role fallback from care-note read helpers.

## Requirement Classifications

| # | Requirement | Classification | Evidence | Tests / Runtime Evidence | Risk or Caveat |
|---|---|---|---|---|---|
| 1 | Shared Care Note | PASS | `app/patients/[id]/page.tsx`, `lib/carenote-data.ts`, core schema in `001_foundation_security.sql` | `pytest` care/collaboration tests | Prototype UI, not EHR-integrated |
| 2 | Under-10-second Glance | PASS | Care Glance top section in `app/patients/[id]/page.tsx` | Five-run benchmark median P95 193.11 ms, P95 range 173.04–210.86 ms, failures 0 in `docs/performance/glance-benchmark.json` | Direct Supabase/PostgREST warm path, not deployed browser RUM |
| 3 | Actionability | PASS | Glance `available_action`, task controls, patient review controls | `tests/test_glance_read_model.py`, `tests/test_collaboration.py` | Actions are prototype workflows |
| 4 | Longitudinal timeline | PASS | `care_entries`, page date separators, recent-first ordering | Seeded Jane timeline and page implementation | Recent-first chosen for consult workflow |
| 5 | All required entry types | PASS | `entry_type` enum in `001_foundation_security.sql` and AI ingest validation | Supabase verify required schema/functions | Not every type is heavily seeded |
| 6 | Metadata | PASS | columns for clinic/patient/author/role/visibility/timestamps/version/source metadata | Supabase verify constraints/indexes | Metadata is sufficient for prototype |
| 7 | Inline collaboration | PASS | comments/tasks APIs and `CareNoteActions.tsx` | `tests/test_collaboration.py` | UI intentionally compact |
| 8 | Threaded comments | PASS | `parent_comment_id`, `create_comment` validation | `tests/test_collaboration.py` | Replies displayed simply |
| 9 | Resolve/unresolve | PASS | `set_comment_resolved` SQL and button | `tests/test_collaboration.py` | No notification workflow |
| 10 | Mentions | PASS | `comment_mentions`, clinic membership validation | `tests/test_collaboration.py` | No outbound notification |
| 11 | Assignments | PASS | `tasks.assignee_id`, `create_task`, status update | `tests/test_collaboration.py` | Assignment is within clinic users only |
| 12 | Revision history | PASS | `entry_versions`, `/patients/[id]/history` | `tests/test_revision_history.py` | Full snapshots, not semantic diff storage |
| 13 | Version snapshots | PASS | version insert on create/edit/revert | `tests/test_revision_history.py` | Snapshot model is intentional |
| 14 | View changes / diff | PARTIAL | `diffSummary` in `app/patients/[id]/history/page.tsx` | Build/typecheck; revision tests validate versions | Diff is basic length/readable content, not line-level or semantic |
| 15 | Revert | PASS | `revert_care_entry`, `RevertButton` | `tests/test_revision_history.py` | Revert creates a new version |
| 16 | AI doctor consult summary | PASS | seeded/ingest type `ai_doctor_consult_summary` | `tests/test_ai_clinical_intelligence.py` | Synthetic content |
| 17 | AI nurse consult summary | PASS | seeded type `ai_nurse_consult_summary` | RBAC/provenance tests use AI nurse row | Synthetic content |
| 18 | AI patient session summary | PASS | seeded type `ai_patient_session_summary` | provenance/navigation evidence | Synthetic content |
| 19 | AI entries distinguished | PASS | `author_role = system`, AI badge in UI | RBAC tests hide AI from patient | UI label says AI-scribed / needs verification |
| 20 | AI provenance | PASS | `provenance_sources`, `provenance_spans`, resolver | `tests/test_highlight_provenance.py`, `tests/test_ai_clinical_intelligence.py` | Provenance points to synthetic entries/transcripts |
| 21 | Importance logic | PASS | `calculate_importance_components` in `009_importance_patient_decay.sql` | `tests/test_self_learning_importance.py` | Deterministic prototype weights |
| 22 | Recency | PASS | recency component in importance function | self-learning/Glance tests inspect components | Based on prototype time windows |
| 23 | Risk tags | PASS | `risk_level`, UI badges, deterministic floor SQL | risk floor tests | Risk is separate from importance |
| 24 | Clinical entities | PASS | `clinical_facts` supports allergy/medication/dose/frequency | AI clinical intelligence tests | Not a full ontology |
| 25 | Unresolved tasks | PASS | tasks status and unresolved action Glance | collaboration and Glance tests | No external ordering integration |
| 26 | Adaptive/self-learning behavior | PASS | `importance_feedback`, adaptive components | `tests/test_self_learning_importance.py` | Bounded simple mechanism |
| 27 | Accept/reject | PASS | highlight feedback and patient content status | self-learning and patient approval tests | Highlight reject removes active Glance via feedback path |
| 28 | risk_reason | PASS | `risk_reason` columns and UI | Glance tests require rows | Reasons are concise prototype text |
| 29 | Provenance pointer | PASS | non-null spans plus resolver validation | provenance tests resolve exact evidence | Pointer alone is not considered sufficient |
| 30 | Hybrid storage/data decay | PARTIAL | `storage_class`, decay docs, ranking behavior | self-learning/Glance tests verify classes | No physical archival/compression; documented deferred |
| 31 | Patient RBAC | PASS | RLS policies and patient tests | `tests/test_rbac_scope.py`, `tests/test_patient_view_approval.py` | `/patient/me` now uses patient demo actor only |
| 32 | Staff RBAC | PASS | role ownership functions/policies | RBAC and collaboration tests | Demo UI can select roles but server enforces |
| 33 | Clinician RBAC | PASS | clinician create/edit/review SQL checks | RBAC, revision, patient approval tests | Clinician cannot overwrite staff notes |
| 34 | Admin RBAC | PASS | clinic-scoped policies | `tests/test_rbac_scope.py` | Admin is clinic-scoped, not global |
| 35 | Clinic isolation | PASS | `user_has_clinic_role`, RLS policies | RBAC/RLS integration tests | Clinic B is isolation fixture |
| 36 | Server-side enforcement | PASS | API routes use actor clients/RPCs; pages now use actor tokens | RBAC/RLS tests; code audit fix | Demo token exchange is prototype convenience |
| 37 | RLS | PASS | RLS enabled on expected tables; policies verified | `supabase:verify` missingRls `[]`, policyCount 39 | Service role bypass remains limited to admin scripts/utilities |
| 38 | Provenance navigation | PARTIAL | View Source links with `source`, `span`, hash; `EvidenceText` span emphasis | provenance tests validate data, build validates UI | No browser E2E screenshot/click test was run |
| 39 | Conflict resolution | PASS | `fact_conflicts`, statuses, patient-content review | AI conflict tests | Resolution controls are minimal |
| 40 | Clinician precedence / review semantics | PARTIAL | review statuses and clinician approval/confirmation paths | patient approval and self-learning tests | Presentation precedence is limited; conflicts stay unresolved until review |
| 41 | Voice capture | PARTIAL | synthetic voice route, transcript schema, docs | `tests/test_voice_capture.py` | Bonus is synthetic/mock only, not production audio |
| 42 | Transcript redaction before LLM | PASS | voice route calls `invokeSafeLlm` after transcript text assembly | `tests/test_voice_capture.py`, redaction tests | Raw transcript necessarily exists before redaction |
| 43 | Speaker labels | PASS | `transcript_segments.speaker` | `tests/test_voice_capture.py` | Speaker set is constrained enum |
| 44 | Timestamps | PASS | transcript start/end checks and provenance timestamps | voice/provenance tests | Millisecond synthetic timestamps |
| 45 | Uncertainty markers | PASS | `confidence`, `uncertain` transcript fields | `tests/test_voice_capture.py` | Not calibrated diarization confidence |
| 46 | Transcript provenance | PASS | provenance span timestamp fields | `tests/test_voice_capture.py` | Timestamp resolution is structural |
| 47 | Concurrency behavior | PASS | `expected_version`, 409 route mapping | `tests/test_concurrent_edits.py` | Entry-level optimistic concurrency |
| 48 | Deterministic conflict strategy | PASS | conflict SQL detection and deterministic risk floors | AI clinical tests | Scope limited to high-value classes |
| 49 | P95 <=300ms | PASS | `docs/performance/glance-benchmark.json` | five consecutive P95 values 185.23, 173.04, 210.86, 193.11, 196.78 ms; median P95 193.11 ms; failures 0 | Local-to-remote PostgREST benchmark; not deployed app RUM |
| 50 | Synthetic data only | PASS | seed/test data uses synthetic `.example.test` users and fake IDs | grep scan found no obvious secrets/real PHI | Synthetic names are intentionally present for redaction/demo |
| 51 | TLS / encryption at rest assumptions/documentation | PARTIAL | README and brief now document hosting assumption | document audit | Repo cannot independently prove provider infrastructure encryption |
| 52 | Names redacted pre-LLM | PASS | `lib/ai/redaction.ts`, safe gateway | `tests/test_redaction.py` | Synthetic name list plus unresolved-name heuristic |
| 53 | IDs redacted pre-LLM | PASS | NRIC/FIN-like regex | `tests/test_redaction.py` | Prototype pattern coverage |
| 54 | Phones redacted pre-LLM | PASS | Singapore phone regex | `tests/test_redaction.py` | Prototype pattern coverage |
| 55 | Redaction evaluation | PASS | `eval/redaction_cases.json`, evaluation script/report | `npm.cmd run evaluate:fixtures` | Small synthetic fixture set |
| 56 | Required micro-tests | PASS | required test files exist | `pytest` 67 passed; `npm.cmd test` 21 passed | Required named pytest files and Node tests are present |
| 57 | Self-learning test | PASS | `tests/test_self_learning_importance.py` | `pytest` passed | Uses real Supabase persistence |
| 58 | Audit metadata-only | PASS | audit SQL metadata avoids note bodies/prompts | revision and AI tests inspect audit behavior | Audit review is pattern-based |
| 59 | Patient-facing generation approval | PASS | draft/approval workflow and RLS | patient approval tests | Clinician/admin approval required |
| 60 | Extraction vs generation design | PASS | structured extraction module and SQL facts | AI intelligence and eval tests | Limited deterministic extraction scope |
| 61 | Deterministic risk floors | PASS | `deterministic_risk_floor`, `lib/trust.ts` | risk tests in provenance/AI/self-learning | Floors cannot be lowered by suggested risk |
| 62 | Confidence semantics | PASS | evidence labels/explanations, docs | provenance and patient approval tests | Values are prototype semantics |
| 63 | Abstention | PASS | invalid provenance/low trust -> needs_review/block | provenance, AI, patient approval tests | Abstained items retained for review |
| 64 | Exposure bias | PASS | exposure tracked separately | self-learning test | Documented hazard |
| 65 | Care-team fatigue guardrails | PASS | bounded boost/negative, safety floors unaffected | self-learning test and docs | Simple prototype mechanism |
| 66 | Human-human contradiction handling | PASS | conflict detection compares facts regardless of AI/human origin | conflict fixture/test coverage | Presentation remains minimal |
| 67 | Medication/allergy/dose conflict handling | PASS | SQL conflict detection for all three | `tests/test_ai_clinical_intelligence.py` | Frequency support also present |
| 68 | Patient-facing higher-severity handling | PASS | approval blocks unresolved/low-trust content | patient approval tests | Patient UI intentionally simple |
| 69 | README setup/run instructions | PASS | `README.md` | document read | Requires configured Supabase env |
| 70 | Where redaction happens | PASS | safe gateway and docs | redaction/voice tests | Direct provider calls are only in provider abstraction |
| 71 | How RBAC is enforced | PASS | README, migrations, API routes | RBAC/RLS tests | Demo token flow is convenience, not security boundary |
| 72 | Clear commit history readiness | PARTIAL | working tree is reportable but not clean | `git status --short` shows pending changes | Human must commit/freeze after review |
| 73 | Architecture diagram | PASS | README and technical brief Mermaid | document read | Text-rendered Mermaid |
| 74 | Comprehensive schema | PASS | technical brief ERD plus migrations | `supabase:verify` | Compact diagram, not full column dictionary |
| 75 | Assumptions | PASS | README/brief limitations and TLS assumption | document read | Assumptions are explicit |
| 76 | First-principles decisions | PASS | technical brief tradeoffs/scope choices | document read | Prototype constraints acknowledged |
| 77 | Trade-offs | PASS | `docs/technical-brief.md` | document read | Tradeoffs are transparent |
| 78 | ATTRIBUTION | PASS | `ATTRIBUTION.txt` | package manifest audit | Manual checks called out instead of guessed |
| 79 | Demo scenario A readiness | PASS | Care Glance, View Source, source highlighting | provenance tests and demo script | Manual recording still required |
| 80 | Demo scenario B readiness | PARTIAL | collaboration/revision/revert implemented | collaboration/revision tests | No full browser E2E demo rehearsal recorded |
| 81 | Demo scenario C readiness | PASS | timeline, ranking, adaptive, decay docs/UI | self-learning tests and demo script | Requires presenter explanation |

## Special Security Audit

- `SECURITY DEFINER`: all discovered functions set `search_path = public`. Important mutating/optimized functions perform explicit role checks. The Glance definer RPC was tested directly for patient and cross-clinic denial.
- EXECUTE privileges: migrations do not explicitly revoke default function execute privileges. This is acceptable only because exposed functions perform role checks; tighter grants would be a hardening improvement.
- Service-role usage: used in scripts, tests, `lib/provenance.ts`, and admin utilities. Critical page-level service-role reads were removed during this audit.
- Client exposure: `SUPABASE_SERVICE_ROLE_KEY` is read only from server-side modules/scripts. `NEXT_PUBLIC_*` variables are limited to public Supabase URL/anon key.
- Direct API bypass: API routes require bearer/demo token and create actor-scoped Supabase clients.
- Cross-clinic and patient direct access: covered by RLS integration tests.
- Patient-facing approval bypass: approval requires clinician/admin role, valid provenance, same patient/clinic, non-rejected review state, and confidence threshold.
- Raw AI/internal access: patient RLS tests cover AI notes, staff/clinician notes, internal comments, patient-facing drafts, and transcript access.
- Audit PHI leakage: SQL audit metadata avoids note bodies/prompts/model responses; redaction metadata excludes raw values. Revision tests assert audit logs do not contain raw note contents.
- Broad writes: insert/update policies and definer functions check roles/clinic scope; no deliberate RLS weakening found.

## Special Trust Audit

- Risk: produced by deterministic floors in SQL/TypeScript. Model-suggested risk cannot lower floors. Risk can be wrong if the deterministic class mapping is incomplete, but the failsafe is needs-review plus traceable provenance.
- Confidence/evidence: implemented as evidence-quality labels and numeric prototype semantics, not LLM self-confidence. Ambiguity and invalid provenance abstain.
- Importance: separate persisted score components combine risk, unresolved action, recency, confirmation, entity priority, decay, and bounded adaptive feedback. Safety information cannot be learned away.
- Provenance: trusted highlights/facts resolve through source entry, source version, offsets, and exact evidence text. View Source links target the source entry and span, but browser-level navigation is classified PARTIAL due no E2E click/screenshot test.
- Patient content: AI-generated drafts are not visible until clinician approval; invalid/low-trust provenance blocks publishing.
- Redaction: centralized `invokeSafeLlm` performs redaction before provider invocation and blocks unsafe payloads.

## Special Performance Audit

Evidence from code/artifacts, not README alone:

- Warm path: `app/api/patients/[id]/glance/route.ts` calls `read_patient_glance`.
- Persisted model: `glance_items` table plus optimized RPC in `013_optimize_glance_read_authorization.sql`.
- No LLM/extraction on read: benchmark artifact records `warm_path_has_llm_call: false` and `warm_path_has_extraction: false`; route imports no AI code.
- Methodology: `scripts/benchmark-glance.mjs` uses 10 warm-up requests, 50 measured requests, concurrency 1, network included.
- Five-run result: P95 values 185.23, 173.04, 210.86, 193.11, and 196.78 ms; median P95 193.11 ms; P95 range 173.04–210.86 ms; failures 0; all runs below the 300 ms target. The last run measured P50 149.37 ms, P95 196.78 ms, and P99 402.57 ms.

## Final Verification Evidence

Final validation was run after critical fixes:

- `npm.cmd run supabase:apply`: PASS; migrations already applied, seed applied.
- `npm.cmd run supabase:verify`: PASS; missingTables `[]`, missingRls `[]`, constraintCount 269, indexCount 46, policyCount 39.
- `npm.cmd run lint`: PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd test`: PASS; 21 passed.
- `pytest`: PASS; 67 passed, 1 pytest cache warning.
- `npm.cmd run build`: PASS.
- `npm.cmd run evaluate:fixtures`: PASS; report generated with synthetic fixture metrics.
- `npm.cmd run benchmark:glance`: PASS; five consecutive runs all below 300 ms, median P95 193.11 ms, P95 range 173.04–210.86 ms, failures 0, target met.

## Remaining PARTIAL Items

- Basic revision diff is readable but not line-level/semantic.
- Data decay is classification/ranking only; physical archival/compression is deferred.
- Provenance navigation has implementation and data tests but no browser E2E click test.
- Clinician precedence/review semantics are minimal.
- Voice capture is synthetic/mock bonus functionality.
- TLS/encryption at rest are hosted-platform assumptions, not independently verified by the repo.
- Commit history/freeze readiness requires a human commit after this audit.
- Demo Scenario B has automated component behavior tests but no recorded/manual E2E proof in the repo.

## Overall Readiness

Evaluator stance: ready for demo/submission after human commit/freeze and any desired manual browser rehearsal, with the above PARTIALs disclosed honestly. No remaining hard-requirement FAIL is currently identified.
