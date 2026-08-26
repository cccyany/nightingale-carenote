import { NextRequest, NextResponse } from "next/server";
import { bearerToken, jsonError } from "@/lib/http";
import { authenticateToken, listPatientsForToken } from "@/lib/rbac";

export function GET(request: NextRequest) {
  const token = bearerToken(request);
  const auth = authenticateToken(token);
  if (!auth.ok) {
    return jsonError(auth.status, auth.error);
  }
  return NextResponse.json({ patients: listPatientsForToken(auth.user.token) });
}
