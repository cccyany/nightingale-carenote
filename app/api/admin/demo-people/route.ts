import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const demoPersonSchema = z.object({
  name: z.string().min(1).max(120),
  clinicId: z.string().uuid(),
  role: z.enum(["admin", "clinician", "staff"])
});

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "demo-person";
}

export async function POST(request: NextRequest) {
  const body = demoPersonSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid demo person payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const actorSupabase = await createSupabaseActorClient(token);
  const { data: isPlatformAdmin, error: platformError } = await actorSupabase.rpc("is_platform_admin", {});
  if (platformError || !isPlatformAdmin) {
    return jsonError(403, "Only platform administrators can create demo people.", "forbidden", platformError);
  }

  const profileId = randomUUID();
  const email = `${slug(body.data.name)}-${profileId.slice(0, 8)}@example.test`;
  const adminSupabase = createSupabaseAdminClient();
  const { error: authError } = await adminSupabase.auth.admin.createUser({
    id: profileId,
    email,
    password: "demo-password",
    email_confirm: true,
    user_metadata: { synthetic_demo: true, generated_demo_identity: true }
  });
  if (authError) return jsonError(500, "Demo auth identity could not be created.", "database_error", authError);

  const { data, error } = await actorSupabase.rpc("create_demo_person_record", {
    p_profile_id: profileId,
    p_email: email,
    p_display_name: body.data.name,
    p_clinic_id: body.data.clinicId,
    p_role: body.data.role
  });
  if (error) return jsonError(403, "Demo person could not be provisioned.", "database_error", error);

  return NextResponse.json(data, { status: 201 });
}
