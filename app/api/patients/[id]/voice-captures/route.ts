import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { invokeSafeLlm } from "@/lib/ai/safe-gateway";
import { buildAiScribeContent, transcriptEvidenceSpan, transcriptTimestampForEvidence } from "@/lib/ai/scribe";
import { persistRuntimeClinicalIntelligence } from "@/lib/ai/runtime-intelligence";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";
import {
  DEFAULT_GEMINI_TRANSCRIBE_MODEL,
  DeterministicTranscriptionProvider,
  TranscriptionProviderError,
  configuredTranscriptionProvider,
  transcriptText,
  type TranscriptionProvider,
  type TranscriptionResult
} from "@/lib/voice/transcription";

const captureSchema = z.object({
  syntheticTranscriptText: z.string().min(1),
  sourceLabel: z.string().min(1).default("Synthetic ambient consult"),
  entryType: z.enum(["ai_doctor_consult_summary", "ai_nurse_consult_summary", "ai_patient_session_summary"]).default("ai_doctor_consult_summary")
});
const speakerMappingSchema = z.object({
  sessionId: z.string().uuid(),
  mappings: z.array(z.object({
    segment_id: z.string().uuid(),
    semantic_speaker_role: z.enum(["patient", "clinician", "staff", "unknown"])
  })).min(1)
});

const entryTypes = ["ai_doctor_consult_summary", "ai_nurse_consult_summary", "ai_patient_session_summary"] as const;
const allowedAudioTypes = new Map([
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/m4a", "m4a"],
  ["audio/webm", "webm"]
]);
const maxAudioBytes = 25 * 1024 * 1024;

type VoicePermission = { ok: true; clinicId: string } | { ok: false; status: number; message: string };

async function requireVoiceCapturePermission(
  supabase: Awaited<ReturnType<typeof createSupabaseActorClient>>,
  patientId: string
): Promise<VoicePermission> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return { ok: false, status: 401, message: "Unauthorized" };

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, clinic_id")
    .eq("id", patientId)
    .single();
  if (patientError || !patient) return { ok: false, status: 404, message: "Patient not found" };

  const { data: membership, error: membershipError } = await supabase
    .from("clinic_memberships")
    .select("role")
    .eq("clinic_id", patient.clinic_id)
    .eq("profile_id", userData.user.id)
    .in("role", ["staff", "clinician", "admin"])
    .limit(1);

  if (membershipError || !membership?.length) return { ok: false, status: 403, message: "Forbidden" };
  return { ok: true, clinicId: patient.clinic_id };
}

function audioFailureMessage(code: string) {
  if (code === "provider_timeout") return "Transcription is taking too long. The recording has not been converted into a clinical note.";
  if (code === "provider_unavailable") return "Transcription is temporarily unavailable. Existing CareNote information remains available.";
  if (code === "invalid_audio") return "Audio could not be processed. Upload a non-empty WAV, MP3, M4A, or WebM file.";
  return "Transcription could not be completed safely. Existing CareNote information remains available.";
}

function summaryFailureMessage(code?: string) {
  if (code === "provider_timeout") return "Transcript saved. AI summary timed out and no clinical note was created.";
  if (code === "provider_unavailable") return "Transcript saved. AI summary is temporarily unavailable.";
  return "Transcript saved. AI summary could not be generated safely.";
}

async function parseRequest(request: NextRequest): Promise<
  | { ok: true; entryType: typeof entryTypes[number]; sourceLabel: string; provider: TranscriptionProvider; providerName: string; providerModel: string; input: { syntheticTranscriptText?: string; audio?: ArrayBuffer; mimeType?: string }; audioMetadata: Record<string, unknown> }
  | { ok: false; status: number; message: string; code: string }
> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) return { ok: false, status: 400, message: "Audio file is required.", code: "validation_error" };
    if (!audio.size) return { ok: false, status: 400, message: "Audio file is empty.", code: "invalid_audio" };
    if (audio.size > maxAudioBytes) return { ok: false, status: 413, message: "Audio file is too large for this prototype.", code: "invalid_audio" };
    if (!allowedAudioTypes.has(audio.type)) return { ok: false, status: 415, message: "Unsupported audio type. Upload WAV, MP3, M4A, or WebM.", code: "invalid_audio" };
    const entryType = entryTypes.includes(formData.get("entryType") as typeof entryTypes[number])
      ? formData.get("entryType") as typeof entryTypes[number]
      : "ai_doctor_consult_summary";
    const provider = configuredTranscriptionProvider();
    return {
      ok: true,
      entryType,
      sourceLabel: String(formData.get("sourceLabel") || "Ambient consult audio"),
      provider,
      providerName: "gemini",
      providerModel: process.env.GEMINI_TRANSCRIBE_MODEL || DEFAULT_GEMINI_TRANSCRIBE_MODEL,
      input: { audio: await audio.arrayBuffer(), mimeType: audio.type },
      audioMetadata: { mime_type: audio.type, size_bytes: audio.size, filename_present: Boolean(audio.name) }
    };
  }

  const body = captureSchema.safeParse(await request.json());
  if (!body.success) return { ok: false, status: 400, message: "Invalid voice capture payload", code: "validation_error" };
  return {
    ok: true,
    entryType: body.data.entryType,
    sourceLabel: body.data.sourceLabel,
    provider: new DeterministicTranscriptionProvider(),
    providerName: "deterministic_mock",
    providerModel: "deterministic_transcription",
    input: { syntheticTranscriptText: body.data.syntheticTranscriptText },
    audioMetadata: { mode: "synthetic_text_fixture" }
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const permission = await requireVoiceCapturePermission(supabase, id);
  if (!permission.ok) return jsonError(permission.status, permission.message, permission.status === 404 ? "not_found" : "forbidden");

  let parsed: Awaited<ReturnType<typeof parseRequest>>;
  try {
    parsed = await parseRequest(request);
  } catch (error) {
    const code = error instanceof TranscriptionProviderError ? error.code : "provider_error";
    return NextResponse.json({ status: "transcription_failed", code, message: audioFailureMessage(code) }, { status: 503 });
  }
  if (!parsed.ok) return jsonError(parsed.status, parsed.message, "validation_error");

  const { data: session, error: sessionError } = await supabase.rpc("create_voice_capture_session", {
    p_patient_id: id,
    p_source_label: parsed.sourceLabel,
    p_provider: parsed.providerName,
    p_model: parsed.providerModel,
    p_audio_metadata: parsed.audioMetadata
  });
  if (sessionError) return jsonError(403, "Voice capture session could not be created.", "database_error", sessionError);

  let transcription: TranscriptionResult;
  try {
    transcription = await parsed.provider.transcribe(parsed.input);
  } catch (error) {
    const code = error instanceof TranscriptionProviderError ? error.code : "provider_error";
    await supabase.rpc("set_voice_session_status", {
      p_session_id: session.id,
      p_status: "transcription_failed",
      p_error_code: code,
      p_summary_entry_id: null
    });
    return NextResponse.json({ status: "transcription_failed", code, message: audioFailureMessage(code), transcriptSessionId: session.id }, { status: code === "invalid_audio" ? 400 : 503 });
  }

  const segments = transcription.segments;
  const { data: completedSession, error: transcriptionError } = await supabase.rpc("complete_voice_transcription", {
    p_session_id: session.id,
    p_segments: segments,
    p_language_info: transcription.languageInfo ?? {}
  });
  if (transcriptionError) return jsonError(409, "Transcript source could not be recorded.", "database_error", transcriptionError);
  const { data: persistedSegments, error: segmentReadError } = await supabase
    .from("transcript_segments")
    .select("id, speaker, raw_speaker_label, display_speaker, semantic_speaker_role, start_ms, end_ms, text, confidence, uncertain")
    .eq("session_id", session.id)
    .order("start_ms", { ascending: true });
  if (segmentReadError) return jsonError(409, "Transcript segments could not be loaded.", "database_error", segmentReadError);

  const sourceSegments = (persistedSegments ?? segments) as typeof segments;
  const rawTranscript = transcriptText(sourceSegments);
  await supabase.rpc("set_voice_session_status", {
    p_session_id: session.id,
    p_status: "summarizing",
    p_error_code: null,
    p_summary_entry_id: null
  });

  const gateway = await invokeSafeLlm(rawTranscript, "ai_scribe_structured_ingest");
  if (!gateway.ok) {
    const code = gateway.code ?? "provider_error";
    await supabase.rpc("set_voice_session_status", {
      p_session_id: session.id,
      p_status: "summary_failed",
      p_error_code: code,
      p_summary_entry_id: null
    });
    return NextResponse.json({
      status: "summary_failed",
      code,
      message: summaryFailureMessage(code),
      transcriptSessionId: session.id,
      segments,
      redaction: gateway.auditMetadata,
      providerError: gateway.providerError ?? null
    }, { status: 422 });
  }

  const persistedContent = JSON.stringify(buildAiScribeContent(
    gateway.response,
    parsed.sourceLabel,
    session.id
  ));

  const { data: entryId, error: entryError } = await supabase.rpc("ingest_voice_ai_scribed_note", {
    p_patient_id: id,
    p_session_id: session.id,
    p_entry_type: parsed.entryType,
    p_content: persistedContent,
    p_source_label: parsed.sourceLabel
  });
  if (entryError) return jsonError(403, "AI scribe entry could not be persisted.", "database_error", entryError);

  const evidence = transcriptEvidenceSpan(rawTranscript);
  const timestamps = transcriptTimestampForEvidence(evidence.charStart, rawTranscript, segments);
  const { data: spanId, error: spanError } = await supabase.rpc("create_voice_provenance_for_transcript_span", {
    p_entry_id: entryId,
    p_session_id: session.id,
    p_source_content: rawTranscript,
    p_evidence_text: evidence.evidenceText,
    p_char_start: evidence.charStart,
    p_char_end: evidence.charEnd,
    p_source_label: parsed.sourceLabel,
    p_transcript_start_ms: timestamps.startMs,
    p_transcript_end_ms: timestamps.endMs
  });
  if (spanError) return jsonError(409, "AI summary was generated but source provenance did not validate.", "database_error", spanError);

  const intelligence = await persistRuntimeClinicalIntelligence({
    supabase,
    patientId: id,
    entryId,
    sourceTranscript: rawTranscript,
    sourceLabel: parsed.sourceLabel,
    sessionIdentifier: session.id,
    segments: sourceSegments,
    provenanceRpcName: "create_voice_provenance_for_transcript_span",
    glanceRpcName: "create_voice_runtime_glance_candidate",
    provenanceRpcExtraParams: { p_session_id: session.id }
  });

  await supabase.rpc("set_voice_session_status", {
    p_session_id: session.id,
    p_status: intelligence.ok ? "completed" : "summary_failed",
    p_error_code: intelligence.ok ? null : intelligence.code,
    p_summary_entry_id: entryId
  });

  return NextResponse.json({
    transcriptSessionId: session.id,
    transcriptStatus: completedSession.status,
    entryId,
    provenanceSpanId: spanId,
    intelligence,
    provider: gateway.response.providerDisplayName,
    model: gateway.response.model ?? null,
    transcriptionProvider: transcription.provider,
    transcriptionModel: transcription.model,
    segments: sourceSegments,
    redaction: gateway.auditMetadata,
    uncertainSegments: sourceSegments.filter((segment) => segment.uncertain).length
  }, { status: 201 });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = speakerMappingSchema.safeParse(await request.json());
  if (!body.success) return jsonError(400, "Invalid speaker mapping payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");

  const supabase = await createSupabaseActorClient(token);
  const permission = await requireVoiceCapturePermission(supabase, id);
  if (!permission.ok) return jsonError(permission.status, permission.message, permission.status === 404 ? "not_found" : "forbidden");

  const { data, error } = await supabase.rpc("confirm_transcript_speaker_mapping", {
    p_session_id: body.data.sessionId,
    p_mappings: body.data.mappings
  });
  if (error) return jsonError(403, "Speaker mapping could not be saved.", "database_error", error);
  return NextResponse.json({ status: "speaker_mapping_confirmed", updated: data });
}
