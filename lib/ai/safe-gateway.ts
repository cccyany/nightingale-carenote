import { redactionAuditMetadata, redactForLlm } from "@/lib/ai/redaction";
import { configuredProvider, type LlmOperation, type LlmProvider } from "@/lib/ai/provider";

export async function invokeSafeLlm(
  rawText: string,
  operation: LlmOperation,
  provider: LlmProvider = configuredProvider()
) {
  const redaction = redactForLlm(rawText);
  const auditMetadata = redactionAuditMetadata(redaction);
  if (!redaction.allowed) return { ok: false as const, state: "needs_review" as const, redaction, auditMetadata };
  const response = await provider.invoke({ redactedText: redaction.redactedText, operation });
  return { ok: true as const, state: "redacted_provider_invoked" as const, redaction, auditMetadata, response };
}
