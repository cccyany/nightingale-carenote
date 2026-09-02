import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const createClinicSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(80).optional().nullable(),
  timezone: z.string().max(80).default("Asia/Singapore"),
  initialAdminProfileId: z.string().uuid().optional().nullable()
});

export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("list_managed_clinics");
  if (error) return jsonError(403, "Clinics could not be loaded.", "database_error", error);

  return NextResponse.json({ clinics: data ?? [] });
}

export async function POST(request: NextRequest) {
  const body = createClinicSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid clinic payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("platform_create_clinic", {
    p_name: body.data.name,
    p_code: body.data.code ?? null,
    p_timezone: body.data.timezone,
    p_initial_admin_profile_id: body.data.initialAdminProfileId ?? null
  });
  if (error) return jsonError(403, "Clinic could not be created.", "database_error", error);

  return NextResponse.json({ clinicId: data }, { status: 201 });
}
