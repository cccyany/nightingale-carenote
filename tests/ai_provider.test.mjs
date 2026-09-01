import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_GEMINI_MODEL,
  DeterministicMockProvider,
  GeminiProvider,
  OptionalHttpProvider,
  configuredProvider
} from "../lib/ai/provider.ts";
import { invokeSafeLlm } from "../lib/ai/safe-gateway.ts";

function withEnv(patch, fn) {
  const previous = {};
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    if (patch[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = patch[key];
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of Object.keys(patch)) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    });
}

test("configuredProvider uses deterministic mock when Gemini is not configured", async () => {
  await withEnv({
    GEMINI_API_KEY: undefined,
    GEMINI_MODEL: undefined,
    LLM_PROVIDER_ENDPOINT: undefined,
    LLM_PROVIDER_API_KEY: undefined
  }, () => {
    assert.ok(configuredProvider() instanceof DeterministicMockProvider);
  });
});

test("configuredProvider selects Gemini when GEMINI_API_KEY is configured", async () => {
  await withEnv({
    GEMINI_API_KEY: "synthetic-test-key",
    GEMINI_MODEL: DEFAULT_GEMINI_MODEL,
    LLM_PROVIDER_ENDPOINT: undefined,
    LLM_PROVIDER_API_KEY: undefined
  }, () => {
    assert.ok(configuredProvider() instanceof GeminiProvider);
  });
});

test("safe gateway redacts PHI before provider invocation", async () => {
  let received = "";
  const provider = {
    async invoke(request) {
      received = request.redactedText;
      return {
        provider: "capture",
        providerDisplayName: "Capture provider",
        text: JSON.stringify({ summary: "ok", key_points: [], review_state: "needs_review" })
      };
    }
  };

  const result = await invokeSafeLlm(
    "Jane Tan, NRIC S1234567D, phone +65 9123 4567 reports nocturnal cough.",
    "ai_scribe_structured_ingest",
    provider
  );

  assert.equal(result.ok, true);
  assert.match(received, /\[NAME_1\]/);
  assert.match(received, /\[ID_1\]/);
  assert.match(received, /\[PHONE_1\]/);
  assert.doesNotMatch(received, /Jane Tan|S1234567D|9123 4567/);
});

test("GeminiProvider builds the vendor request shape and does not receive raw text through the safe gateway", async () => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestHeaders = {};
  let requestBody = {};
  globalThis.fetch = async (url, init) => {
    requestUrl = String(url);
    requestHeaders = init.headers;
    requestBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify({
      candidates: [{
        content: {
          role: "model",
          parts: [{
            text: JSON.stringify({
              summary: "Synthetic redacted scribe output.",
              key_points: ["Nocturnal cough"],
              review_state: "needs_review"
            })
          }]
        },
        finishReason: "STOP"
      }]
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const provider = new GeminiProvider("synthetic-test-key", DEFAULT_GEMINI_MODEL);
    const result = await invokeSafeLlm(
      "Jane Tan S1234567D +65 9123 4567 discussed repeat renal panel.",
      "ai_scribe_structured_ingest",
      provider
    );

    assert.equal(result.ok, true);
    assert.equal(result.response.provider, "gemini");
    assert.equal(result.response.model, DEFAULT_GEMINI_MODEL);
    assert.match(requestUrl, new RegExp(`/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent$`));
    assert.equal(requestHeaders["x-goog-api-key"], "synthetic-test-key");
    assert.equal(requestBody.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
    assert.deepEqual(requestBody.generationConfig.responseFormat.text.schema.required, ["summary", "key_points", "review_state"]);
    assert.ok(requestBody.system_instruction);
    const prompt = requestBody.contents[0].parts[0].text;
    assert.match(prompt, /\[NAME_1\]/);
    assert.doesNotMatch(prompt, /Jane Tan|S1234567D|9123 4567/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("malformed Gemini JSON fails safely through the gateway", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: "not-json" }] }, finishReason: "STOP" }]
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const result = await invokeSafeLlm(
      "No PHI here: repeat renal panel discussed.",
      "ai_scribe_structured_ingest",
      new GeminiProvider("synthetic-test-key", DEFAULT_GEMINI_MODEL)
    );
    assert.equal(result.ok, false);
    assert.equal(result.state, "needs_review");
    assert.equal(result.code, "provider_error");
    assert.equal(result.providerError, "provider_error");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hanging Gemini fetch is aborted and classified as provider_timeout", async () => {
  const originalFetch = globalThis.fetch;
  let aborted = false;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("aborted", "AbortError"));
    });
  });

  try {
    const result = await invokeSafeLlm(
      "Jane Tan S1234567D +65 9123 4567 reports cough.",
      "ai_scribe_structured_ingest",
      new GeminiProvider("synthetic-test-key", DEFAULT_GEMINI_MODEL, 5)
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "provider_timeout");
    assert.equal(result.providerError, "provider_timeout");
    assert.equal(aborted, true);
    assert.doesNotMatch(JSON.stringify(result), /Jane Tan|S1234567D|9123 4567/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("hanging optional HTTP provider fetch is aborted and classified as provider_timeout", async () => {
  const originalFetch = globalThis.fetch;
  let aborted = false;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      aborted = true;
      reject(new DOMException("aborted", "AbortError"));
    });
  });

  try {
    const result = await invokeSafeLlm(
      "No PHI here: repeat renal panel discussed.",
      "ai_scribe_structured_ingest",
      new OptionalHttpProvider("https://example.test/llm", "synthetic-key", 5)
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "provider_timeout");
    assert.equal(result.providerError, "provider_timeout");
    assert.equal(aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini 503 is provider_unavailable and does not fall back to mock", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { status: "UNAVAILABLE", message: "temporarily unavailable" }
  }), { status: 503, headers: { "content-type": "application/json" } });

  try {
    const result = await invokeSafeLlm(
      "No PHI here: repeat renal panel discussed.",
      "ai_scribe_structured_ingest",
      new GeminiProvider("synthetic-test-key", DEFAULT_GEMINI_MODEL, 100)
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, "provider_unavailable");
    assert.equal(result.providerError, "provider_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini secrets are not referenced from client components or pages", () => {
  const roots = ["app", "components"].filter((root) => fs.existsSync(root));
  const forbidden = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(tsx|jsx)$/.test(entry.name)) {
        const text = fs.readFileSync(fullPath, "utf8");
        if (/GEMINI_API_KEY|NEXT_PUBLIC_GEMINI|SUPABASE_SERVICE_ROLE_KEY/.test(text)) {
          forbidden.push(fullPath);
        }
      }
    }
  };
  roots.forEach(walk);
  assert.deepEqual(forbidden, []);
});
