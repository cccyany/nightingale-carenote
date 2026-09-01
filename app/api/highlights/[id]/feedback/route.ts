import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const feedbackSchema = z.object({
  feedbackType: z.enum(["exposure", "manual_highlight", "pin", "clinician_confirmation", "comment", "rejection"])
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = feedbackSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid feedback payload", "validation_error");
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("record_importance_feedback", {
    p_highlight_id: id,
    p_feedback_type: body.data.feedbackType
  });
  if (error) return jsonError(403, "Feedback could not be recorded.", "database_error", error);
  return NextResponse.json({ feedback: data }, { status: 201 });
}
