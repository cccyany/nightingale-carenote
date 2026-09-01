import { NextRequest, NextResponse } from "next/server";
import { logSafeError, safeError, type SafeErrorCode } from "@/lib/safe-error";

export function bearerToken(request: NextRequest): string | null {
  const value = request.headers.get("authorization");
  if (!value?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return value.slice("bearer ".length).trim();
}

export function jsonError(status: number, error: string, code: SafeErrorCode = "request_error", details?: unknown) {
  const payload = safeError(code, error);
  if (details) logSafeError("api", code, details);
  return NextResponse.json({ error: payload.message, code: payload.code }, { status });
}
