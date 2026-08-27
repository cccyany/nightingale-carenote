import Link from "next/link";
import { CommentComposer, CommentResolveButton, EntryEditor, HighlightFeedbackButtons, NoteComposer, PatientContentStatusButtons, TaskComposer, TaskStatusButton } from "@/components/CareNoteActions";
import { EvidenceText } from "@/components/EvidenceText";
import { filterForRole, getClinicAssignableUsers, getPatientCareNote } from "@/lib/carenote-data";

const filters = [
  ["all", "All"],
  ["ai", "AI Scribe"],
  ["clinician", "Clinician"],
  ["staff", "Staff"],
  ["patient", "Patient"],
  ["system", "System"]
];

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function displayToken(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function entryTone(role: string) {
  if (role === "system") return "border-amber-300 bg-amber-50/40";
  if (role === "clinician") return "border-teal-300";
  if (role === "staff") return "border-sky-300";
  if (role === "patient") return "border-violet-300";
  return "border-stone-300";
}

export default async function PatientPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ filter?: string; source?: string; span?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = await searchParams;
  const filter = filterForRole(resolvedSearch?.filter ?? "all");
  const result = await getPatientCareNote(id, filter);
  const assignableUsers = await getClinicAssignableUsers(result.patient.clinic_id);
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
  let currentDate = "";

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="rounded-md border border-stone-300 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{result.patient.clinics?.name}</p>
            <h1 className="mt-2 text-3xl font-semibold">{result.patient.display_name}</h1>
            <p className="mt-1 text-stone-700">DOB {dateLabel(result.patient.date_of_birth)} / synthetic demo record</p>
          </div>
          <Link className="rounded-md border border-stone-300 px-3 py-2 text-sm" href="/patient/me">Patient-safe view</Link>
        </div>
      </header>

      <section className="mt-5 rounded-md border border-teal-800 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Care Glance</h2>
            <p className="mt-1 text-sm text-stone-600">Top actionable items for the next consult. Source-of-truth remains the timeline.</p>
          </div>
          <span className="rounded bg-teal-50 px-3 py-1 text-sm text-teal-900">{Math.min(result.glanceItems.length, 5)} active items</span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {result.glanceItems.length ? result.glanceItems.slice(0, 5).map((item) => (
            <article className={`rounded-md border p-4 ${item.risk === "high" || item.risk === "critical" ? "border-red-300 bg-red-50/50" : "border-stone-300"}`} key={item.id}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded px-2 py-1 font-semibold ${item.risk === "high" || item.risk === "critical" ? "bg-red-700 text-white" : "bg-amber-100 text-amber-900"}`}>{item.risk.toUpperCase()} risk</span>
                <span className="rounded bg-white px-2 py-1">{displayToken(item.status)}</span>
                <span className="rounded bg-teal-50 px-2 py-1 text-teal-900">{item.storage_class}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm">{item.short_summary}</p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="font-semibold">Why it matters</dt>
                  <dd className="text-stone-700">{item.risk_reason}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Evidence</dt>
                  <dd className="text-stone-700">{item.evidence_label} / {item.evidence_explanation}</dd>
                </div>
                <div>
                  <dt className="font-semibold">Next action</dt>
                  <dd className="text-stone-700">{item.available_action}</dd>
                </div>
              </dl>
              <details className="mt-3 text-xs text-stone-600">
                <summary className="cursor-pointer font-semibold">Why prioritized</summary>
                <p className="mt-1">{item.ranking_explanation}</p>
                <p className="mt-1">Score {item.importance_score}; {Object.entries(item.importance_reasons ?? {}).filter(([key]) => key !== "adaptive_detail" && key !== "explanations").map(([key, value]) => `${key}: ${value}`).join(", ")}</p>
              </details>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {item.provenance_spans?.entry_id ? (
                  <Link className="rounded-md bg-stone-900 px-3 py-1.5 text-white" href={`/patients/${id}?source=${item.provenance_spans.entry_id}&span=${item.provenance_span_id}#entry-${item.provenance_spans.entry_id}`}>
                    View Source
                  </Link>
                ) : null}
                {item.highlight_id ? <HighlightFeedbackButtons highlightId={item.highlight_id} /> : null}
              </div>
            </article>
          )) : (
            <p className="rounded-md border border-stone-300 p-4 text-stone-600">No active Glance items.</p>
          )}
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <nav className="flex flex-wrap gap-2" aria-label="Timeline filters">
            {filters.map(([value, label]) => (
              <Link
                className={`rounded border px-3 py-1.5 text-sm ${filter === value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-stone-300 bg-white"}`}
                href={`/patients/${id}?filter=${value}`}
                key={value}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-4 space-y-3">
            {result.entries.length ? result.entries.map((entry) => (
              <div key={entry.id}>
                {currentDate !== dateLabel(entry.occurred_at) ? (
                  <h2 className="mt-6 border-b border-stone-300 pb-1 text-sm font-semibold uppercase tracking-wide text-stone-600">
                    {(currentDate = dateLabel(entry.occurred_at))}
                  </h2>
                ) : null}
                <article
                  className={`scroll-mt-6 rounded-md border p-4 ${entryTone(entry.author_role)} ${sourceEntryId === entry.id ? "ring-2 ring-amber-400" : ""}`}
                  id={`entry-${entry.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                    <span>{timeLabel(entry.occurred_at)}</span>
                    <span className="rounded bg-white px-2 py-0.5">{displayToken(entry.entry_type)}</span>
                    <span>{displayToken(entry.author_role)}</span>
                    <span>Version {entry.current_version}</span>
                    {entry.author_role === "system" ? <strong className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">AI-scribed / needs verification</strong> : null}
                    <Link className="ml-auto underline" href={`/patients/${id}/history?entry=${entry.id}`}>Revision history</Link>
                  </div>
                  <EvidenceText content={entry.content} evidenceStart={sourceEntryId === entry.id ? sourceSpan?.char_start : null} evidenceEnd={sourceEntryId === entry.id ? sourceSpan?.char_end : null} />
                  {entry.author_role === "staff" || entry.author_role === "clinician" ? <EntryEditor entry={entry} /> : null}
                  <CommentComposer entryId={entry.id} users={assignableUsers} />
                  {(commentsByEntry.get(entry.id) ?? []).length ? (
                    <div className="mt-3 space-y-2">
                      {(commentsByEntry.get(entry.id) ?? []).map((comment) => (
                        <div className="rounded border border-stone-200 bg-white p-2 text-sm" key={comment.id}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{comment.profiles?.display_name ?? "Care team"}</span>
                            <span className="text-stone-500">{timeLabel(comment.created_at)}</span>
                            {comment.parent_comment_id ? <span className="text-stone-500">reply</span> : null}
                            <CommentResolveButton commentId={comment.id} resolved={Boolean(comment.resolved_at)} />
                          </div>
                          <p className="mt-1">{comment.body}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              </div>
            )) : (
              <p className="rounded-md border border-stone-300 bg-white p-4 text-stone-600">No timeline entries match this filter.</p>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-stone-300 bg-white p-4">
            <h2 className="text-lg font-semibold">Conflict review</h2>
            {result.factConflicts.length ? (
              <div className="mt-3 space-y-2">
                {result.factConflicts.map((conflict) => (
                  <div className="rounded border border-red-200 bg-red-50 p-3 text-sm" key={conflict.id}>
                    <strong>{displayToken(conflict.conflict_type)}</strong>
                    <p className="mt-1 text-stone-700">Status: {displayToken(conflict.status)}</p>
                    <p className="mt-1 text-xs text-stone-700">Source A and Source B are both retained with provenance for clinician review.</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-stone-600">No unresolved conflicts.</p>
            )}
          </section>

          <section className="rounded-md border border-stone-300 bg-white p-4">
            <h2 className="text-lg font-semibold">Patient-facing review</h2>
            {result.patientFacingContent.length ? (
              <div className="mt-3 space-y-2">
                {result.patientFacingContent.map((item) => (
                  <div className="rounded border border-stone-200 p-3 text-sm" key={item.id}>
                    <strong>{item.title}</strong>
                    <p className="mt-1 text-stone-600">{displayToken(item.status)} / evidence {Number(item.evidence_confidence).toFixed(2)} / {displayToken(item.review_status)}</p>
                    <PatientContentStatusButtons contentId={item.id} status={item.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-stone-600">No patient-facing drafts awaiting review.</p>
            )}
          </section>

          <NoteComposer patientId={id} />
          <TaskComposer patientId={id} users={assignableUsers} />
          <section className="rounded-md border border-stone-300 bg-white p-4">
            <h2 className="text-lg font-semibold">Follow-up tasks</h2>
            <div className="mt-3 space-y-2">
              {result.tasks.length ? result.tasks.map((task) => (
                <div className="rounded border border-stone-200 p-2 text-sm" key={task.id}>
                  <div className="flex items-center justify-between gap-2">
                    <strong>{task.title}</strong>
                    <TaskStatusButton taskId={task.id} status={task.status} />
                  </div>
                  <p className="mt-1 text-stone-600">Assigned to {task.profiles?.display_name ?? "care team"} / {displayToken(task.status)}</p>
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
  );
}
