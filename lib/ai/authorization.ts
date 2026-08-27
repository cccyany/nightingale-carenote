import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireAiScribePermission(supabase: SupabaseClient, patientId: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, status: 401, message: "Unauthorized" };
  }

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, clinic_id")
    .eq("id", patientId)
    .single();

  if (patientError || !patient) {
    return { ok: false as const, status: 404, message: "Patient not found" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("clinic_memberships")
    .select("role")
    .eq("clinic_id", patient.clinic_id)
    .eq("profile_id", userData.user.id)
    .in("role", ["clinician", "admin"])
    .limit(1);

  if (membershipError) {
    return { ok: false as const, status: 403, message: "Forbidden" };
  }
  if (!membership?.length) {
    return { ok: false as const, status: 403, message: "Forbidden" };
  }

  return { ok: true as const, clinicId: patient.clinic_id };
}
