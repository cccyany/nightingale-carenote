import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { invokeSafeLlm } from "@/lib/ai/safe-gateway";
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

  const transcriber = new DeterministicTranscriptionProvider();
  const segments = await transcriber.transcribe({ syntheticTranscriptText: body.data.syntheticTranscriptText });
  const rawTranscript = transcriptText(segments);
  const gateway = await invokeSafeLlm(rawTranscript, "ai_scribe_structured_ingest");
  if (!gateway.ok) {
    return NextResponse.json({ status: "needs_review", redaction: gateway.auditMetadata }, { status: 422 });
  }

  const supabase = await createSupabaseActorClient(token);
  const { data: session, error: transcriptError } = await supabase.rpc("create_transcript_session", {
    p_patient_id: id,
    p_source_label: body.data.sourceLabel,
    p_segments: segments
  });
  if (transcriptError) return jsonError(403, transcriptError.message);

  const { data: entryId, error: entryError } = await supabase.rpc("ingest_ai_scribed_note", {
    p_patient_id: id,
    p_entry_type: body.data.entryType,
    p_content: gateway.response.text,
    p_source_label: body.data.sourceLabel,
    p_session_identifier: session.id
  });
  if (entryError) return jsonError(403, entryError.message);

  const firstSegment = segments[0];
  const evidence = gateway.response.text.slice(0, Math.min(32, gateway.response.text.length)) || "structured_extraction_ready";
  const { data: spanId, error: spanError } = await supabase.rpc("create_provenance_for_entry_span", {
    p_entry_id: entryId,
    p_evidence_text: evidence,
    p_char_start: 0,
    p_char_end: evidence.length,
    p_source_kind: "transcript",
    p_source_label: body.data.sourceLabel,
    p_transcript_start_ms: firstSegment?.start_ms ?? 0,
    p_transcript_end_ms: firstSegment?.end_ms ?? 0
  });
  if (spanError) return jsonError(403, spanError.message);

  return NextResponse.json({
    transcriptSessionId: session.id,
    entryId,
    provenanceSpanId: spanId,
    redaction: gateway.auditMetadata,
    uncertainSegments: segments.filter((segment) => segment.uncertain).length
  }, { status: 201 });
}
