import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
import { GlanceSection } from "@/components/GlanceSection";
import {
  AiScribeComposer,
  AmbientConsultComposer,
  CommentComposer,
  CommentResolveButton,
  EntryEditor,
  ConflictResolutionForm,
  NoteComposer,
  PatientFacingDraftComposer,
  PatientContentStatusButtons,
  ReplyComposer,
  TaskComposer,
  TaskStatusButton,
  type PatientDraftSourceEntry
} from "@/components/CareNoteActions";
import { EvidenceText } from "@/components/EvidenceText";
import { getClinicAssignableUsers, getPatientCareNote, type CareNoteEntry } from "@/lib/carenote-data";
import { isValidationNoiseText, presentableGlanceItems } from "@/lib/glance-presentation";
import { filterForRole } from "@/lib/timeline-filters";
import { transcriptSourceForDisplay } from "@/lib/ai/scribe";

const filters = [
  ["all", "All"],
  ["ai", "AI Scribe"],
  ["clinician", "Clinician"],
  ["staff", "Staff"],
  ["patient", "Patient"]
];

const sidebarSummaryClass = "cursor-pointer px-4 py-3 text-base font-semibold text-stone-900 hover:bg-stone-50";
const entryActionSummaryClass = "cursor-pointer text-sm font-semibold text-stone-800";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function displayToken(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function patientContentStatusLabel(value: string) {
  if (value === "needs_clinician_approval") return "Needs Approval";
  return displayToken(value);
}

function age(value: string) {
  const birthDate = new Date(value);
  const now = new Date("2026-08-27T12:00:00+08:00");
  let years = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) years -= 1;
  return years;
}

function entryTone(role: string) {
  if (role === "system") return "border-amber-200 bg-amber-50/50";
  if (role === "clinician") return "border-teal-200 bg-white";
  if (role === "staff") return "border-sky-200 bg-white";
  if (role === "patient") return "border-violet-200 bg-white";
  return "border-stone-200 bg-white";
}

function roleBadge(entry: CareNoteEntry) {
  if (entry.author_role === "system") return "AI Scribe";
  if (entry.entry_type === "clinician_note") return "Clinician Note";
  if (entry.entry_type === "staff_note") return "Staff Note";
  return displayToken(entry.entry_type);
}

function parseAiContent(content: string) {
  try {
    const parsed = JSON.parse(content) as {
      provider_display?: string;
      model?: string | null;
      review_state?: string;
      source_label?: string;
      source_session_identifier?: string | null;
      generated?: string;
    };
    if (parsed && typeof parsed === "object" && typeof parsed.generated === "string") {
      const generated = parseGeneratedSummary(parsed.generated);
      return {
        summary: generated.summary,
        keyPoints: generated.keyPoints,
        provider: parsed.provider_display ?? parsed.model ?? null,
        model: parsed.model ?? null,
        reviewState: parsed.review_state ?? "unverified",
        sourceLabel: parsed.source_label ?? null,
        sourceSessionIdentifier: parsed.source_session_identifier ?? null
      };
    }
  } catch {
    return null;
  }
  return null;
}

function parseGeneratedSummary(generated: string) {
  try {
    const parsed = JSON.parse(generated) as { summary?: unknown; key_points?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((point): point is string => typeof point === "string" && Boolean(point.trim()))
      : [];
    if (summary || keyPoints.length) {
      return {
        summary: summary || generated,
        keyPoints: keyPoints.map((point) => point.trim())
      };
    }
  } catch {
    return { summary: generated, keyPoints: [] };
  }
  return { summary: generated, keyPoints: [] };
}

function preview(content: string) {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function isValidationNoiseEntry(entry: CareNoteEntry, sourceEntryId?: string) {
  if (entry.id === sourceEntryId) return false;
  return isValidationNoiseText(entry.content.trim());
}

function isValidationNoiseTask(title: string) {
  return /^Synthetic collaboration follow-up\b/i.test(title.trim());
}

function cleanDemoTitle(title: string) {
  if (title.startsWith("Synthetic patient approval")) return "Care instruction draft";
  if (title.startsWith("Synthetic approved summary")) return "Approved care summary";
  return title.replace(/\s+[0-9a-f-]{36}$/i, "");
}

function contentTypeLabel(value: string) {
  return displayToken(value || "general_update");
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function groupEntriesByDate(entries: CareNoteEntry[]) {
  const groups: { label: string; entries: CareNoteEntry[] }[] = [];
  for (const entry of entries) {
    const label = dateLabel(entry.occurred_at);
    const existing = groups.find((group) => group.label === label);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }
  return groups;
}

function factSummary(fact: { entity_type: string; normalized_entity: string; value: string | null; unit: string | null; assertion: string; authority_role: string } | undefined) {
  if (!fact) return "Source fact unavailable";
  const value = fact.value ? ` - ${fact.value}${fact.unit ? ` ${fact.unit}` : ""}` : "";
  return `${displayToken(fact.entity_type)} - ${fact.normalized_entity}${value} - ${displayToken(fact.assertion)} - ${displayToken(fact.authority_role)}`;
}

function firstTranscriptSpan(entry: CareNoteEntry) {
  return entry.provenance_spans?.find((span) => span.provenance_sources?.source_kind === "transcript" && span.provenance_sources.source_content) ?? null;
}

function directTranscriptSegment(span: NonNullable<CareNoteEntry["provenance_spans"]>[number] | null) {
  const segment = span?.transcript_segments;
  if (!segment) return null;
  return {
    label: segment.display_speaker ?? segment.raw_speaker_label ?? segment.semantic_speaker_role ?? "unknown",
    rawLabel: segment.raw_speaker_label,
    text: segment.text,
    startMs: segment.start_ms,
    endMs: segment.end_ms
  };
}

export default async function PatientPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ demo?: string; filter?: string; source?: string; span?: string; patientDraftSource?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = await searchParams;
  const demo = resolvedSearch?.demo;
  if (!demo) {
    return (
      <AppShell>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
            <h1 className="text-3xl font-semibold">Choose a demo role</h1>
            <p className="mt-2 text-stone-700">CareNote pages load through role-authenticated Supabase sessions.</p>
            <Link className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-white" href="/login">View demo roles</Link>
          </section>
        </main>
      </AppShell>
    );
  }

  const filter = filterForRole(resolvedSearch?.filter ?? "all");
  const result = await getPatientCareNote(id, filter, demo);
  const assignableUsers = await getClinicAssignableUsers(result.patient.clinic_id, demo);
  const actor = actorForDemo(demo);
  const sourceEntryId = resolvedSearch?.source;
  const sourceSpanId = resolvedSearch?.span;
  const patientDraftSourceId = resolvedSearch?.patientDraftSource;
  const sourceSpan = result.glanceItems.find(
    (item) => item.provenance_span_id === sourceSpanId && item.provenance_spans?.entry_id === sourceEntryId
  )?.provenance_spans ?? result.patientFacingContent
    .flatMap((item) => item.patient_content_sources ?? [])
    .find((source) => source.provenance_span_id === sourceSpanId && source.source_entry_id === sourceEntryId)
    ?.provenance_spans ?? result.clinicalFacts
    .find((fact) => fact.provenance_span_id === sourceSpanId && fact.provenance_spans?.entry_id === sourceEntryId)
    ?.provenance_spans;
  const commentsByEntry = new Map<string, typeof result.comments>();
  for (const comment of result.comments) {
    const bucket = commentsByEntry.get(comment.entry_id) ?? [];
    bucket.push(comment);
    commentsByEntry.set(comment.entry_id, bucket);
  }
  const visibleEntries = result.entries.filter((entry) => !isValidationNoiseEntry(entry, sourceEntryId));
  const visibleTasks = result.tasks.filter((task) => !isValidationNoiseTask(task.title));
  const visiblePatientFacingContent = result.patientFacingContent.filter((item) => !isValidationNoiseText(`${item.title} ${item.body}`));
  const entryById = new Map(result.entries.map((entry) => [entry.id, entry]));
  const factById = new Map(result.clinicalFacts.map((fact) => [fact.id, fact]));
  const visibleFactConflicts = result.factConflicts.filter((conflict) => {
    const factA = factById.get(conflict.fact_a_id);
    const factB = factById.get(conflict.fact_b_id);
    return !isValidationNoiseText(`${factSummary(factA)} ${factSummary(factB)}`);
  });
  const visibleGlance = presentableGlanceItems(result.glanceItems);
  const entryGroups = groupEntriesByDate(visibleEntries);
  const canCreatePatientFacingDraft = actor?.role === "clinician" || actor?.role === "admin";
  const patientDraftSources = visibleEntries.map((entry) => ({
    id: entry.id,
    entry_type: entry.entry_type,
    author_role: entry.author_role,
    visibility: entry.visibility,
    content: entry.content,
    occurred_at: entry.occurred_at,
    current_version: entry.current_version,
    profiles: entry.profiles
  })) satisfies PatientDraftSourceEntry[];

  return (
    <AppShell demo={demo} patientId={id} patientName={result.patient.display_name} clinicName={result.patient.clinics?.name ?? actor?.clinicName}>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-600" aria-label="Breadcrumb">
          <Link className="font-medium text-teal-800 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients?demo=${encodeURIComponent(demo)}`}>
            Patients
          </Link>
          <span>/</span>
          <span className="font-medium text-stone-900">{result.patient.display_name}</span>
        </nav>

        <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{result.patient.clinics?.name}</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">{result.patient.display_name}</h1>
              <p className="mt-1 text-sm text-stone-600">
                {age(result.patient.date_of_birth)} - DOB {dateLabel(result.patient.date_of_birth)} - Synthetic demo record
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link className="rounded-md border border-teal-700 px-3 py-2 font-medium text-teal-900 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/patient/me?demo=demo-patient">Patient-safe view</Link>
              <Link className="rounded-md border border-stone-300 px-3 py-2 font-medium hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients/${id}/history?demo=${encodeURIComponent(demo)}&entry=${visibleEntries[0]?.id ?? ""}`}>History</Link>
            </div>
          </div>
        </section>

        <GlanceSection demo={demo} patientId={id} items={visibleGlance} />

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <nav className="flex flex-wrap gap-2" aria-label="Timeline filters">
              {filters.map(([value, label]) => (
                <Link
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 ${filter === value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-stone-200 bg-white hover:bg-stone-50"}`}
                  href={`/patients/${id}?demo=${encodeURIComponent(demo)}&filter=${value}`}
                  key={value}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="mt-4 space-y-3">
              {entryGroups.length ? entryGroups.map((group, groupIndex) => {
                const containsSource = group.entries.some((entry) => entry.id === sourceEntryId);
                return (
                  <details className="rounded-md border border-stone-200 bg-white shadow-sm" key={group.label} open={groupIndex === 0 || containsSource}>
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-stone-800">
                      <span>{group.label}</span>
                      <span className="ml-auto mr-2 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">{group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}</span>
                    </summary>
                    <div className="space-y-3 border-t border-stone-100 p-3">
                      {group.entries.map((entry) => {
                        const aiMeta = entry.author_role === "system" ? parseAiContent(entry.content) : null;
                        const entryComments = commentsByEntry.get(entry.id) ?? [];
                        const topLevelComments = entryComments.filter((comment) => !comment.parent_comment_id);
                        const repliesByParent = new Map<string, typeof entryComments>();
                        for (const comment of entryComments.filter((comment) => comment.parent_comment_id)) {
                          const parent = comment.parent_comment_id ?? "";
                          const replies = repliesByParent.get(parent) ?? [];
                          replies.push(comment);
                          repliesByParent.set(parent, replies);
                        }
                        const showHighlight = sourceEntryId === entry.id && !aiMeta;
                        const transcriptSpan = aiMeta ? firstTranscriptSpan(entry) : null;
                        const transcriptSource = transcriptSpan?.provenance_sources?.source_content ?? "";
                        const transcriptDisplay = transcriptSpan
                          ? transcriptSourceForDisplay(transcriptSource, transcriptSpan.char_start, transcriptSpan.char_end)
                          : null;
                        const transcriptSegment = directTranscriptSegment(transcriptSpan);
                        const segmentEvidenceStart = transcriptSegment && transcriptSpan ? transcriptSegment.text.indexOf(transcriptSpan.evidence_text.replace(/^[^:]+:\s*/, "")) : -1;
                        return (
                          <article
                            className={`scroll-mt-24 rounded-md border p-4 ${entryTone(entry.author_role)} ${sourceEntryId === entry.id ? "ring-2 ring-amber-400" : ""}`}
                            id={`entry-${entry.id}`}
                            key={entry.id}
                          >
                            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                              <span>{timeLabel(entry.occurred_at)}</span>
                              <span className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-800">{roleBadge(entry)}</span>
                              <span>{entry.profiles?.display_name ?? (entry.author_role === "system" ? "System" : "Care team")}</span>
                              {aiMeta ? <strong className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-950">{aiMeta.provider ? `${aiMeta.provider} - ` : ""}{displayToken(aiMeta.reviewState)}</strong> : null}
                              {!aiMeta && entry.author_role === "system" ? <strong className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-950">Needs verification</strong> : null}
                              <span className="ml-auto inline-flex flex-wrap items-center gap-2">
                                {entry.author_role === "system" && canCreatePatientFacingDraft ? (
                                  <Link
                                    className="rounded-md border border-teal-700 px-2.5 py-1 text-xs font-medium text-teal-900 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
                                    href={`/patients/${id}?demo=${encodeURIComponent(demo)}&patientDraftSource=${entry.id}#patient-facing-review`}
                                  >
                                    Patient draft
                                  </Link>
                                ) : null}
                                <Link className="rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients/${id}/history?demo=${encodeURIComponent(demo)}&entry=${entry.id}`}>History</Link>
                              </span>
                            </div>
                            <div className="mt-3 text-sm leading-6 text-stone-800">
                              {showHighlight ? (
                                <EvidenceText content={entry.content} evidenceStart={sourceSpan?.char_start ?? null} evidenceEnd={sourceSpan?.char_end ?? null} />
                              ) : (
                                <p className="whitespace-pre-wrap">{aiMeta ? aiMeta.summary : preview(entry.content)}</p>
                              )}
                            </div>
                            {aiMeta ? (
                              <details className="mt-3 text-xs text-stone-600">
                                <summary className="cursor-pointer font-medium text-stone-700">AI details</summary>
                                <p className="mt-1">Provider: {aiMeta.provider ?? "Seeded demo system entry"}</p>
                                {aiMeta.model ? <p>Model: {aiMeta.model}</p> : null}
                                <p>Review state: {displayToken(aiMeta.reviewState)}</p>
                                {aiMeta.sourceLabel ? <p>Source: {aiMeta.sourceLabel}</p> : null}
                                {aiMeta.sourceSessionIdentifier ? <p>Source session retained for audit/provenance.</p> : null}
                                {aiMeta.keyPoints.length ? (
                                  <div className="mt-2">
                                    <p className="font-medium text-stone-700">Key points</p>
                                    <ul className="mt-1 list-disc space-y-1 pl-5">
                                      {aiMeta.keyPoints.map((point) => <li key={point}>{point}</li>)}
                                    </ul>
                                  </div>
                                ) : null}
                                <p>Runtime AI-scribe calls pass through PHI redaction before inference.</p>
                              </details>
                            ) : null}
                            {transcriptSpan ? (
                              <details className={`mt-3 rounded-md border p-3 ${sourceEntryId === entry.id ? "border-amber-300 bg-amber-50" : "border-amber-200 bg-white/70"}`} open={sourceEntryId === entry.id}>
                                <summary className={entryActionSummaryClass}>Review source</summary>
                                <p className="mt-2 text-xs text-stone-600">Source transcript. Highlighted text is exact source evidence; the generated summary remains needs verification.</p>
                                {transcriptSegment ? (
                                  <div className="mt-2 rounded border border-stone-200 bg-white p-3 text-sm leading-6 text-stone-800">
                                    <p className="text-xs font-medium text-stone-500">
                                      {transcriptSegment.startMs}ms-{transcriptSegment.endMs}ms · {transcriptSegment.label}
                                      {transcriptSegment.rawLabel && transcriptSegment.rawLabel !== transcriptSegment.label ? ` · raw ${transcriptSegment.rawLabel}` : ""}
                                    </p>
                                    <EvidenceText
                                      content={transcriptSegment.text}
                                      evidenceStart={segmentEvidenceStart >= 0 ? segmentEvidenceStart : null}
                                      evidenceEnd={segmentEvidenceStart >= 0 ? segmentEvidenceStart + transcriptSpan.evidence_text.replace(/^[^:]+:\s*/, "").length : null}
                                    />
                                  </div>
                                ) : (
                                  <div className="mt-2 max-h-52 overflow-auto rounded border border-stone-200 bg-white p-3 text-sm leading-6 text-stone-800">
                                    <EvidenceText content={transcriptDisplay?.content ?? transcriptSource} evidenceStart={transcriptDisplay?.evidenceStart} evidenceEnd={transcriptDisplay?.evidenceEnd} />
                                  </div>
                                )}
                                {transcriptSpan.transcript_start_ms !== null && transcriptSpan.transcript_end_ms !== null ? (
                                  <p className="mt-2 text-xs text-stone-600">Transcript segment: {transcriptSpan.transcript_start_ms}ms-{transcriptSpan.transcript_end_ms}ms</p>
                                ) : null}
                              </details>
                            ) : null}
                            {entry.author_role === "staff" || entry.author_role === "clinician" ? <EntryEditor entry={entry} /> : null}
                            <CommentComposer entryId={entry.id} users={assignableUsers} />
                            {topLevelComments.length ? (
                              <div className="mt-3 space-y-2">
                                {topLevelComments.map((comment) => (
                                  <div className="rounded border border-stone-200 bg-white p-3 text-sm" key={comment.id}>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium">{comment.profiles?.display_name ?? "Care team"}</span>
                                      <span className="text-stone-500">{dateTimeLabel(comment.created_at)}</span>
                                      <CommentResolveButton commentId={comment.id} resolved={Boolean(comment.resolved_at)} />
                                    </div>
                                    <p className="mt-1 text-stone-800">{comment.body}</p>
                                    {(repliesByParent.get(comment.id) ?? []).map((reply) => (
                                      <div className="mt-2 rounded border border-stone-100 bg-stone-50 p-2" key={reply.id}>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                                          <span className="font-medium text-stone-700">{reply.profiles?.display_name ?? "Care team"}</span>
                                          <span>{dateTimeLabel(reply.created_at)}</span>
                                        </div>
                                        <p className="mt-1">{reply.body}</p>
                                      </div>
                                    ))}
                                    <ReplyComposer entryId={entry.id} parentCommentId={comment.id} />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </details>
                );
              }) : (
                <p className="rounded-md border border-stone-200 bg-white p-4 text-stone-600">No timeline entries match this filter.</p>
              )}
            </div>
          </section>

          <aside className="space-y-4">
            <details className="rounded-md border border-stone-200 bg-white shadow-sm" id="conflict-review">
              <summary className={sidebarSummaryClass}>
                <span>Conflict review</span>
                <span className="ml-auto mr-2 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">{countLabel(visibleFactConflicts.length, "conflict")}</span>
              </summary>
              <section className="border-t border-stone-100 p-4">
              {visibleFactConflicts.length ? (
                <div className="mt-3 space-y-3">
                  {visibleFactConflicts.map((conflict) => {
                    const factA = factById.get(conflict.fact_a_id);
                    const factB = factById.get(conflict.fact_b_id);
                    const entryA = factA?.provenance_spans?.entry_id ? entryById.get(factA.provenance_spans.entry_id) : undefined;
                    const entryB = factB?.provenance_spans?.entry_id ? entryById.get(factB.provenance_spans.entry_id) : undefined;
                    return (
                      <div className={`rounded-md border p-3 text-sm ${conflict.status === "unresolved" || conflict.status === "needs_further_review" ? "border-red-200 bg-red-50/70" : "border-stone-200 bg-stone-50"}`} id={`conflict-${conflict.id}`} key={conflict.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{displayToken(conflict.conflict_type)}</strong>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-stone-800">{displayToken(conflict.status)}</span>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <div className="rounded border border-white bg-white/80 p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Earlier evidence</p>
                            <p className="mt-1">{factSummary(factA)}</p>
                            <p className="text-xs text-stone-600">{entryA ? `${dateLabel(entryA.occurred_at)} - ${roleBadge(entryA)}` : "Source entry retained in provenance"}</p>
                            {entryA ? <Link className="mt-1 inline-flex text-xs font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}&source=${entryA.id}&span=${factA?.provenance_span_id ?? ""}#entry-${entryA.id}`}>View source -&gt;</Link> : null}
                          </div>
                          <div className="text-center text-xs font-semibold text-stone-500">VS</div>
                          <div className="rounded border border-white bg-white/80 p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Later evidence</p>
                            <p className="mt-1">{factSummary(factB)}</p>
                            <p className="text-xs text-stone-600">{entryB ? `${dateLabel(entryB.occurred_at)} - ${roleBadge(entryB)}` : "Source entry retained in provenance"}</p>
                            {entryB ? <Link className="mt-1 inline-flex text-xs font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}&source=${entryB.id}&span=${factB?.provenance_span_id ?? ""}#entry-${entryB.id}`}>View source -&gt;</Link> : null}
                          </div>
                        </div>
                        <dl className="mt-3 space-y-1 text-xs text-stone-700">
                          <div>
                            <dt className="font-semibold">Why flagged</dt>
                            <dd>These source facts disagree and require clinician review.</dd>
                          </div>
                        </dl>
                        <details className="mt-2 rounded border border-red-100 bg-white/60 p-2 text-xs text-stone-600">
                          <summary className="cursor-pointer font-medium text-stone-700">Technical details</summary>
                          <p className="mt-1">Deterministic rule: {displayToken(conflict.conflict_type)}</p>
                          {conflict.conflict_resolution_sources?.length ? <p>Reviewed provenance links: {conflict.conflict_resolution_sources.length}</p> : null}
                        </details>
                        {conflict.resolved_at || conflict.resolution_outcome ? (
                          <div className="mt-3 rounded border border-teal-100 bg-white/80 p-2 text-xs text-stone-700">
                            <p className="font-semibold text-stone-900">Resolution</p>
                            <p>{displayToken(conflict.resolution_outcome ?? conflict.status)}</p>
                            {conflict.profiles?.display_name ? <p>Resolved by: {conflict.profiles.display_name}</p> : null}
                            {conflict.resolved_at ? <p>Resolved at: {dateTimeLabel(conflict.resolved_at)}</p> : null}
                            {conflict.resolution_reason ? <p className="mt-1 whitespace-pre-wrap">Rationale: {conflict.resolution_reason}</p> : null}
                            {conflict.resolution_entry_id ? (
                              <Link className="mt-1 inline-flex font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}&source=${conflict.resolution_entry_id}#entry-${conflict.resolution_entry_id}`}>
                                View decision in timeline -&gt;
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                        <ConflictResolutionForm conflictId={conflict.id} status={conflict.status} conflictType={conflict.conflict_type} actorRole={actor?.role} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-600">No unresolved conflicts.</p>
              )}
              </section>
            </details>

            <details className="rounded-md border border-stone-200 bg-white shadow-sm" id="patient-facing-review" open={Boolean(patientDraftSourceId)}>
              <summary className={sidebarSummaryClass}>
                <span>Patient-facing review</span>
                <span className="ml-auto mr-2 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">{countLabel(visiblePatientFacingContent.length, "item")}</span>
              </summary>
              <section className="border-t border-stone-100 p-4">
              <p className="mt-1 text-sm text-stone-600">Create patient-safe summaries or instructions from selected care-record sources. Drafts stay hidden until approved.</p>
              <PatientFacingDraftComposer patientId={id} actorRole={actor?.role} entries={patientDraftSources} initialSourceId={patientDraftSourceId} />
              {visiblePatientFacingContent.length ? (
                <div className="mt-3 space-y-2">
                  {visiblePatientFacingContent.map((item) => (
                    <div className="rounded border border-stone-200 p-3 text-sm" key={item.id}>
                      <div className="flex items-start justify-between gap-2">
                        <strong>{cleanDemoTitle(item.title)}</strong>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">{patientContentStatusLabel(item.status)}</span>
                      </div>
                      <p className="mt-1 text-xs font-medium text-stone-600">
                        {contentTypeLabel(item.content_type)} - {item.generation_method === "ai_assisted" ? "AI-assisted draft" : "Manually created"} - Based on {item.source_count} care-record {item.source_count === 1 ? "entry" : "entries"}
                      </p>
                      <p className="mt-1 text-stone-700">{preview(item.body)}</p>
                      <p className="mt-2 text-xs text-stone-600">Evidence quality {Number(item.evidence_confidence).toFixed(2)} - {displayToken(item.review_status)}</p>
                      {item.patient_content_sources?.length ? (
                        <details className="mt-2 rounded border border-stone-200 bg-stone-50 p-2 text-xs text-stone-700">
                          <summary className="cursor-pointer font-medium">Review sources</summary>
                          <ul className="mt-2 space-y-1">
                            {item.patient_content_sources.map((source) => (
                              <li className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2 py-1" key={source.id}>
                                <span>{displayToken(source.source_label)} - {dateTimeLabel(source.source_occurred_at)}</span>
                                <Link className="font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}&source=${source.source_entry_id}&span=${source.provenance_span_id}#entry-${source.source_entry_id}`}>
                                  View source -&gt;
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      <PatientContentStatusButtons contentId={item.id} status={item.status} title={item.title} body={item.body} actorRole={actor?.role} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">Nothing awaiting review.</p>
              )}
              </section>
            </details>

            <NoteComposer patientId={id} />
            <AmbientConsultComposer patientId={id} actorRole={actor?.role} />
            <AiScribeComposer patientId={id} actorRole={actor?.role} />
            <TaskComposer patientId={id} users={assignableUsers} />
            <details className="rounded-md border border-stone-200 bg-white shadow-sm">
              <summary className={sidebarSummaryClass}>
                <span>Follow-up tasks</span>
                <span className="ml-auto mr-2 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">{countLabel(visibleTasks.length, "task")}</span>
              </summary>
              <section className="border-t border-stone-100 p-4">
              <div className="mt-3 space-y-2">
                {visibleTasks.length ? visibleTasks.map((task) => (
                  <div className="rounded border border-stone-200 p-3 text-sm" key={task.id}>
                    <div className="flex items-start justify-between gap-2">
                      <strong>{task.title}</strong>
                      <TaskStatusButton taskId={task.id} status={task.status} />
                    </div>
                    <p className="mt-1 text-stone-600">Assignee: {task.profiles?.display_name ?? "Care team"}</p>
                    <p className="text-stone-600">Status: {displayToken(task.status)}</p>
                    {task.due_date ? <p className="text-stone-600">Due {dateLabel(task.due_date)}</p> : null}
                  </div>
                )) : (
                  <p className="text-sm text-stone-600">No open follow-up tasks.</p>
                )}
              </div>
              </section>
            </details>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
