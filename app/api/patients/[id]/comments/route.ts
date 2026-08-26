import { NextRequest, NextResponse } from "next/server";
import { bearerToken, jsonError } from "@/lib/http";
import { listCommentsForToken } from "@/lib/rbac";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = listCommentsForToken(bearerToken(request) ?? "", id);
  if (!result.ok) {
    return jsonError(result.status, result.error);
  }
  return NextResponse.json({ comments: result.comments });
}
