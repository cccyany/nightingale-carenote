import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const createEntrySchema = z.object({
  content: z.string().min(1),
  entryType: z.enum(["staff_note", "clinician_note", "instruction", "admin_event"]),
  visibility: z.enum(["staff_internal", "clinician_internal", "clinic_internal", "patient_approved", "admin_only"])
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase
    .from("care_entries")
    .select("id, clinic_id, patient_id, author_role, author_id, entry_type, visibility, content, current_version, occurred_at, created_at")
    .eq("patient_id", id)
    .order("occurred_at", { ascending: true });

  if (error) return jsonError(403, "Entries could not be loaded.", "database_error", error);
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = createEntrySchema.safeParse(await request.json());
  if (!body.success) {
    return jsonError(400, "Invalid entry payload", "validation_error");
  }
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("create_care_entry", {
    p_patient_id: id,
    p_entry_type: body.data.entryType,
    p_visibility: body.data.visibility,
    p_content: body.data.content
  });
  if (error) return jsonError(403, "Entry could not be created.", "database_error", error);
  return NextResponse.json(
    { entry: data },
    { status: 201 }
  );
}
