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
  if (!body.success) return jsonError(400, "Invalid status payload");
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("set_patient_content_status", {
    p_content_id: id,
    p_status: body.data.status
  });
  if (error) return jsonError(403, error.message);
  return NextResponse.json({ content: data });
}
