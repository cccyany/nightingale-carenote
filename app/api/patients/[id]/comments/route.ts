import { NextRequest, NextResponse } from "next/server";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.from("comments").select("*").eq("patient_id", id);
  if (error) return jsonError(403, "Comments could not be loaded.", "database_error", error);
  return NextResponse.json({ comments: data ?? [] });
}
