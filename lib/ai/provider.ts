export type LlmOperation = "clinical_extraction" | "patient_summary" | "ai_scribe_structured_ingest";

export type LlmProviderRequest = {
  redactedText: string;
  operation: LlmOperation;
};

export type LlmProviderResponse = { provider: string; text: string };

export interface LlmProvider {
  invoke(request: LlmProviderRequest): Promise<LlmProviderResponse>;
}

export class DeterministicMockProvider implements LlmProvider {
  public seenPayloads: string[] = [];

  async invoke(request: LlmProviderRequest): Promise<LlmProviderResponse> {
    this.seenPayloads.push(request.redactedText);
    return { provider: "deterministic_mock", text: JSON.stringify({ status: "structured_extraction_ready" }) };
  }
}

export class OptionalHttpProvider implements LlmProvider {
  constructor(private endpoint: string, private apiKey: string) {}

  async invoke(request: LlmProviderRequest): Promise<LlmProviderResponse> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`LLM provider failed with ${response.status}`);
    const payload = await response.json();
    return { provider: "optional_http", text: String(payload.text ?? "") };
  }
}

export function configuredProvider(): LlmProvider {
  const endpoint = process.env.LLM_PROVIDER_ENDPOINT;
  const apiKey = process.env.LLM_PROVIDER_API_KEY;
  return endpoint && apiKey ? new OptionalHttpProvider(endpoint, apiKey) : new DeterministicMockProvider();
}
