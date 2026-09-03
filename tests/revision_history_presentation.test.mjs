import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { displayRevisionToken, parseAiRevisionSnapshot, revisionDiff } from "../lib/revision-presentation.ts";

const historyPage = readFileSync("app/patients/[id]/history/page.tsx", "utf8");

test("AI-generated revision snapshot renders human-readable summary and key points", () => {
  const snapshot = JSON.stringify({
    provider: "gemini",
    provider_display: "Gemini 3.5 Flash",
    model: "gemini-3.5-flash",
    review_state: "unverified",
    generated_at: "2026-09-03T10:00:00.000Z",
    source_label: "Ambient consult",
    source_session_identifier: "voice-session-1",
    generated: JSON.stringify({
      summary: "Patient reports penicillin allergy and takes metformin.",
      key_points: ["Penicillin caused a rash.", "Metformin 500 mg twice daily."]
    })
  });

  const parsed = parseAiRevisionSnapshot(snapshot);

  assert.equal(parsed?.summary, "Patient reports penicillin allergy and takes metformin.");
  assert.deepEqual(parsed?.keyPoints, ["Penicillin caused a rash.", "Metformin 500 mg twice daily."]);
  assert.equal(parsed?.providerDisplay, "Gemini 3.5 Flash");
  assert.equal(parsed?.reviewState, "unverified");
});

test("revision history keeps raw JSON out of the default main body", () => {
  assert.match(historyPage, /Unverified AI-generated content/);
  assert.match(historyPage, /<h2 className="text-sm font-semibold text-stone-950">Summary<\/h2>/);
  assert.match(historyPage, /<h2 className="text-sm font-semibold text-stone-950">Key points<\/h2>/);
  assert.match(historyPage, /<summary className="cursor-pointer font-medium text-stone-800">Technical details<\/summary>/);
  assert.match(historyPage, /<summary className="cursor-pointer font-medium text-stone-800">Raw immutable snapshot<\/summary>/);
  assert.doesNotMatch(historyPage, /<pre className="mt-2 whitespace-pre-wrap rounded bg-stone-50 p-3 text-sm leading-6 text-stone-800">\{version\.content\}<\/pre>/);
});

test("selected entry title and current version status live inside revision cards", () => {
  const headerStart = historyPage.indexOf('<header className="mt-4">');
  const headerEnd = historyPage.indexOf("</header>", headerStart);
  const pageHeader = historyPage.slice(headerStart, headerEnd);
  assert.match(pageHeader, /<h1 className="text-3xl font-semibold tracking-tight text-teal-700">Revision History<\/h1>/);
  assert.match(pageHeader, /Revision History/);
  assert.equal((pageHeader.match(/Revision History/g) ?? []).length, 1);
  assert.doesNotMatch(pageHeader, /uppercase tracking-wide/);
  assert.doesNotMatch(pageHeader, /displayToken\(entry\.entry_type\)/);
  assert.doesNotMatch(pageHeader, /Current version \{entry\.current_version\}/);
  const currentCardStart = historyPage.indexOf("{isCurrentVersion ? (");
  const currentCardEnd = historyPage.indexOf(") : null}", currentCardStart);
  const currentCard = historyPage.slice(currentCardStart, currentCardEnd);
  assert.match(currentCard, /displayToken\(entry\.entry_type\)/);
  assert.match(currentCard, /Current version \{entry\.current_version\}\. Reverts create a new immutable version\./);
});

test("revision history exposes a real version-to-version diff", () => {
  const chunks = revisionDiff("Patient has cough.", "Patient has dizziness.");
  assert.ok(chunks.some((chunk) => chunk.kind === "removed" && chunk.value.includes("cough")));
  assert.ok(chunks.some((chunk) => chunk.kind === "added" && chunk.value.includes("dizziness")));
  assert.match(historyPage, /Changes from previous version/);
  assert.match(historyPage, /<ins className=/);
  assert.match(historyPage, /<del className=/);
});

test("revision technical details render with stable deterministic keys", () => {
  assert.match(historyPage, /technicalDetails\.map\(\(detail\) =>/);
  assert.match(historyPage, /<div key=\{detail\.label\}>/);
});

test("malformed or legacy non-JSON revision content falls back safely", () => {
  assert.equal(parseAiRevisionSnapshot("Legacy plain-text version content"), null);
  assert.equal(parseAiRevisionSnapshot("{not json"), null);
});

test("revision title casing renders AI instead of Ai", () => {
  assert.equal(displayRevisionToken("ai_doctor_consult_summary"), "AI Doctor Consult Summary");
});

test("revision revert action remains limited to clinician or admin presentation", () => {
  assert.match(historyPage, /const canRevert = actor\?\.role === "clinician" \|\| \(actor\?\.role === "admin" && !actor\.platformAdmin\)/);
  assert.match(historyPage, /canRevert && !isCurrentVersion/);
  assert.match(historyPage, /actorToken=\{demo\}/);
});

test("revert button uses the active actor token instead of hardcoded clinician demo auth", () => {
  const actions = readFileSync("components/CareNoteActions.tsx", "utf8");
  assert.match(actions, /actorToken:\s*string/);
  assert.match(actions, /authorization: `Bearer \$\{actorToken\}`/);
  assert.doesNotMatch(actions, /headers: authHeaders\("clinician"\),\s*body: JSON\.stringify\(\{ expectedVersion, revertToVersion: version \}\)/);
});
