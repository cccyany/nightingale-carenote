import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const taskSchema = z.object({
  title: z.string().min(1),
  assigneeId: z.string().uuid(),
  sourceEntryId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional()
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const body = taskSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid task payload", "validation_error");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("create_task", {
    p_patient_id: id,
    p_title: body.data.title,
    p_assignee_id: body.data.assigneeId,
    p_source_entry_id: body.data.sourceEntryId ?? null,
    p_due_date: body.data.dueDate ?? null
  });

  if (error) return jsonError(403, "Task could not be created.", "database_error", error);
  return NextResponse.json({ task: data }, { status: 201 });
}
