import assert from "node:assert/strict";
import test from "node:test";

import { logSafeError, safeError, sanitizeForLog } from "../lib/safe-error.ts";

const syntheticPhi = "Jane Tan S1234567D +65 9123 4567 jane.tan@example.test transcript says severe cough";

test("safe errors sanitize synthetic PHI from user-safe messages", () => {
  const payload = safeError("database_error", syntheticPhi);
  assert.equal(payload.code, "database_error");
  assert.doesNotMatch(JSON.stringify(payload), /Jane Tan|S1234567D|9123 4567|jane\.tan@example\.test/);
});

test("safe logger sanitizes nested diagnostic payloads", () => {
  const previous = console.error;
  let captured = "";
  console.error = (...args) => {
    captured = JSON.stringify(args);
  };
  try {
    logSafeError("synthetic-test", "provider_error", {
      message: syntheticPhi,
      nested: { details: "Doctor transcript phrase: Jane Tan called +65 9123 4567" }
    });
  } finally {
    console.error = previous;
  }
  assert.doesNotMatch(captured, /Jane Tan|S1234567D|9123 4567|jane\.tan@example\.test/);
  assert.match(captured, /provider_error/);
});

test("sanitizeForLog preserves useful non-sensitive diagnostics", () => {
  const sanitized = sanitizeForLog({ code: "23514", hint: "check provenance" });
  assert.deepEqual(sanitized, { code: "23514", hint: "check provenance" });
});
