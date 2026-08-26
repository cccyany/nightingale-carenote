import { NextRequest, NextResponse } from "next/server";

export function bearerToken(request: NextRequest): string | null {
  const value = request.headers.get("authorization");
  if (!value?.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return value.slice("bearer ".length).trim();
}

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}
