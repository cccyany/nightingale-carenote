import { notFound } from "next/navigation";
import { getPatientTimelineForToken } from "@/lib/rbac";

export default async function PatientPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = getPatientTimelineForToken("demo-clinician", id);
  if (!result.ok) {
    notFound();
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold">{result.patient.displayName}</h1>
      <p className="mt-1 text-stone-700">{result.patient.age} · {result.patient.clinicName}</p>
      <section className="mt-6">
        <h2 className="text-xl font-semibold">Longitudinal timeline</h2>
        <div className="mt-3 space-y-3">
          {result.entries.map((entry) => (
            <article className="rounded-md border border-stone-300 bg-white p-4" key={entry.id}>
              <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                <span>{entry.occurredAt}</span>
                <span>{entry.entryType}</span>
                <span>{entry.authorRole}</span>
                {entry.authorRole === "system" ? <strong>AI-SCRIBED</strong> : null}
              </div>
              <p className="mt-2">{entry.content}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
