import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAiScribePermission } from "@/lib/ai/authorization";
import { invokeSafeLlm } from "@/lib/ai/safe-gateway";
import { buildAiScribeContent, transcriptEvidenceSpan, transcriptTimestampForEvidence } from "@/lib/ai/scribe";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";
import { DeterministicTranscriptionProvider, transcriptText } from "@/lib/voice/transcription";

const captureSchema = z.object({
  syntheticTranscriptText: z.string().min(1),
  sourceLabel: z.string().min(1).default("Synthetic ambient consult"),
  entryType: z.enum(["ai_doctor_consult_summary", "ai_nurse_consult_summary", "ai_patient_session_summary"]).default("ai_doctor_consult_summary")
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = captureSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid voice capture payload");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const permission = await requireAiScribePermission(supabase, id);
  if (!permission.ok) return jsonError(permission.status, permission.message);

  const transcriber = new DeterministicTranscriptionProvider();
  const segments = await transcriber.transcribe({ syntheticTranscriptText: body.data.syntheticTranscriptText });
  const rawTranscript = transcriptText(segments);
  const gateway = await invokeSafeLlm(rawTranscript, "ai_scribe_structured_ingest");
  if (!gateway.ok) {
    return NextResponse.json({ status: "needs_review", redaction: gateway.auditMetadata, providerError: gateway.providerError ?? null }, { status: 422 });
  }

  const { data: session, error: transcriptError } = await supabase.rpc("create_transcript_session", {
    p_patient_id: id,
    p_source_label: body.data.sourceLabel,
    p_segments: segments
  });
  if (transcriptError) return jsonError(403, transcriptError.message);

  const persistedContent = JSON.stringify(buildAiScribeContent(
    gateway.response,
    body.data.sourceLabel,
    session.id
  ));

  const { data: entryId, error: entryError } = await supabase.rpc("ingest_ai_scribed_note", {
    p_patient_id: id,
    p_entry_type: body.data.entryType,
    p_content: persistedContent,
    p_source_label: body.data.sourceLabel,
    p_session_identifier: session.id
  });
  if (entryError) return jsonError(403, entryError.message);

  const evidence = transcriptEvidenceSpan(rawTranscript);
  const timestamps = transcriptTimestampForEvidence(evidence.charStart, rawTranscript, segments);
  const { data: spanId, error: spanError } = await supabase.rpc("create_provenance_for_transcript_span", {
    p_entry_id: entryId,
    p_source_content: rawTranscript,
    p_evidence_text: evidence.evidenceText,
    p_char_start: evidence.charStart,
    p_char_end: evidence.charEnd,
    p_source_label: body.data.sourceLabel,
    p_session_identifier: session.id,
    p_transcript_start_ms: timestamps.startMs,
    p_transcript_end_ms: timestamps.endMs
  });
  if (spanError) return jsonError(409, "AI summary was generated but source provenance did not validate.");

  return NextResponse.json({
    transcriptSessionId: session.id,
    entryId,
    provenanceSpanId: spanId,
    provider: gateway.response.providerDisplayName,
    model: gateway.response.model ?? null,
    redaction: gateway.auditMetadata,
    uncertainSegments: segments.filter((segment) => segment.uncertain).length
  }, { status: 201 });
}
