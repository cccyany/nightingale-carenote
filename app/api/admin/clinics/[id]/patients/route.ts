import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const patientSchema = z.object({
  displayName: z.string().min(1).max(160),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  profileId: z.string().uuid().optional().nullable(),
  synthetic: z.boolean().default(true)
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = patientSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid patient payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("create_managed_patient", {
    p_clinic_id: id,
    p_display_name: body.data.displayName,
    p_date_of_birth: body.data.dateOfBirth,
    p_profile_id: body.data.profileId ?? null,
    p_synthetic: body.data.synthetic
  });
  if (error) return jsonError(403, "Patient could not be created.", "database_error", error);

  return NextResponse.json({ patientId: data }, { status: 201 });
}
