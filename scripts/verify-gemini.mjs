import { loadEnvFile } from "./load-env.mjs";
import { invokeSafeLlm } from "../lib/ai/safe-gateway.ts";

loadEnvFile();

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not configured; real Gemini verification was not run.");
  process.exit(2);
}

const syntheticInput = [
  "Synthetic consult note contains a redacted patient name, ID, and phone.",
  "Jane Tan reports nocturnal cough for three weeks.",
  "NRIC S1234567D. Phone +65 9123 4567.",
  "Clinician discussed repeat renal panel; no order yet."
].join(" ");

const result = await invokeSafeLlm(syntheticInput, "ai_scribe_structured_ingest");

if (!result.ok) {
  console.error(JSON.stringify({
    ok: false,
    state: result.state,
    redaction: result.auditMetadata,
    provider_error: result.providerError ?? null
  }, null, 2));
  process.exit(1);
}

const provider = result.response.providerDisplayName;
const model = result.response.model ?? null;
const responseLength = result.response.text.length;
const receivedRawPhi = result.response.text.includes("Jane Tan")
  || result.response.text.includes("S1234567D")
  || result.response.text.includes("9123 4567");

console.log(JSON.stringify({
  ok: true,
  provider,
  model,
  response_length: responseLength,
  redaction: result.auditMetadata,
  sent_only_redacted_text: result.redaction.allowed,
  response_contains_original_phi: receivedRawPhi
}, null, 2));

if (!responseLength || receivedRawPhi) {
  process.exit(1);
}
