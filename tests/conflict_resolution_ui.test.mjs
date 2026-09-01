import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actions = readFileSync("components/CareNoteActions.tsx", "utf8");
const glance = readFileSync("components/GlanceSection.tsx", "utf8");
const patientPage = readFileSync("app/patients/[id]/page.tsx", "utf8");

test("conflict Glance actions use resolution workflow instead of generic confirmation", () => {
  assert.match(actions, /isConflict \? <a className=\{tealOutlineButtonClass\} href="#conflict-review">Resolve conflict<\/a>/);
  assert.match(actions, /!isConflict && confirmationStatus !== "confirmed"/);
  assert.match(actions, /Suggestion confirmed/);
  assert.match(glance, /isConflict=\{Boolean\(item\.rule_key\?\.includes\("CONFLICT"\)\)\}/);
  assert.match(glance, /confirmationStatus=\{item\.confirmation_status\}/);
});

test("resolved conflicts remain visible in history with decision metadata", () => {
  assert.match(patientPage, /conflict\.resolution_outcome/);
  assert.match(patientPage, /Resolved by:/);
  assert.match(patientPage, /View decision in timeline/);
  assert.match(patientPage, /<ConflictResolutionForm/);
});

test("Care Glance exposes Active and Confirmed presentation tabs", () => {
  assert.match(glance, /splitGlancePresentationItems\(items\)/);
  assert.match(glance, /Active \{splitItems\.active\.length\}/);
  assert.match(glance, /Confirmed \{splitItems\.confirmed\.length\}/);
  assert.match(glance, /glanceViewBadge\(view, totalViewItems, shownItems\.length\)/);
});

test("AI Scribe patient-facing draft shortcut is compact and colocated with History", () => {
  assert.match(patientPage, /canCreatePatientFacingDraft = actor\?\.role === "clinician" \|\| actor\?\.role === "admin"/);
  assert.match(patientPage, /Patient draft/);
  assert.doesNotMatch(patientPage, /Create patient-facing draft/);
  assert.match(patientPage, /Patient draft[\s\S]*History/);
});
