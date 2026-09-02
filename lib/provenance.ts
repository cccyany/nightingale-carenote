import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ProvenanceResolution =
  | {
      ok: true;
      spanId: string;
      entryId: string;
      versionId: string;
      evidenceText: string;
      charStart: number | null;
      charEnd: number | null;
      transcriptStartMs: number | null;
      transcriptEndMs: number | null;
      sourceLabel: string;
    }
  | { ok: false; spanId: string; reason: string };

export async function resolveProvenanceSpan(spanId: string): Promise<ProvenanceResolution> {
  const supabase = createSupabaseAdminClient();
  const { data: span, error } = await supabase
    .from("provenance_spans")
    .select(`
      id,
      evidence_text,
      char_start,
      char_end,
      transcript_start_ms,
      transcript_end_ms,
      transcript_segment_id,
      entry_id,
      entry_version_id,
      transcript_segments:transcript_segment_id(
        text,
        raw_speaker_label,
        display_speaker,
        semantic_speaker_role,
        start_ms,
        end_ms
      ),
      provenance_sources:source_id(
        source_label,
        source_entry_id,
        source_version_id
      ),
      care_entries:entry_id(id, content),
      entry_versions:entry_version_id(id, content)
    `)
    .eq("id", spanId)
    .single();

  if (error || !span) {
    return { ok: false, spanId, reason: "required source span is missing" };
  }

  const source = Array.isArray(span.provenance_sources) ? span.provenance_sources[0] : span.provenance_sources;
  const entry = Array.isArray(span.care_entries) ? span.care_entries[0] : span.care_entries;
  const version = Array.isArray(span.entry_versions) ? span.entry_versions[0] : span.entry_versions;

  if (!source || !entry) {
    return { ok: false, spanId, reason: "source entry cannot be resolved" };
  }
  if (!version) {
    return { ok: false, spanId, reason: "source version cannot be resolved" };
  }
  if (source.source_entry_id !== entry.id || source.source_version_id !== version.id) {
    return { ok: false, spanId, reason: "source relationship does not match span relationship" };
  }

  const content = version.content;
  const charStart = span.char_start;
  const charEnd = span.char_end;
  if (charStart !== null || charEnd !== null) {
    if (charStart === null || charEnd === null || charStart < 0 || charEnd < charStart || charEnd > content.length) {
      return { ok: false, spanId, reason: "evidence offsets are outside source bounds" };
    }
    if (content.slice(charStart, charEnd) !== span.evidence_text) {
      return { ok: false, spanId, reason: "evidence text does not match source span" };
    }
  }

  const transcriptStartMs = span.transcript_start_ms;
  const transcriptEndMs = span.transcript_end_ms;
  if (
    (transcriptStartMs !== null && transcriptStartMs < 0) ||
    (transcriptEndMs !== null && transcriptEndMs < 0) ||
    (transcriptStartMs !== null && transcriptEndMs !== null && transcriptEndMs < transcriptStartMs)
  ) {
    return { ok: false, spanId, reason: "transcript timestamps are invalid" };
  }

  return {
    ok: true,
    spanId,
    entryId: entry.id,
    versionId: version.id,
    evidenceText: span.evidence_text,
    charStart,
    charEnd,
    transcriptStartMs,
    transcriptEndMs,
    sourceLabel: source.source_label
  };
}
