import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const revertSchema = z.object({
  expectedVersion: z.number().int().positive(),
  revertToVersion: z.number().int().positive()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const body = revertSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid revert payload", "validation_error");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("revert_care_entry", {
    p_entry_id: id,
    p_expected_version: body.data.expectedVersion,
    p_revert_to_version: body.data.revertToVersion
  });

  if (error) return jsonError(403, "Entry could not be reverted.", "database_error", error);
  if (data?.status === "conflict") return NextResponse.json({ ...data, code: "concurrency_conflict", message: "This note was updated by someone else. Review the latest version before reverting." }, { status: 409 });
  if (data?.status !== "ok") return jsonError(404, "Entry or version not found", "not_found");
  return NextResponse.json(data);
}
