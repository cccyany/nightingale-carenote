import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const editEntrySchema = z.object({
  expectedVersion: z.number().int().positive(),
  content: z.string().min(1)
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.from("care_entries").select("*").eq("id", id).single();
  if (error) return jsonError(403, error.message);
  return NextResponse.json({ entry: data });
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
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("edit_care_entry", {
    p_entry_id: id,
    p_expected_version: body.data.expectedVersion,
    p_content: body.data.content,
    p_change_reason: "edited from CareNote"
  });
  if (error) return jsonError(403, error.message);
  if (data?.status === "conflict") {
    return NextResponse.json({ currentVersion: data.current_version, currentContent: data.current_content }, { status: 409 });
  }
  if (data?.status !== "ok") return jsonError(404, "Entry not found");
  return NextResponse.json(data);
}
