export type SafeErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "provider_timeout"
  | "provider_unavailable"
  | "provider_error"
  | "database_error"
  | "concurrency_conflict"
  | "request_error";

export type SafeErrorPayload = {
  code: SafeErrorCode;
  message: string;
};

const sensitivePatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b[STFGM]\d{7}[A-Z]\b/gi,
  /(?:\+65[\s-]?)?(?:[689]\d{3}[\s-]?\d{4})\b/g,
  /\b(?:NRIC|FIN|IC|ID|passport|mrn|record)\s*[:#-]?\s*[A-Z0-9-]{4,}\b/gi,
  /\b(?:Jane Tan|Alex Lim|Sam Lee|Mina Koh|Dr Mina Koh|Avery Ong|Bo Chen|Clara Ng)\b/gi
];

export function sanitizeForLog(value: unknown): unknown {
  if (typeof value === "string") {
    return sensitivePatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeForLog(item)])
    );
  }
  return value;
}

export function safeMessage(code: SafeErrorCode) {
  switch (code) {
    case "validation_error":
      return "The request could not be validated.";
    case "unauthorized":
      return "Sign in is required.";
    case "forbidden":
      return "You do not have access to perform this action.";
    case "not_found":
      return "The requested record was not found.";
    case "provider_timeout":
      return "AI generation timed out. Existing verified information remains available; please retry later.";
    case "provider_unavailable":
      return "AI generation is temporarily unavailable. Existing verified information remains available; please retry later.";
    case "provider_error":
      return "AI generation could not be completed safely.";
    case "database_error":
      return "The database request could not be completed.";
    case "concurrency_conflict":
      return "This note was updated by someone else. Review the latest version before saving again.";
    default:
      return "The request could not be completed.";
  }
}

export function safeError(code: SafeErrorCode, message = safeMessage(code)): SafeErrorPayload {
  return { code, message: String(sanitizeForLog(message)) };
}

export function logSafeError(context: string, code: SafeErrorCode, details?: unknown) {
  console.error("[safe-error]", context, {
    code,
    details: sanitizeForLog(details ?? null)
  });
}
