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

  constructor(endpoint: string, apiKey: string) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
  }

  async invoke(request: LlmProviderRequest): Promise<LlmProviderResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`LLM provider failed with ${response.status}`);
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
    return "Produce a concise patient-facing draft summary. It must be suitable for clinician review before publication.";
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

  constructor(apiKey: string, model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async invoke(request: LlmProviderRequest): Promise<LlmProviderResponse> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const response = await fetch(endpoint, {
      method: "POST",
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
              "Return JSON with keys: summary, key_points, review_state.",
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
                  review_state: { type: "string" }
                },
                required: ["summary", "key_points", "review_state"]
              }
            }
          }
        }
      })
    });
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
      throw new Error(`Gemini provider failed with ${response.status}: ${message}`);
    }

    const payload = await response.json() as GeminiGenerateContentResponse;
    const text = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) throw new Error("Gemini provider returned no candidate text");
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
