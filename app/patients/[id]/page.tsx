import Link from "next/link";
import { CommentComposer, CommentResolveButton, EntryEditor, NoteComposer, TaskComposer, TaskStatusButton } from "@/components/CareNoteActions";
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
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
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
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-10">
      <header className="border-b border-stone-300 pb-5">
        <p className="text-sm font-semibold uppercase text-teal-700">{result.patient.clinics?.name}</p>
        <h1 className="mt-2 text-3xl font-semibold">{result.patient.display_name}</h1>
        <p className="mt-1 text-stone-700">DOB {result.patient.date_of_birth} · Synthetic record</p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <section className="mb-6 rounded-md border border-teal-800 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Care Glance</h2>
              <span className="text-sm text-stone-600">Top {result.glanceItems.length} active items</span>
            </div>
            <div className="mt-3 grid gap-3">
              {result.glanceItems.slice(0, 5).map((item, index) => (
                <article className="rounded-md border border-stone-300 p-3" key={item.id}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <strong>#{index + 1} {item.title}</strong>
                    <span className={`rounded px-2 py-0.5 ${item.risk === "high" || item.risk === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{item.risk.toUpperCase()}</span>
                    <span className="rounded bg-stone-100 px-2 py-0.5">{item.status.toUpperCase()}</span>
                    <span>{item.evidence_label}</span>
                  </div>
                  <p className="mt-2 text-sm">{item.short_summary}</p>
                  <p className="mt-2 text-xs text-stone-600">Why: {item.risk_reason}</p>
                  <p className="text-xs text-stone-600">Evidence: {item.evidence_explanation}</p>
                  <p className="text-xs text-stone-600">Rank: score {item.importance_score}; {Object.entries(item.importance_reasons ?? {}).map(([key, value]) => `${key} +${value}`).join(", ")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{item.available_action}</span>
                    {item.provenance_spans?.entry_id ? (
                      <Link className="underline" href={`/patients/${id}?source=${item.provenance_spans.entry_id}&span=${item.provenance_span_id}#entry-${item.provenance_spans.entry_id}`}>
                        View Source
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <nav className="flex flex-wrap gap-2">
            {filters.map(([value, label]) => (
              <Link
                className={`rounded border px-3 py-1 text-sm ${filter === value ? "border-teal-700 bg-teal-50" : "border-stone-300 bg-white"}`}
                href={`/patients/${id}?filter=${value}`}
                key={value}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="mt-4 space-y-3">
          {result.entries.map((entry) => (
            <div key={entry.id}>
              {currentDate !== dateLabel(entry.occurred_at) ? (
                <h2 className="mt-6 border-b border-stone-300 pb-1 text-sm font-semibold uppercase text-stone-600">
                  {(currentDate = dateLabel(entry.occurred_at))}
                </h2>
              ) : null}
              <article
                className={`scroll-mt-6 rounded-md border bg-white p-4 ${entry.author_role === "system" ? "border-amber-300" : "border-stone-300"} ${sourceEntryId === entry.id ? "ring-2 ring-amber-400" : ""}`}
                id={`entry-${entry.id}`}
              >
                <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                  <span>{timeLabel(entry.occurred_at)}</span>
                  <span className="rounded bg-stone-100 px-2 py-0.5">{entry.entry_type}</span>
                  <span>{entry.author_role}</span>
                  <span>v{entry.current_version}</span>
                  {entry.author_role === "system" ? <strong className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">AI-SCRIBED · unverified</strong> : null}
                  <Link className="ml-auto underline" href={`/patients/${id}/history?entry=${entry.id}`}>History</Link>
                </div>
                <EvidenceText content={entry.content} evidenceStart={sourceEntryId === entry.id ? sourceSpan?.char_start : null} evidenceEnd={sourceEntryId === entry.id ? sourceSpan?.char_end : null} />
                {entry.author_role === "staff" || entry.author_role === "clinician" ? <EntryEditor entry={entry} /> : null}
                <CommentComposer entryId={entry.id} users={assignableUsers} />
                <div className="mt-3 space-y-2">
                  {(commentsByEntry.get(entry.id) ?? []).map((comment) => (
                    <div className="rounded border border-stone-200 bg-stone-50 p-2 text-sm" key={comment.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{comment.profiles?.display_name ?? "Unknown"}</span>
                        <span className="text-stone-500">{timeLabel(comment.created_at)}</span>
                        {comment.parent_comment_id ? <span className="text-stone-500">reply to {comment.parent_comment_id}</span> : null}
                        <CommentResolveButton commentId={comment.id} resolved={Boolean(comment.resolved_at)} />
                      </div>
                      <p className="mt-1">{comment.body}</p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-md border border-stone-300 bg-white p-4">
            <h2 className="text-lg font-semibold">Clinical intelligence</h2>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <h3 className="font-semibold">Open conflicts</h3>
                {result.factConflicts.length ? (
                  <div className="mt-2 space-y-2">
                    {result.factConflicts.map((conflict) => (
                      <div className="rounded border border-red-200 bg-red-50 p-2" key={conflict.id}>
                        <div className="flex flex-wrap gap-2">
                          <strong>{conflict.conflict_type}</strong>
                          <span>{conflict.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-stone-700">Both conflicting facts remain stored and traceable for review.</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-stone-600">No unresolved conflicts.</p>
                )}
              </div>
              <div>
                <h3 className="font-semibold">Extracted facts</h3>
                <div className="mt-2 space-y-2">
                  {result.clinicalFacts.slice(0, 6).map((fact) => (
                    <div className="rounded border border-stone-200 p-2" key={fact.id}>
                      <div className="flex flex-wrap gap-2">
                        <span>{fact.entity_type}</span>
                        <strong>{fact.normalized_entity}</strong>
                        <span>{fact.assertion}</span>
                      </div>
                      <p className="text-xs text-stone-600">
                        {fact.review_status}; evidence {Number(fact.evidence_confidence).toFixed(2)}; {fact.authority_role}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold">Patient-facing gate</h3>
                {result.patientFacingContent.length ? (
                  <div className="mt-2 space-y-2">
                    {result.patientFacingContent.map((item) => (
                      <div className="rounded border border-stone-200 p-2" key={item.id}>
                        <strong>{item.title}</strong>
                        <p className="text-xs text-stone-600">{item.status}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-stone-600">No generated patient-facing drafts.</p>
                )}
              </div>
            </div>
          </section>
          <NoteComposer patientId={id} />
          <TaskComposer patientId={id} users={assignableUsers} />
          <section className="rounded-md border border-stone-300 bg-white p-4">
            <h2 className="text-lg font-semibold">Tasks</h2>
            <div className="mt-3 space-y-2">
              {result.tasks.map((task) => (
                <div className="rounded border border-stone-200 p-2 text-sm" key={task.id}>
                  <div className="flex items-center justify-between gap-2">
                    <strong>{task.title}</strong>
                    <TaskStatusButton taskId={task.id} status={task.status} />
                  </div>
                  <p className="mt-1 text-stone-600">Assigned to {task.profiles?.display_name ?? task.assignee_id} · {task.status}</p>
                  {task.due_date ? <p className="text-stone-600">Due {task.due_date}</p> : null}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
