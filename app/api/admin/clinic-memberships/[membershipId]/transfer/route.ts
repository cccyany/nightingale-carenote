import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const transferSchema = z.object({
  targetClinicId: z.string().uuid(),
  role: z.enum(["admin", "clinician", "staff"])
});

export async function POST(request: NextRequest, context: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await context.params;
  const body = transferSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid member transfer payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("transfer_clinic_member", {
    p_membership_id: membershipId,
    p_target_clinic_id: body.data.targetClinicId,
    p_target_role: body.data.role
  });
  if (error) return jsonError(error.code === "23505" ? 409 : 403, "Clinic member could not be transferred.", "database_error", error);

  return NextResponse.json(data);
}
