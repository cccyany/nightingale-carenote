import { redactionAuditMetadata, redactForLlm } from "./redaction.ts";
import { configuredProvider, LlmProviderError, type LlmOperation, type LlmProvider } from "./provider.ts";

export async function invokeSafeLlm(
  rawText: string,
  operation: LlmOperation,
  provider: LlmProvider = configuredProvider()
) {
  const redaction = redactForLlm(rawText);
  const auditMetadata = redactionAuditMetadata(redaction);
  if (!redaction.allowed) return { ok: false as const, state: "needs_review" as const, redaction, auditMetadata };
  try {
    const response = await provider.invoke({ redactedText: redaction.redactedText, operation });
    if (!response.text.trim()) {
      return { ok: false as const, state: "needs_review" as const, code: "provider_error" as const, redaction, auditMetadata, providerError: "provider_error" };
    }
    return { ok: true as const, state: "redacted_provider_invoked" as const, redaction, auditMetadata, response };
  } catch (error) {
    return {
      ok: false as const,
      state: "needs_review" as const,
      code: error instanceof LlmProviderError ? error.code : "provider_error",
      redaction,
      auditMetadata,
      providerError: error instanceof LlmProviderError
        ? error.code
        : error instanceof Error
          ? "provider_error"
          : "provider_error"
    };
  }
}
