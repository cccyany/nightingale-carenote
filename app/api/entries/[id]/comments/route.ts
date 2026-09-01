import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const commentSchema = z.object({
  body: z.string().min(1),
  parentCommentId: z.string().uuid().nullable().optional(),
  mentions: z.array(z.string().uuid()).default([])
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const body = commentSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid comment payload", "validation_error");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("create_comment", {
    p_entry_id: id,
    p_body: body.data.body,
    p_parent_comment_id: body.data.parentCommentId ?? null,
    p_mentions: body.data.mentions
  });

  if (error) return jsonError(403, "Comment could not be created.", "database_error", error);
  return NextResponse.json({ comment: data }, { status: 201 });
}
