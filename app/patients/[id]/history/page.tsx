import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
import { RevertButton } from "@/components/CareNoteActions";
import { getEntryHistory } from "@/lib/carenote-data";

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
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

  return (
    <AppShell demo={demo} patientId={id} clinicName={actor?.clinicName}>
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link className="text-sm font-medium text-teal-800 hover:underline" href={`/patients/${id}?demo=${encodeURIComponent(demo)}`}>Back to CareNote</Link>
      <header className="mt-4 rounded-md border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Revision history</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{displayToken(entry.entry_type)}</h1>
        <p className="mt-1 text-stone-700">Current version {entry.current_version}. Reverts create a new immutable version.</p>
      </header>
      <div className="mt-5 space-y-3">
        {versions.map((version, index) => (
          <article className="rounded-md border border-stone-200 bg-white p-4 shadow-sm" key={version.id}>
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <strong className="text-stone-950">Version {version.version_number}</strong>
              <span>{timeLabel(version.changed_at)}</span>
              <span>{version.profiles?.display_name ?? "System"}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5">{version.change_reason ?? "change"}</span>
              {version.reverted_from_version ? <span>from version {version.reverted_from_version}</span> : null}
              {version.version_number !== entry.current_version ? (
                <RevertButton entryId={entry.id} expectedVersion={entry.current_version} version={version.version_number} />
              ) : null}
            </div>
            <p className="mt-2 text-sm font-medium text-stone-700">{diffSummary(versions[index + 1]?.content ?? null, version.content)}</p>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-stone-50 p-3 text-sm leading-6 text-stone-800">{version.content}</pre>
          </article>
        ))}
      </div>
    </main>
    </AppShell>
  );
}
