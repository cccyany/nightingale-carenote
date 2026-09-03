import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
import { RevertButton } from "@/components/CareNoteActions";
import { getEntryHistory } from "@/lib/carenote-data";
import { displayRevisionToken, parseAiRevisionSnapshot, revisionDiff } from "@/lib/revision-presentation";

function diffSummary(previous: string | null, current: string) {
  if (!previous) return "Initial version.";
  if (previous === current) return "No text changes.";
  return `Changed from ${previous.length} to ${current.length} characters.`;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore"
  }).format(new Date(value));
}

function displayToken(value: string) {
  return displayRevisionToken(value);
}

function technicalDetail(label: string, value: string | null) {
  return value ? { label, value } : null;
}

function hasTechnicalDetail(detail: ReturnType<typeof technicalDetail>): detail is { label: string; value: string } {
  return detail !== null;
}

function RevisionContent({ content, entryType }: { content: string; entryType: string }) {
  const aiRevision = entryType.startsWith("ai_") ? parseAiRevisionSnapshot(content) : null;
  if (!aiRevision) {
    return <pre className="mt-2 whitespace-pre-wrap rounded bg-stone-50 p-3 text-sm leading-6 text-stone-800">{content}</pre>;
  }

  const technicalDetails = [
    technicalDetail("Provider", aiRevision.providerDisplay ?? aiRevision.provider),
    technicalDetail("Model", aiRevision.model),
    technicalDetail("Review state", aiRevision.reviewState ? displayToken(aiRevision.reviewState) : null),
    technicalDetail("Generated at", aiRevision.generatedAt),
    technicalDetail("Source label", aiRevision.sourceLabel),
    technicalDetail("Source session identifier", aiRevision.sourceSessionIdentifier)
  ].filter(hasTechnicalDetail);

  return (
    <div className="mt-3 space-y-3 text-sm leading-6 text-stone-800">
      {aiRevision.reviewState === "unverified" ? (
        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-950">
          Unverified AI-generated content
        </span>
      ) : null}
      {aiRevision.summary ? (
        <section>
          <h2 className="text-sm font-semibold text-stone-950">Summary</h2>
          <p className="mt-1 whitespace-pre-wrap">{aiRevision.summary}</p>
        </section>
      ) : null}
      {aiRevision.keyPoints.length ? (
        <section>
          <h2 className="text-sm font-semibold text-stone-950">Key points</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {aiRevision.keyPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </section>
      ) : null}
      <details className="rounded border border-stone-200 bg-stone-50 p-3 text-xs text-stone-700">
        <summary className="cursor-pointer font-medium text-stone-800">Technical details</summary>
        {technicalDetails.length ? (
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {technicalDetails.map((detail) => (
              <div key={detail.label}>
                <dt className="font-medium text-stone-700">{detail.label}</dt>
                <dd className="mt-0.5 text-stone-600">{detail.value}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="mt-2">No structured provider metadata.</p>}
        <details className="mt-3 rounded border border-stone-200 bg-white p-3">
          <summary className="cursor-pointer font-medium text-stone-800">Raw immutable snapshot</summary>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-stone-700">{content}</pre>
        </details>
      </details>
    </div>
  );
}

function RevisionDiff({ previous, current }: { previous: string | null; current: string }) {
  if (!previous || previous === current) return null;
  return (
    <details className="mt-2 rounded border border-stone-200 bg-stone-50 p-3 text-sm" open>
      <summary className="cursor-pointer font-medium text-stone-800">Changes from previous version</summary>
      <div className="mt-2 whitespace-pre-wrap rounded bg-white p-3 leading-6 text-stone-800">
        {revisionDiff(previous, current).map((chunk, index) => {
          if (chunk.kind === "added") {
            return <ins className="rounded bg-emerald-100 px-0.5 text-emerald-950 no-underline" key={`${chunk.kind}-${index}`}>{chunk.value}</ins>;
          }
          if (chunk.kind === "removed") {
            return <del className="rounded bg-red-100 px-0.5 text-red-950" key={`${chunk.kind}-${index}`}>{chunk.value}</del>;
          }
          return <span key={`${chunk.kind}-${index}`}>{chunk.value}</span>;
        })}
      </div>
    </details>
  );
}

export default async function HistoryPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string; entry?: string }>;
}) {
  const { id } = await params;
  const { demo, entry: entryId } = await searchParams;
  if (!demo) {
    return (
      <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p>Select a demo role before opening revision history.</p>
        <Link className="mt-3 inline-block underline" href="/login">Demo roles</Link>
      </main>
      </AppShell>
    );
  }
  if (!entryId) {
    return (
      <AppShell demo={demo}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p>Select revision history from a timeline entry.</p>
        <Link className="mt-3 inline-block underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}`}>Back to CareNote</Link>
      </main>
      </AppShell>
    );
  }
  const { entry, versions } = await getEntryHistory(entryId, demo);
  const actor = actorForDemo(demo);
  const canRevert = actor?.role === "clinician" || (actor?.role === "admin" && !actor.platformAdmin);

  return (
    <AppShell demo={demo} patientId={id} clinicName={actor?.clinicName}>
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-stone-600" aria-label="Breadcrumb">
        <Link className="font-medium text-teal-800 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients?demo=${encodeURIComponent(demo)}`}>Patients</Link>
        <span>/</span>
        <Link className="font-medium text-teal-800 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients/${id}?demo=${encodeURIComponent(demo)}`}>CareNote</Link>
        <span>/</span>
        <span className="font-medium text-stone-900">Revision history</span>
      </nav>
      <Link className="mt-3 inline-flex text-sm font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}`}>← Back to CareNote</Link>
      <header className="mt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-teal-700">Revision History</h1>
      </header>
      <div className="mt-5 space-y-3">
        {versions.map((version, index) => {
          const previousContent = versions[index + 1]?.content ?? null;
          const isCurrentVersion = version.version_number === entry.current_version;
          return (
          <article className="rounded-md border border-stone-200 bg-white p-4 shadow-sm" key={version.id}>
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <strong className="text-stone-950">Version {version.version_number}</strong>
              <span>{timeLabel(version.changed_at)}</span>
              <span>{version.profiles?.display_name ?? "System"}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5">{version.change_reason ?? "change"}</span>
              {version.reverted_from_version ? <span>from version {version.reverted_from_version}</span> : null}
              {canRevert && !isCurrentVersion ? (
                <RevertButton actorToken={demo} entryId={entry.id} expectedVersion={entry.current_version} version={version.version_number} />
              ) : null}
            </div>
            {isCurrentVersion ? (
              <div className="mt-3">
                <h1 className="text-xl font-semibold tracking-tight text-stone-950">{displayToken(entry.entry_type)}</h1>
                <p className="mt-1 text-sm text-stone-700">Current version {entry.current_version}. Reverts create a new immutable version.</p>
              </div>
            ) : null}
            <p className="mt-2 text-sm font-medium text-stone-700">{diffSummary(previousContent, version.content)}</p>
            <RevisionDiff previous={previousContent} current={version.content} />
            <RevisionContent content={version.content} entryType={entry.entry_type} />
          </article>
          );
        })}
      </div>
    </main>
    </AppShell>
  );
}
