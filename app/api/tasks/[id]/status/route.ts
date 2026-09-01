import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const statusSchema = z.object({
  status: z.enum(["open", "in_progress", "blocked", "completed", "cancelled"])
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const body = statusSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid task status payload", "validation_error");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("set_task_status", {
    p_task_id: id,
    p_status: body.data.status
  });

  if (error) return jsonError(403, "Task status could not be changed.", "database_error", error);
  return NextResponse.json({ task: data });
}
