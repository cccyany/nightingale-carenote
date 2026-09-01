import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  canSavePatientFacingDraft,
  clinicalSourceTextForPatientSummary,
  parsePatientSummaryResponse,
  patientSummaryInstruction,
  patientSummaryRelevance,
  patientSummarySourcePreview,
  serializePatientSummarySources
} from "../lib/ai/patient-summary.ts";

const aiScribeEntry = {
  author_role: "system",
  entry_type: "ai_doctor_consult_summary",
  occurred_at: "2026-08-26T09:00:00+08:00",
  content: JSON.stringify({
    provider: "gemini",
    provider_display: "Gemini 3.5 Flash",
    model: "gemini-3.5-flash",
    review_state: "unverified",
    generated: JSON.stringify({
      summary: "The patient reports a dry cough mainly at night for two weeks.",
      key_points: ["Dry cough at night", "No fever reported"]
    })
  })
};

test("AI Scribe patient-summary source uses clinical summary, not provider metadata JSON", () => {
  const text = clinicalSourceTextForPatientSummary(aiScribeEntry);
  assert.equal(text, "The patient reports a dry cough mainly at night for two weeks.");
  assert.doesNotMatch(text, /provider|gemini|review_state|generated/i);
});

test("patient-summary source preview does not display raw provider JSON", () => {
  const preview = patientSummarySourcePreview(aiScribeEntry);
  assert.match(preview, /dry cough mainly at night/);
  assert.doesNotMatch(preview, /^\{/);
  assert.doesNotMatch(preview, /provider_display|gemini-3\.5-flash/);
});

test("patient-summary prompt serialization uses structured clinical source fields only", () => {
  const prompt = serializePatientSummarySources([aiScribeEntry], () => "26 Aug 2026");
  assert.match(prompt, /Source 1/);
  assert.match(prompt, /Type: AI Scribe/);
  assert.match(prompt, /Date: 26 Aug 2026/);
  assert.match(prompt, /Content: The patient reports a dry cough mainly at night/);
  assert.doesNotMatch(prompt, /provider_display|review_state|gemini-3\.5-flash|^\{/m);
});

test("patient-facing draft save validation requires title body type and source", () => {
  assert.equal(canSavePatientFacingDraft({ title: "", body: "Body", sourceEntryIds: ["entry"], contentType: "visit_summary" }), false);
  assert.equal(canSavePatientFacingDraft({ title: "Title", body: "", sourceEntryIds: ["entry"], contentType: "visit_summary" }), false);
  assert.equal(canSavePatientFacingDraft({ title: "Title", body: "Body", sourceEntryIds: [], contentType: "visit_summary" }), false);
  assert.equal(canSavePatientFacingDraft({ title: "Title", body: "Body", sourceEntryIds: ["entry"], contentType: "not_real" }), false);
  assert.equal(canSavePatientFacingDraft({ title: "Title", body: "Body", sourceEntryIds: ["entry"], contentType: "visit_summary" }), true);
});

test("patient-safe page does not render internal approval workflow status copy", () => {
  const text = fs.readFileSync(path.join("app", "patient", "me", "page.tsx"), "utf8");
  assert.doesNotMatch(text, /Approved \{dateTimeLabel\(item\.approvedAt\)\}/);
  assert.doesNotMatch(text, /Needs Clinician Approval|Needs Review|Rejected/);
});

test("care-team patient-facing status copy humanizes needs_clinician_approval", () => {
  const text = fs.readFileSync(path.join("app", "patients", "[id]", "page.tsx"), "utf8");
  assert.match(text, /function patientContentStatusLabel/);
  assert.match(text, /needs_clinician_approval"\) return "Needs Approval"/);
  assert.doesNotMatch(text, /displayToken\(item\.status\)/);
});

test("staff sees patient-facing review sources without mutation controls", () => {
  const component = fs.readFileSync(path.join("components", "CareNoteActions.tsx"), "utf8");
  const page = fs.readFileSync(path.join("app", "patients", "[id]", "page.tsx"), "utf8");
  assert.match(component, /const canReview = actorRole === "clinician" \|\| actorRole === "admin"/);
  assert.match(component, /Staff can review sources; publication changes require clinician or admin review/);
  assert.match(page, /<PatientContentStatusButtons[^>]*actorRole=\{actor\?\.role\}/);
});

test("right-side workflow panels use collapsed timeline-style accordion rows with counts", () => {
  const page = fs.readFileSync(path.join("app", "patients", "[id]", "page.tsx"), "utf8");
  assert.match(page, /function countLabel\(count: number, singular: string/);
  for (const title of ["Conflict review", "Patient-facing review", "Follow-up tasks"]) {
    assert.match(page, new RegExp(`<summary[^>]*>[\\s\\S]*<span>${title}</span>[\\s\\S]*rounded-full bg-stone-100`));
  }
  assert.match(page, /countLabel\(visibleFactConflicts\.length, "conflict"\)/);
  assert.match(page, /countLabel\(visiblePatientFacingContent\.length, "item"\)/);
  assert.match(page, /countLabel\(visibleTasks\.length, "task"\)/);
});

test("patient-facing mutation API routes enforce clinician or admin reviewer role before RPC", () => {
  for (const routePath of [
    path.join("app", "api", "patient-content", "[id]", "route.ts"),
    path.join("app", "api", "patient-content", "[id]", "status", "route.ts")
  ]) {
    const text = fs.readFileSync(routePath, "utf8");
    assert.match(text, /ensurePatientContentReviewer/);
    assert.match(text, /\.in\("role", \["clinician", "admin"\]\)/);
    assert.match(text, /const reviewer = await ensurePatientContentReviewer/);
  }
});

test("patient-facing source picker is fed care entries, not internal comments", () => {
  const text = fs.readFileSync(path.join("app", "patients", "[id]", "page.tsx"), "utf8");
  assert.match(text, /const patientDraftSources = visibleEntries\.map/);
  assert.doesNotMatch(text, /PatientFacingDraftComposer[\s\S]*comments=/);
});

test("patient-facing route accepts longitudinal multi-date source selections", () => {
  const text = fs.readFileSync(path.join("app", "api", "patients", "[id]", "patient-content", "route.ts"), "utf8");
  assert.doesNotMatch(text, /sourceEntryIds\s*=\s*z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)\.max\(8\)/);
  assert.match(text, /sourceEntryIds\s*=\s*z\.array\(z\.string\(\)\.uuid\(\)\)\.min\(1\)\.max\((?:1[0-9]|[2-9][0-9])\)/);
});

test("output-type instructions explicitly allow source-grounded abstention", () => {
  const medication = patientSummaryInstruction("medication_instructions");
  assert.match(medication, /medication name, dose, frequency/i);
  assert.match(medication, /no_relevant_content/);
  assert.match(medication, /Do not turn symptoms, hydration advice, or tests into medication instructions/i);

  const followUp = patientSummaryInstruction("follow_up_instructions");
  assert.match(followUp, /follow-up appointments|repeat tests/i);
  assert.match(followUp, /no_relevant_content/);
});

test("medication instructions abstain when selected sources only discuss non-medication content", () => {
  const result = patientSummaryRelevance("medication_instructions", [
    { author_role: "clinician", content: "Patient reports dry cough at night. Hydration encouraged. Repeat renal panel discussed." }
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, "no_relevant_content");
  assert.match(result.message, /No medication instructions were found/);
});

test("medication instructions proceed when selected sources document medication advice", () => {
  const result = patientSummaryRelevance("medication_instructions", [
    { author_role: "clinician", content: "Continue metformin 500 mg once daily as previously documented." }
  ]);
  assert.equal(result.ok, true);
});

test("follow-up and care-plan output types use relevant source content gates", () => {
  assert.equal(patientSummaryRelevance("follow_up_instructions", [
    { author_role: "clinician", content: "Patient reports mild headache and dry cough." }
  ]).ok, false);
  assert.equal(patientSummaryRelevance("follow_up_instructions", [
    { author_role: "clinician", content: "Repeat renal panel and review at the next appointment." }
  ]).ok, true);
  assert.equal(patientSummaryRelevance("care_plan_update", [
    { author_role: "clinician", content: "Current plan is to monitor symptoms and complete pending investigation." }
  ]).ok, true);
});

test("patient-summary response parser handles generated and abstained provider output", () => {
  const generated = parsePatientSummaryResponse({
    provider: "test",
    providerDisplayName: "Test",
    text: JSON.stringify({ status: "generated", summary: "Patient-friendly text.", key_points: ["Supported point"], review_state: "needs_review" })
  });
  assert.equal(generated?.status, "generated");
  assert.equal(generated?.summary, "Patient-friendly text.");

  const abstained = parsePatientSummaryResponse({
    provider: "test",
    providerDisplayName: "Test",
    text: JSON.stringify({ status: "no_relevant_content", reason: "No medication instructions were found.", key_points: [], review_state: "needs_review" })
  });
  assert.equal(abstained?.status, "no_relevant_content");
  assert.match(abstained?.reason ?? "", /No medication instructions/);
});
