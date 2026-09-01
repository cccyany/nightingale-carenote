import { NextRequest, NextResponse } from "next/server";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return jsonError(401, "Unauthorized", "unauthorized");
  }
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase
    .from("patients")
    .select("id, clinic_id, display_name, date_of_birth, clinics(name)")
    .order("display_name");

  if (error) return jsonError(403, "Patients could not be loaded.", "database_error", error);
  return NextResponse.json({ patients: data ?? [] });
}
