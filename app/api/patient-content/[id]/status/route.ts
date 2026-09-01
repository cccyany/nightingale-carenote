import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const statusSchema = z.object({
  status: z.enum(["approved", "rejected", "needs_clinician_approval", "draft"])
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = statusSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid status payload", "validation_error");
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("set_patient_content_status", {
    p_content_id: id,
    p_status: body.data.status
  });
  if (error) return jsonError(403, "Patient-facing content status could not be changed.", "database_error", error);
  return NextResponse.json({ content: data });
}
