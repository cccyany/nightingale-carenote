import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const memberSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(["admin", "clinician", "staff"])
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = memberSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid member payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("provision_clinic_member", {
    p_clinic_id: id,
    p_profile_id: body.data.profileId,
    p_role: body.data.role
  });
  if (error) return jsonError(403, "Clinic member could not be provisioned.", "database_error", error);

  return NextResponse.json({ membershipId: data }, { status: 201 });
}
