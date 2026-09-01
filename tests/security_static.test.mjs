import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runtimeRoots = ["app", "components", "lib"].filter((root) => fs.existsSync(root));

function walk(dir, predicate, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

test("normal patient-data routes do not import the Supabase admin service-role client", () => {
  const files = walk("app", (file) => file.endsWith(".ts") || file.endsWith(".tsx"));
  const offenders = files.filter((file) => {
    const text = fs.readFileSync(file, "utf8");
    return /createSupabaseAdminClient|@\/lib\/supabase\/admin|SUPABASE_SERVICE_ROLE_KEY/.test(text);
  });
  assert.deepEqual(offenders, []);
});

test("patient-safe page resolves the signed-in patient instead of hardcoding Jane", () => {
  const text = fs.readFileSync(path.join("app", "patient", "me", "page.tsx"), "utf8");
  assert.doesNotMatch(text, /30000000-0000-0000-0000-000000000001/);
  assert.match(text, /\.from\("patients"\)/);
});

test("runtime application code invokes external LLM providers only through the safe gateway", () => {
  const allowed = new Set([
    path.normalize("lib/ai/provider.ts"),
    path.normalize("lib/ai/safe-gateway.ts")
  ]);
  const files = runtimeRoots.flatMap((root) => walk(root, (file) => /\.(ts|tsx)$/.test(file)));
  const offenders = files.filter((file) => {
    const normalized = path.normalize(file);
    if (allowed.has(normalized)) return false;
    const text = fs.readFileSync(file, "utf8");
    return /new\s+(GeminiProvider|OptionalHttpProvider)|\.\s*invoke\s*\(\s*\{?\s*redactedText/.test(text);
  });
  assert.deepEqual(offenders, []);
});

test("AI scribe routes invoke the safe gateway before persistence RPCs", () => {
  for (const file of [
    path.join("app", "api", "patients", "[id]", "ai-scribe", "route.ts"),
    path.join("app", "api", "patients", "[id]", "voice-captures", "route.ts")
  ]) {
    const text = fs.readFileSync(file, "utf8");
    const gatewayIndex = text.indexOf("await invokeSafeLlm");
    const transcriptIndex = text.indexOf("create_transcript_session");
    const ingestIndex = text.indexOf("ingest_ai_scribed_note");
    assert.ok(gatewayIndex >= 0, `${file} must use invokeSafeLlm`);
    assert.ok(transcriptIndex > gatewayIndex, `${file} must create transcript source after safe gateway`);
    assert.ok(ingestIndex > gatewayIndex, `${file} must persist AI entry after safe gateway`);
  }
});

test("patient-facing generation route invokes the safe gateway before draft persistence", () => {
  const file = path.join("app", "api", "patients", "[id]", "patient-content", "route.ts");
  const text = fs.readFileSync(file, "utf8");
  const gatewayIndex = text.indexOf("await invokeSafeLlm");
  const persistenceIndex = text.indexOf("create_patient_facing_draft_from_sources");
  assert.ok(gatewayIndex >= 0, "patient-facing generation must use invokeSafeLlm");
  assert.ok(persistenceIndex > gatewayIndex, "patient-facing draft persistence must remain after the safe gateway branch");
});
