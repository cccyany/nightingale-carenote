import Link from "next/link";
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
  searchParams: Promise<{ entry?: string }>;
}) {
  const { id } = await params;
  const { entry: entryId } = await searchParams;
  if (!entryId) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
        <p>Select revision history from a timeline entry.</p>
        <Link className="mt-3 inline-block underline" href={`/patients/${id}`}>Back to CareNote</Link>
      </main>
    );
  }
  const { entry, versions } = await getEntryHistory(entryId);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <Link className="underline" href={`/patients/${id}`}>Back to CareNote</Link>
      <h1 className="mt-4 text-3xl font-semibold">Revision history</h1>
      <p className="mt-1 text-stone-700">{displayToken(entry.entry_type)} / current version {entry.current_version}</p>
      <div className="mt-5 space-y-3">
        {versions.map((version, index) => (
          <article className="rounded-md border border-stone-300 bg-white p-4" key={version.id}>
            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <strong>Version {version.version_number}</strong>
              <span>{timeLabel(version.changed_at)}</span>
              <span>{version.profiles?.display_name ?? "System"}</span>
              <span>{version.change_reason ?? "change"}</span>
              {version.reverted_from_version ? <span>from version {version.reverted_from_version}</span> : null}
              {version.version_number !== entry.current_version ? (
                <RevertButton entryId={entry.id} expectedVersion={entry.current_version} version={version.version_number} />
              ) : null}
            </div>
            <p className="mt-2 text-sm font-medium text-stone-700">{diffSummary(versions[index + 1]?.content ?? null, version.content)}</p>
            <pre className="mt-2 whitespace-pre-wrap rounded bg-stone-100 p-3 text-sm">{version.content}</pre>
          </article>
        ))}
      </div>
    </main>
  );
}
