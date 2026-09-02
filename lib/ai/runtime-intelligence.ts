import { extractStructuredCandidates, type CandidateType, type EvidenceQualityState, type StructuredCandidate } from "./extraction.ts";
import { transcriptTimestampForEvidence } from "./scribe.ts";

type SupabaseRpcClient = {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

type RuntimeTranscriptSegment = {
  start_ms: number;
  end_ms: number;
  text: string;
  speaker: string;
  display_speaker?: string;
  raw_speaker_label?: string;
};

type PersistRuntimeClinicalIntelligenceInput = {
  supabase: SupabaseRpcClient;
  patientId: string;
  entryId: string;
  sourceTranscript: string;
  sourceLabel: string;
  sessionIdentifier: string | null;
  segments: RuntimeTranscriptSegment[];
  provenanceRpcName?: string;
  glanceRpcName?: string;
  provenanceRpcExtraParams?: Record<string, unknown>;
};

type PersistedRuntimeClinicalIntelligence = {
  ok: true;
  extractedCandidates: number;
  persistedFacts: number;
  createdOrExistingConflicts: number;
  createdOrExistingGlanceItems: number;
  ignoredForGlance: number;
};

type FailedRuntimeClinicalIntelligence = {
  ok: false;
  code: "database_error" | "provenance_error";
  message: string;
  extractedCandidates: number;
  persistedFacts: number;
  createdOrExistingGlanceItems: number;
};

const factTypes = new Set<CandidateType>(["allergy", "medication", "dosage", "frequency"]);

function confidenceForEvidence(state: EvidenceQualityState) {
  if (state === "strong_evidence") return 1.0;
  if (state === "supported") return 0.75;
  return 0.5;
}

function reviewStatusForAiCandidate(candidate: StructuredCandidate) {
  if (candidate.reviewState === "rejected") return "rejected";
  return "needs_review";
}

function factValue(candidate: StructuredCandidate) {
  if (candidate.candidateType === "dosage") return candidate.value ?? null;
  if (candidate.candidateType === "frequency") return candidate.normalizedValue;
  return candidate.value ?? null;
}

function isNegatedMention(candidate: StructuredCandidate, sourceTranscript: string) {
  const preceding = sourceTranscript.slice(Math.max(0, candidate.charStart - 24), candidate.charStart).toLowerCase();
  return /\b(no|denies|denied|without)\s+$/.test(preceding);
}

function glanceCandidate(candidate: StructuredCandidate, sourceTranscript: string) {
  if (candidate.candidateType === "follow_up_action") {
    return {
      title: "Follow-up action to review",
      summary: `${candidate.sourceEvidenceText} was captured from an unverified AI Scribe source.`,
      ruleKey: "UNRESOLVED_TASK",
      featureKey: `follow_up_action:${candidate.normalizedValue}`,
      risk: "medium"
    };
  }
  if (
    candidate.candidateType === "symptom"
    && /cough|shortness of breath|dizziness/i.test(candidate.normalizedValue)
    && !isNegatedMention(candidate, sourceTranscript)
  ) {
    return {
      title: "Symptom to review",
      summary: `${candidate.sourceEvidenceText} was captured from an unverified AI Scribe source.`,
      ruleKey: "SYMPTOM_PERSISTENT",
      featureKey: `symptom:${candidate.normalizedValue}`,
      risk: "medium"
    };
  }
  return null;
}

async function rpc<T>(supabase: SupabaseRpcClient, name: string, params: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) {
    return { ok: false as const, error };
  }
  return { ok: true as const, data: data as T };
}

export async function persistRuntimeClinicalIntelligence({
  supabase,
  patientId,
  entryId,
  sourceTranscript,
  sourceLabel,
  sessionIdentifier,
  segments,
  provenanceRpcName = "create_provenance_for_transcript_span",
  glanceRpcName = "create_runtime_glance_candidate",
  provenanceRpcExtraParams = {}
}: PersistRuntimeClinicalIntelligenceInput): Promise<PersistedRuntimeClinicalIntelligence | FailedRuntimeClinicalIntelligence> {
  const candidates = extractStructuredCandidates({
    entryId,
    content: sourceTranscript,
    sourceVersion: 1,
    sourceSessionIdentifier: sessionIdentifier ?? undefined,
    authorRole: "system"
  });
  let persistedFacts = 0;
  let createdOrExistingGlanceItems = 0;

  for (const candidate of candidates) {
    const timestamps = transcriptTimestampForEvidence(candidate.charStart, sourceTranscript, segments);
    const span = await rpc<string>(supabase, provenanceRpcName, {
      p_entry_id: entryId,
      p_source_content: sourceTranscript,
      p_evidence_text: candidate.sourceEvidenceText,
      p_char_start: candidate.charStart,
      p_char_end: candidate.charEnd,
      p_source_label: sourceLabel,
      p_session_identifier: sessionIdentifier,
      p_transcript_start_ms: timestamps.startMs,
      p_transcript_end_ms: timestamps.endMs,
      ...provenanceRpcExtraParams
    });
    if (!span.ok) {
      return {
        ok: false,
        code: "provenance_error",
        message: "Runtime clinical intelligence could not attach exact source provenance.",
        extractedCandidates: candidates.length,
        persistedFacts,
        createdOrExistingGlanceItems
      };
    }

    if (factTypes.has(candidate.candidateType)) {
      const fact = await rpc<string>(supabase, "upsert_fact_from_span", {
        p_entry_id: entryId,
        p_entity_type: candidate.candidateType,
        p_normalized_entity: candidate.normalizedValue,
        p_value: factValue(candidate),
        p_unit: candidate.unit ?? null,
        p_assertion: candidate.assertion,
        p_provenance_span_id: span.data,
        p_confidence: confidenceForEvidence(candidate.evidenceQualityState),
        p_review_status: reviewStatusForAiCandidate(candidate),
        p_extraction_method: "deterministic_runtime_ai_scribe"
      });
      if (!fact.ok) {
        return {
          ok: false,
          code: "database_error",
          message: "Runtime clinical fact persistence failed.",
          extractedCandidates: candidates.length,
          persistedFacts,
          createdOrExistingGlanceItems
        };
      }
      persistedFacts += 1;
    }

    const glance = glanceCandidate(candidate, sourceTranscript);
    if (glance) {
      const item = await rpc(supabase, glanceRpcName, {
        p_patient_id: patientId,
        p_provenance_span_id: span.data,
        p_title: glance.title,
        p_summary: glance.summary,
        p_rule_key: glance.ruleKey,
        p_feature_key: glance.featureKey,
        p_risk: glance.risk,
        p_status: "needs_review"
      });
      if (!item.ok) {
        return {
          ok: false,
          code: "database_error",
          message: "Runtime Glance candidate persistence failed.",
          extractedCandidates: candidates.length,
          persistedFacts,
          createdOrExistingGlanceItems
        };
      }
      createdOrExistingGlanceItems += 1;
    }
  }

  const conflicts = await rpc<number>(supabase, "detect_fact_conflicts_for_patient", { p_patient_id: patientId });
  if (!conflicts.ok) {
    return {
      ok: false,
      code: "database_error",
      message: "Runtime conflict detection failed.",
      extractedCandidates: candidates.length,
      persistedFacts,
      createdOrExistingGlanceItems
    };
  }

  const reranked = await rpc<number>(supabase, "rerank_patient_glance", { p_patient_id: patientId });
  if (!reranked.ok) {
    return {
      ok: false,
      code: "database_error",
      message: "Runtime Glance reranking failed.",
      extractedCandidates: candidates.length,
      persistedFacts,
      createdOrExistingGlanceItems
    };
  }

  return {
    ok: true,
    extractedCandidates: candidates.length,
    persistedFacts,
    createdOrExistingConflicts: conflicts.data,
    createdOrExistingGlanceItems,
    ignoredForGlance: candidates.length - createdOrExistingGlanceItems
  };
}
