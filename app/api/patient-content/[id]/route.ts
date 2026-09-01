import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const updateSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1)
});

async function ensurePatientContentReviewer(supabase: Awaited<ReturnType<typeof createSupabaseActorClient>>, contentId: string) {
  const { data: authUser, error: authError } = await supabase.auth.getUser();
  if (authError || !authUser.user) return { ok: false as const, status: 401, message: "Unauthorized" };

  const { data: content, error: contentError } = await supabase
    .from("patient_facing_content")
    .select("id, clinic_id")
    .eq("id", contentId)
    .single();
  if (contentError || !content) return { ok: false as const, status: 404, message: "Patient-facing content was not found." };

  const { data: membership, error: membershipError } = await supabase
    .from("clinic_memberships")
    .select("role")
    .eq("clinic_id", content.clinic_id)
    .eq("profile_id", authUser.user.id)
    .in("role", ["clinician", "admin"])
    .limit(1);
  if (membershipError || !membership?.length) {
    return { ok: false as const, status: 403, message: "Only clinicians and admins can revise patient-facing content." };
  }
  return { ok: true as const };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = updateSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid patient-facing content payload", "validation_error");
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const reviewer = await ensurePatientContentReviewer(supabase, id);
  if (!reviewer.ok) return jsonError(reviewer.status, reviewer.message, reviewer.status === 401 ? "unauthorized" : "forbidden");
  const { data, error } = await supabase.rpc("update_patient_facing_content", {
    p_content_id: id,
    p_title: body.data.title,
    p_body: body.data.body
  });
  if (error) return jsonError(403, "Patient-facing content could not be revised.", "database_error", error);
  return NextResponse.json({ content: data });
}
