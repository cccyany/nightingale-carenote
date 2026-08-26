import { getPatientTimelineForToken } from "@/lib/rbac";

export default function PatientMePage() {
  const result = getPatientTimelineForToken("demo-patient", "patient-jane-tan");

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">My CareNote</h1>
      {result.ok ? (
        <div className="mt-5 space-y-3">
          {result.entries.map((entry) => (
            <article className="rounded-md border border-stone-300 bg-white p-4" key={entry.id}>
              <p className="text-sm text-stone-600">{entry.occurredAt}</p>
              <p className="mt-2">{entry.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5">No approved patient-facing content is available.</p>
      )}
    </main>
  );
}
