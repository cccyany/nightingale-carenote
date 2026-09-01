import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAiScribePermission } from "@/lib/ai/authorization";
import { invokeSafeLlm } from "@/lib/ai/safe-gateway";
import { buildAiScribeContent, parseAiScribeTranscript, transcriptEvidenceSpan, transcriptTimestampForEvidence } from "@/lib/ai/scribe";
import { persistRuntimeClinicalIntelligence } from "@/lib/ai/runtime-intelligence";
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
  if (!body.success) return jsonError(400, "Invalid AI scribe payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const permission = await requireAiScribePermission(supabase, id);
  if (!permission.ok) return jsonError(permission.status, permission.message, permission.status === 404 ? "not_found" : "forbidden");

  const parsedTranscript = parseAiScribeTranscript(body.data.rawTranscript);
  const sourceTranscript = parsedTranscript.sourceTranscript;
  const gateway = await invokeSafeLlm(body.data.rawTranscript, "ai_scribe_structured_ingest");
  if (!gateway.ok) {
    return NextResponse.json(
      { status: "needs_review", code: gateway.code ?? "provider_error", redaction: gateway.auditMetadata, providerError: gateway.providerError ?? null },
      { status: 422 }
    );
  }

  const { data: session, error: transcriptError } = await supabase.rpc("create_transcript_session", {
    p_patient_id: id,
    p_source_label: body.data.sourceLabel,
    p_segments: parsedTranscript.segments
  });
  if (transcriptError) return jsonError(403, "Transcript source could not be recorded.", "database_error", transcriptError);

  const persistedContent = JSON.stringify(buildAiScribeContent(
    gateway.response,
    body.data.sourceLabel,
    session.id
  ));

  const { data: entryId, error } = await supabase.rpc("ingest_ai_scribed_note", {
    p_patient_id: id,
    p_entry_type: body.data.entryType,
    p_content: persistedContent,
    p_source_label: body.data.sourceLabel,
    p_session_identifier: session.id
  });

  if (error) return jsonError(403, "AI scribe entry could not be persisted.", "database_error", error);
  const evidence = transcriptEvidenceSpan(sourceTranscript);
  const timestamps = transcriptTimestampForEvidence(evidence.charStart, sourceTranscript, parsedTranscript.segments);
  const { data: provenanceSpanId, error: provenanceError } = await supabase.rpc("create_provenance_for_transcript_span", {
    p_entry_id: entryId,
    p_source_content: sourceTranscript,
    p_evidence_text: evidence.evidenceText,
    p_char_start: evidence.charStart,
    p_char_end: evidence.charEnd,
    p_source_label: body.data.sourceLabel,
    p_session_identifier: session.id,
    p_transcript_start_ms: timestamps.startMs,
    p_transcript_end_ms: timestamps.endMs
  });
  if (provenanceError) return jsonError(409, "AI summary was generated but source provenance did not validate.", "database_error", provenanceError);

  const intelligence = await persistRuntimeClinicalIntelligence({
    supabase,
    patientId: id,
    entryId,
    sourceTranscript,
    sourceLabel: body.data.sourceLabel,
    sessionIdentifier: session.id,
    segments: parsedTranscript.segments
  });

  return NextResponse.json({
    entryId,
    transcriptSessionId: session.id,
    provenanceSpanId,
    intelligence,
    provider: gateway.response.providerDisplayName,
    model: gateway.response.model ?? null,
    redaction: gateway.auditMetadata
  }, { status: 201 });
}
