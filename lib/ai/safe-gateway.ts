import { redactionAuditMetadata, redactForLlm } from "./redaction.ts";
import { configuredProvider, type LlmOperation, type LlmProvider } from "./provider.ts";

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
      return { ok: false as const, state: "needs_review" as const, redaction, auditMetadata, providerError: "empty provider response" };
    }
    return { ok: true as const, state: "redacted_provider_invoked" as const, redaction, auditMetadata, response };
  } catch (error) {
    return {
      ok: false as const,
      state: "needs_review" as const,
      redaction,
      auditMetadata,
      providerError: error instanceof Error ? error.message : "provider invocation failed"
    };
  }
}
