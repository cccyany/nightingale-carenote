import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const resolutionSchema = z.object({
  outcome: z.enum(["accept_fact_a", "accept_fact_b", "corrected_value", "unable_to_determine"]),
  rationale: z.string().max(2000).default(""),
  expectedStatus: z.enum(["unresolved", "needs_further_review"]).default("unresolved"),
  corrected: z.object({
    entityType: z.enum(["allergy", "medication", "dosage", "frequency"]),
    normalizedEntity: z.string().min(1),
    value: z.string().optional().nullable(),
    unit: z.string().optional().nullable(),
    assertion: z.enum(["present", "absent", "unknown"]).default("present")
  }).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = resolutionSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid conflict resolution payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("resolve_fact_conflict", {
    p_conflict_id: id,
    p_outcome: body.data.outcome,
    p_rationale: body.data.rationale,
    p_expected_status: body.data.expectedStatus,
    p_corrected_entity_type: body.data.corrected?.entityType ?? null,
    p_corrected_normalized_entity: body.data.corrected?.normalizedEntity ?? null,
    p_corrected_value: body.data.corrected?.value ?? null,
    p_corrected_unit: body.data.corrected?.unit ?? null,
    p_corrected_assertion: body.data.corrected?.assertion ?? "present"
  });

  if (error) return jsonError(403, "Conflict resolution could not be recorded.", "database_error", error);
  if (data?.status === "conflict") {
    return NextResponse.json({
      code: "concurrency_conflict",
      message: "This conflict was already reviewed. Refresh before recording another decision.",
      ...data
    }, { status: 409 });
  }
  if (data?.status === "not_found") return jsonError(404, "Conflict not found.", "not_found");
  if (data?.status === "invalid") return jsonError(400, "Invalid conflict resolution payload", "validation_error");

  return NextResponse.json(data, { status: 200 });
}
