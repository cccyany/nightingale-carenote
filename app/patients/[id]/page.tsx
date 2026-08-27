import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
import {
  AiScribeComposer,
  CommentComposer,
  CommentResolveButton,
  EntryEditor,
  HighlightFeedbackButtons,
  NoteComposer,
  PatientContentStatusButtons,
  ReplyComposer,
  TaskComposer,
  TaskStatusButton
} from "@/components/CareNoteActions";
import { EvidenceText } from "@/components/EvidenceText";
import { getClinicAssignableUsers, getPatientCareNote, type CareNoteEntry, type GlanceItem } from "@/lib/carenote-data";
import { filterForRole } from "@/lib/timeline-filters";

const filters = [
  ["all", "All"],
  ["ai", "AI Scribe"],
  ["clinician", "Clinician"],
  ["staff", "Staff"],
  ["patient", "Patient"],
  ["system", "System"]
];

const validationNoisePatterns = [
  /\bSynthetic safety future\b/i,
  /\bSynthetic staff-owned note\b/i,
  /\bSynthetic first writer wins\b/i,
  /\bSynthetic audit updated content\b/i,
  /\bSynthetic revision base\b/i,
  /\bSynthetic low trust draft\b/i,
  /\bSynthetic provenance base\b/i,
  /\bSynthetic extraction base\b/i
];

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
      return {
        body: renderGeneratedSummary(parsed.generated),
        provider: parsed.provider_display ?? parsed.model ?? null,
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

function renderGeneratedSummary(generated: string) {
  try {
    const parsed = JSON.parse(generated) as { summary?: unknown; key_points?: unknown };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const keyPoints = Array.isArray(parsed.key_points)
      ? parsed.key_points.filter((point): point is string => typeof point === "string" && Boolean(point.trim()))
      : [];
    if (summary || keyPoints.length) {
      return [summary, ...keyPoints.map((point) => `- ${point.trim()}`)].filter(Boolean).join("\n");
    }
  } catch {
    return generated;
  }
  return generated;
}

function preview(content: string) {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function isValidationNoiseText(text: string) {
  return validationNoisePatterns.some((pattern) => pattern.test(text));
}

function isValidationNoiseEntry(entry: CareNoteEntry, sourceEntryId?: string) {
  if (entry.id === sourceEntryId) return false;
  return isValidationNoiseText(entry.content.trim());
}

function isValidationNoiseTask(title: string) {
  return /^Synthetic collaboration follow-up\b/i.test(title.trim());
}

function isValidationNoiseGlance(item: GlanceItem) {
  return isValidationNoiseText(`${item.title} ${item.short_summary} ${item.risk_reason}`);
}

function cleanDemoTitle(title: string) {
  if (title.startsWith("Synthetic patient approval")) return "Care instruction draft";
  if (title.startsWith("Synthetic approved summary")) return "Approved care summary";
  return title.replace(/\s+[0-9a-f-]{36}$/i, "");
}

function glanceKey(item: GlanceItem) {
  const title = item.title.toLowerCase();
  if (title.includes("allergy") && title.includes("conflict")) return "allergy_conflict";
  if (title.includes("dose") && title.includes("conflict")) return "medication_dose_conflict";
  if (title.includes("medication") && title.includes("conflict")) return "medication_conflict";
  if (title.includes("renal")) return "renal_panel_action";
  if (title.includes("cough")) return "persistent_cough";
  return `${item.rule_key ?? "item"}:${title}`;
}

function dedupeGlance(items: GlanceItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = glanceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
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

function riskClass(risk: string) {
  if (risk === "high" || risk === "critical") return "bg-red-700 text-white border-red-700";
  if (risk === "medium") return "bg-amber-100 text-amber-950 border-amber-200";
  return "bg-teal-50 text-teal-950 border-teal-100";
}

function humanRiskReason(reason: string) {
  if (reason.includes("ALLERGY_CONFLICT")) return "Potential allergy contradiction. Safety rules keep this item high priority until reviewed.";
  if (reason.includes("MEDICATION_DOSE_CONFLICT")) return "Medication dose information conflicts and needs clinician review.";
  if (reason.includes("MEDICATION_CONFLICT")) return "Medication status conflicts and should be reconciled before acting.";
  if (reason.includes("UNRESOLVED")) return "An open follow-up may affect near-term care.";
  return reason;
}

function componentLabel(key: string) {
  const labels: Record<string, string> = {
    risk: "Clinical severity",
    unresolved_action: "Unresolved action",
    recency: "Recent evidence",
    clinician_confirmation: "Clinician confirmed",
    entity_priority: "Clinical topic priority",
    decay: "Age/decay adjustment",
    adaptive: "Care-team feedback",
    final_score: "Final importance",
    storage_class: "Recency tier"
  };
  return labels[key] ?? displayToken(key);
}

function factSummary(fact: { entity_type: string; normalized_entity: string; value: string | null; unit: string | null; assertion: string; authority_role: string } | undefined) {
  if (!fact) return "Source fact unavailable";
  const value = fact.value ? ` - ${fact.value}${fact.unit ? ` ${fact.unit}` : ""}` : "";
  return `${displayToken(fact.entity_type)} - ${fact.normalized_entity}${value} - ${displayToken(fact.assertion)} - ${displayToken(fact.authority_role)}`;
}

function firstTranscriptSpan(entry: CareNoteEntry) {
  return entry.provenance_spans?.find((span) => span.provenance_sources?.source_kind === "transcript" && span.provenance_sources.source_content) ?? null;
}

export default async function PatientPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ demo?: string; filter?: string; source?: string; span?: string }>;
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
  const sourceSpan = result.glanceItems.find(
    (item) => item.provenance_span_id === sourceSpanId && item.provenance_spans?.entry_id === sourceEntryId
  )?.provenance_spans;
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
  const visibleGlance = dedupeGlance(result.glanceItems.filter((item) => !isValidationNoiseGlance(item)));
  const primaryGlance = visibleGlance.slice(0, 3);
  const secondaryGlance = visibleGlance.slice(3);
  const entryGroups = groupEntriesByDate(visibleEntries);

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

        <section className="mt-5 rounded-md border border-teal-800 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Care Glance</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">What needs attention now</h2>
              <p className="mt-1 text-sm text-stone-600">Top ranked, source-linked items. The timeline remains the source of truth.</p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-900">{visibleGlance.length} active items - showing top {primaryGlance.length}</span>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {primaryGlance.length ? primaryGlance.map((item) => (
              <article className={`rounded-md border p-4 shadow-sm ${item.risk === "high" || item.risk === "critical" ? "border-red-200 bg-red-50/60" : "border-stone-200 bg-white"}`} key={item.id}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full border px-2.5 py-1 font-semibold ${riskClass(item.risk)}`}>{item.risk.toUpperCase()}</span>
                  <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-700">{displayToken(item.status)}</span>
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-snug">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-800">{item.short_summary}</p>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="font-semibold text-stone-950">Why it matters</dt>
                    <dd className="mt-1 text-stone-700">{humanRiskReason(item.risk_reason)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-stone-950">Evidence</dt>
                    <dd className="mt-1 text-stone-700">{item.evidence_label}{item.status === "needs_review" ? " - review needed" : ""} - {item.evidence_explanation}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-stone-950">Recommended action</dt>
                    <dd className="mt-1 text-stone-700">{item.available_action}</dd>
                  </div>
                </dl>
                <details className="mt-3 rounded border border-stone-200 bg-white/70 p-2 text-xs text-stone-600">
                  <summary className="cursor-pointer font-semibold text-stone-800">Why prioritized</summary>
                  <p className="mt-2 text-stone-700">{item.ranking_explanation}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-2">
                    {Object.entries(item.importance_reasons ?? {})
                      .filter(([key]) => key !== "adaptive_detail" && key !== "explanations")
                      .map(([key, value]) => (
                        <div key={key}>
                          <dt className="font-medium">{componentLabel(key)}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    <div>
                      <dt className="font-medium">Recency tier</dt>
                      <dd>{displayToken(item.storage_class)}</dd>
                    </div>
                  </dl>
                  {item.rule_key ? <p className="mt-2">Safety rule: {displayToken(item.rule_key)}</p> : null}
                </details>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  {item.provenance_spans?.entry_id ? (
                    <Link className="rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients/${id}?demo=${encodeURIComponent(demo)}&source=${item.provenance_spans.entry_id}&span=${item.provenance_span_id}#entry-${item.provenance_spans.entry_id}`}>
                      Review evidence -&gt;
                    </Link>
                  ) : null}
                  {item.highlight_id ? <HighlightFeedbackButtons highlightId={item.highlight_id} /> : null}
                </div>
              </article>
            )) : (
              <p className="rounded-md border border-stone-200 bg-white p-4 text-stone-600">No active Glance items.</p>
            )}
          </div>
          {secondaryGlance.length ? (
            <details className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Additional active context</summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {secondaryGlance.map((item) => (
                  <div className="rounded border border-stone-200 bg-white p-3" key={item.id}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${riskClass(item.risk)}`}>{item.risk.toUpperCase()}</span>
                      <span>{displayToken(item.status)}</span>
                    </div>
                    <p className="mt-2 font-medium">{item.title}</p>
                    <p className="mt-1 text-stone-600">{preview(item.short_summary)}</p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

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
                        const displayContent = aiMeta?.body ?? entry.content;
                        const showHighlight = sourceEntryId === entry.id && !aiMeta;
                        const transcriptSpan = aiMeta ? firstTranscriptSpan(entry) : null;
                        const transcriptSource = transcriptSpan?.provenance_sources?.source_content ?? "";
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
                              <Link className="ml-auto rounded-md border border-stone-200 px-2.5 py-1 text-xs font-medium hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients/${id}/history?demo=${encodeURIComponent(demo)}&entry=${entry.id}`}>History</Link>
                            </div>
                            <div className="mt-3 text-sm leading-6 text-stone-800">
                              {showHighlight ? (
                                <EvidenceText content={entry.content} evidenceStart={sourceSpan?.char_start ?? null} evidenceEnd={sourceSpan?.char_end ?? null} />
                              ) : (
                                <p className="whitespace-pre-wrap">{preview(displayContent)}</p>
                              )}
                            </div>
                            {aiMeta ? (
                              <details className="mt-3 text-xs text-stone-600">
                                <summary className="cursor-pointer font-medium text-stone-700">AI details</summary>
                                <p className="mt-1">Provider: {aiMeta.provider ?? "Seeded demo system entry"}</p>
                                <p>Verification: {displayToken(aiMeta.reviewState)}</p>
                                {aiMeta.sourceLabel ? <p>Source: {aiMeta.sourceLabel}</p> : null}
                                {aiMeta.sourceSessionIdentifier ? <p>Source session retained for audit/provenance.</p> : null}
                                <p>Runtime AI-scribe calls pass through PHI redaction before inference.</p>
                              </details>
                            ) : null}
                            {transcriptSpan ? (
                              <details className={`mt-3 rounded border p-3 text-xs ${sourceEntryId === entry.id ? "border-amber-300 bg-amber-50" : "border-amber-200 bg-white/70"}`} open={sourceEntryId === entry.id}>
                                <summary className="cursor-pointer font-semibold text-stone-800">Review source</summary>
                                <p className="mt-2 text-stone-600">Source transcript. Highlighted text is exact source evidence; the generated summary remains needs verification.</p>
                                <div className="mt-2 max-h-52 overflow-auto rounded border border-stone-200 bg-white p-3 text-sm leading-6 text-stone-800">
                                  <EvidenceText content={transcriptSource} evidenceStart={transcriptSpan.char_start} evidenceEnd={transcriptSpan.char_end} />
                                </div>
                                {transcriptSpan.transcript_start_ms !== null && transcriptSpan.transcript_end_ms !== null ? (
                                  <p className="mt-2 text-stone-600">Transcript segment: {transcriptSpan.transcript_start_ms}ms-{transcriptSpan.transcript_end_ms}ms</p>
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
            <section className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Conflict review</h2>
              {result.factConflicts.length ? (
                <div className="mt-3 space-y-3">
                  {result.factConflicts.map((conflict) => {
                    const factA = factById.get(conflict.fact_a_id);
                    const factB = factById.get(conflict.fact_b_id);
                    const entryA = factA?.provenance_spans?.entry_id ? entryById.get(factA.provenance_spans.entry_id) : undefined;
                    const entryB = factB?.provenance_spans?.entry_id ? entryById.get(factB.provenance_spans.entry_id) : undefined;
                    return (
                      <div className="rounded-md border border-red-200 bg-red-50/70 p-3 text-sm" key={conflict.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <strong>{displayToken(conflict.conflict_type)}</strong>
                          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-red-900">{displayToken(conflict.status)}</span>
                        </div>
                        <div className="mt-3 grid gap-2">
                          <div className="rounded border border-white bg-white/80 p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Earlier evidence</p>
                            <p className="mt-1">{factSummary(factA)}</p>
                            <p className="text-xs text-stone-600">{entryA ? `${dateLabel(entryA.occurred_at)} - ${roleBadge(entryA)}` : "Source entry retained in provenance"}</p>
                            {entryA ? <Link className="mt-1 inline-flex text-xs font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}&source=${entryA.id}#entry-${entryA.id}`}>View source -&gt;</Link> : null}
                          </div>
                          <div className="text-center text-xs font-semibold text-stone-500">VS</div>
                          <div className="rounded border border-white bg-white/80 p-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Later evidence</p>
                            <p className="mt-1">{factSummary(factB)}</p>
                            <p className="text-xs text-stone-600">{entryB ? `${dateLabel(entryB.occurred_at)} - ${roleBadge(entryB)}` : "Source entry retained in provenance"}</p>
                            {entryB ? <Link className="mt-1 inline-flex text-xs font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}&source=${entryB.id}#entry-${entryB.id}`}>View source -&gt;</Link> : null}
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
                        </details>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-600">No unresolved conflicts.</p>
              )}
            </section>

            <section className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Patient-facing review</h2>
              {visiblePatientFacingContent.length ? (
                <div className="mt-3 space-y-2">
                  {visiblePatientFacingContent.map((item) => (
                    <div className="rounded border border-stone-200 p-3 text-sm" key={item.id}>
                      <div className="flex items-start justify-between gap-2">
                        <strong>{cleanDemoTitle(item.title)}</strong>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs">{displayToken(item.status)}</span>
                      </div>
                      <p className="mt-1 text-stone-700">{preview(item.body)}</p>
                      <p className="mt-2 text-xs text-stone-600">Evidence quality {Number(item.evidence_confidence).toFixed(2)} - {displayToken(item.review_status)}</p>
                      <PatientContentStatusButtons contentId={item.id} status={item.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-600">Nothing awaiting review.</p>
              )}
            </section>

            <NoteComposer patientId={id} />
            <AiScribeComposer patientId={id} actorRole={actor?.role} />
            <TaskComposer patientId={id} users={assignableUsers} />
            <section className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Follow-up tasks</h2>
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
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
