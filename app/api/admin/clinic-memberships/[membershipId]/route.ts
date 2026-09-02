import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const roleSchema = z.object({
  role: z.enum(["admin", "clinician", "staff"])
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await context.params;
  const body = roleSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid member role payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("update_clinic_member_role", {
    p_membership_id: membershipId,
    p_new_role: body.data.role
  });
  if (error) return jsonError(error.code === "23505" ? 409 : 403, "Clinic member role could not be updated.", "database_error", error);

  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ membershipId: string }> }) {
  const { membershipId } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("remove_clinic_member", {
    p_membership_id: membershipId
  });
  if (error) return jsonError(error.code === "23505" ? 409 : 403, "Clinic member could not be removed.", "database_error", error);

  return NextResponse.json(data);
}
