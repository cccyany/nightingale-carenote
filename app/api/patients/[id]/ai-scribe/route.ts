import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { invokeSafeLlm } from "@/lib/ai/safe-gateway";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const ingestSchema = z.object({
  rawTranscript: z.string().min(1),
  entryType: z.enum(["ai_doctor_consult_summary", "ai_nurse_consult_summary", "ai_patient_session_summary"]),
  sourceLabel: z.string().min(1),
  sessionIdentifier: z.string().min(1).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = ingestSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid AI scribe payload");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized");

  const gateway = await invokeSafeLlm(body.data.rawTranscript, "ai_scribe_structured_ingest");
  if (!gateway.ok) {
    return NextResponse.json(
      { status: "needs_review", redaction: gateway.auditMetadata },
      { status: 422 }
    );
  }

  const supabase = await createSupabaseActorClient(token);
  const { data, error } = await supabase.rpc("ingest_ai_scribed_note", {
    p_patient_id: id,
    p_entry_type: body.data.entryType,
    p_content: gateway.response.text,
    p_source_label: body.data.sourceLabel,
    p_session_identifier: body.data.sessionIdentifier ?? null
  });

  if (error) return jsonError(403, error.message);
  return NextResponse.json({ entryId: data, redaction: gateway.auditMetadata }, { status: 201 });
}
