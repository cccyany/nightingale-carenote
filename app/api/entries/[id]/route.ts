import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { authorizeEntryEdit, getEntryForToken } from "@/lib/rbac";

const editEntrySchema = z.object({
  expectedVersion: z.number().int().positive(),
  content: z.string().min(1)
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = getEntryForToken(bearerToken(request) ?? "", id);
  if (!result.ok) {
    return jsonError(result.status, result.error);
  }
  return NextResponse.json({ entry: result.entry });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = editEntrySchema.safeParse(await request.json());
  if (!body.success) {
    return jsonError(400, "Invalid edit payload");
  }
  const result = authorizeEntryEdit(bearerToken(request) ?? "", id, body.data.expectedVersion);
  if (!result.ok) {
    return jsonError(result.status, result.error);
  }
  return NextResponse.json({
    entry: {
      ...result.entry,
      content: body.data.content,
      currentVersion: result.entry.currentVersion + 1
    }
  });
}
