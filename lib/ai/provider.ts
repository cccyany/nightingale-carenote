export type LlmOperation = "clinical_extraction" | "patient_summary" | "ai_scribe_structured_ingest";

export type LlmProviderRequest = {
  redactedText: string;
  operation: LlmOperation;
};

export type LlmProviderResponse = {
  provider: string;
  providerDisplayName: string;
  model?: string;
  text: string;
};

export interface LlmProvider {
  invoke(request: LlmProviderRequest): Promise<LlmProviderResponse>;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";
export const DEFAULT_LLM_TIMEOUT_MS = Number(process.env.LLM_PROVIDER_TIMEOUT_MS ?? 15000);

export class LlmProviderError extends Error {
  code: "provider_timeout" | "provider_unavailable" | "provider_error";

  constructor(code: LlmProviderError["code"], message: string) {
    super(message);
    this.name = "LlmProviderError";
    this.code = code;
  }
}

function timeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function classifyStatus(status: number) {
  return status === 503 || status === 502 || status === 504 || status === 429 ? "provider_unavailable" : "provider_error";
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export class DeterministicMockProvider implements LlmProvider {
  public seenPayloads: string[] = [];

  async invoke(request: LlmProviderRequest): Promise<LlmProviderResponse> {
    this.seenPayloads.push(request.redactedText);
    return {
      provider: "deterministic_mock",
      providerDisplayName: "Deterministic mock",
      model: "deterministic_mock",
      text: JSON.stringify({
        provider: "deterministic_mock",
        provider_display: "Deterministic mock",
        status: "structured_extraction_ready",
        summary: "Structured extraction ready for deterministic validation."
      })
    };
  }
}

export class OptionalHttpProvider implements LlmProvider {
  private endpoint: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(endpoint: string, apiKey: string, timeoutMs = DEFAULT_LLM_TIMEOUT_MS) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async invoke(request: LlmProviderRequest): Promise<LlmProviderResponse> {
    const timeout = timeoutSignal(this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        signal: timeout.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify(request)
      });
    } catch (error) {
      if (isAbortError(error)) throw new LlmProviderError("provider_timeout", "LLM provider timed out");
      throw new LlmProviderError("provider_error", "LLM provider request failed");
    } finally {
      timeout.clear();
    }
    if (!response.ok) throw new LlmProviderError(classifyStatus(response.status), `LLM provider failed with ${response.status}`);
    const payload = await response.json();
    return {
      provider: "optional_http",
      providerDisplayName: "Optional HTTP provider",
      text: String(payload.text ?? "")
    };
  }
}

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: unknown;
};

function operationInstruction(operation: LlmOperation) {
  if (operation === "patient_summary") {
    return "Produce patient-facing draft content only when the selected sources contain relevant information for the requested output type. Return status generated when content is produced, or no_relevant_content with a short reason when the requested output type is not supported by the sources. It must be suitable for clinician review before publication.";
  }
  if (operation === "clinical_extraction") {
    return "Produce concise structured clinical extraction notes for deterministic downstream validation. Do not assign final risk or confidence.";
  }
  return "Produce a concise clinical scribe summary for downstream deterministic validation. Do not decide final risk, provenance, conflicts, ranking, or patient publication state.";
}

function providerDisplayName(model: string) {
  return model
    .split("-")
    .map((part) => part === "gemini" ? "Gemini" : part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function assertStructuredJson(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini provider returned malformed JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Gemini provider returned unsupported JSON structure");
  }
}

export class GeminiProvider implements LlmProvider {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(apiKey: string, model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, timeoutMs = DEFAULT_LLM_TIMEOUT_MS) {
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async invoke(request: LlmProviderRequest): Promise<LlmProviderResponse> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const timeout = timeoutSignal(this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal: timeout.signal,
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify({
        system_instruction: {
          parts: [{
            text: [
              "You are a clinical scribe assistant for a synthetic demo.",
              "You receive redacted text only.",
              "Return concise JSON for downstream deterministic validation.",
              "Do not infer final clinical truth, risk floor, trusted provenance, conflict resolution, importance ranking, or patient publication state."
            ].join(" ")
          }]
        },
        contents: [{
          role: "user",
          parts: [{
            text: [
              `Operation: ${request.operation}.`,
              operationInstruction(request.operation),
              request.operation === "patient_summary"
                ? "Return JSON with keys: status, summary, key_points, review_state, reason. Use status generated or no_relevant_content."
                : "Return JSON with keys: summary, key_points, review_state.",
              "Set review_state to needs_review unless the source explicitly supports the statement.",
              "Redacted source text:",
              request.redactedText
            ].join("\n")
          }]
        }],
        generationConfig: {
          responseFormat: {
            text: {
              mimeType: "APPLICATION_JSON",
              schema: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  key_points: { type: "array", items: { type: "string" } },
                  review_state: { type: "string" },
                  status: { type: "string" },
                  reason: { type: "string" }
                },
                required: request.operation === "patient_summary"
                  ? ["key_points", "review_state"]
                  : ["summary", "key_points", "review_state"]
              }
            }
          }
        }
        })
      });
    } catch (error) {
      if (isAbortError(error)) throw new LlmProviderError("provider_timeout", "Gemini provider timed out");
      throw new LlmProviderError("provider_error", "Gemini provider request failed");
    } finally {
      timeout.clear();
    }
    if (!response.ok) {
      const errorText = await response.text();
      let message = response.statusText || "provider error";
      try {
        const payload = JSON.parse(errorText) as { error?: { message?: unknown; status?: unknown } };
        const providerMessage = typeof payload.error?.message === "string" ? payload.error.message : null;
        const providerStatus = typeof payload.error?.status === "string" ? payload.error.status : null;
        message = [providerStatus, providerMessage].filter(Boolean).join(": ") || message;
      } catch {
        message = response.statusText || "provider error";
      }
      throw new LlmProviderError(classifyStatus(response.status), `Gemini provider failed with ${response.status}: ${message}`);
    }

    const payload = await response.json() as GeminiGenerateContentResponse;
    const text = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) throw new LlmProviderError("provider_error", "Gemini provider returned no candidate text");
    assertStructuredJson(text);

    return {
      provider: "gemini",
      providerDisplayName: providerDisplayName(this.model),
      model: this.model,
      text
    };
  }
}

export function configuredProvider(): LlmProvider {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (geminiApiKey) return new GeminiProvider(geminiApiKey, process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);

  const endpoint = process.env.LLM_PROVIDER_ENDPOINT;
  const apiKey = process.env.LLM_PROVIDER_API_KEY;
  return endpoint && apiKey ? new OptionalHttpProvider(endpoint, apiKey) : new DeterministicMockProvider();
}
