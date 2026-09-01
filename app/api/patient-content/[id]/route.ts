import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const updateSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1)
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = updateSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid patient-facing content payload", "validation_error");
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("update_patient_facing_content", {
    p_content_id: id,
    p_title: body.data.title,
    p_body: body.data.body
  });
  if (error) return jsonError(403, "Patient-facing content could not be revised.", "database_error", error);
  return NextResponse.json({ content: data });
}
