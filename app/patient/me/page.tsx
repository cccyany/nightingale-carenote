import Link from "next/link";
import { createSupabaseActorClient } from "@/lib/supabase/request";

export const dynamic = "force-dynamic";

function dateTimeLabel(value: string | null) {
  if (!value) return "recently approved";
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore"
  }).format(new Date(value));
}

function displayToken(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function PatientMePage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const demo = (await searchParams)?.demo;
  if (!demo || demo !== "demo-patient") {
    return (
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
        <section className="rounded-md border border-stone-300 bg-white p-5">
          <h1 className="text-3xl font-semibold">Choose a demo role</h1>
          <p className="mt-2 text-stone-700">Patient content is loaded through a patient-authenticated Supabase session.</p>
          <Link className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-white" href="/login">Demo roles</Link>
        </section>
      </main>
    );
  }

  const supabase = await createSupabaseActorClient(demo);
  const [{ data: entries, error }, { data: approvedContent, error: contentError }] = await Promise.all([
    supabase
      .from("care_entries")
      .select("id, content, occurred_at, entry_type")
      .eq("patient_id", "30000000-0000-0000-0000-000000000001")
      .in("visibility", ["patient_approved", "patient_submitted"])
      .order("occurred_at", { ascending: true }),
    supabase
      .from("patient_facing_content")
      .select("id, title, body, approved_at, created_at")
      .eq("patient_id", "30000000-0000-0000-0000-000000000001")
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
  ]);

  if (error) throw error;
  if (contentError) throw contentError;
  const visibleEntries = (entries ?? []).filter((entry) => !String(entry.entry_type).startsWith("ai_"));

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <header className="rounded-md border border-teal-700 bg-white p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Patient-safe CareNote</p>
        <h1 className="mt-2 text-3xl font-semibold">My CareNote</h1>
        <p className="mt-2 max-w-2xl text-stone-700">
          This view only shows information approved for the patient, plus patient-submitted items intended for sharing.
        </p>
      </header>

      {(approvedContent ?? []).length ? (
        <section className="mt-5">
          <h2 className="text-xl font-semibold">Approved summaries and instructions</h2>
          <div className="mt-3 space-y-3">
            {(approvedContent ?? []).map((item) => (
              <article className="rounded-md border border-teal-300 bg-white p-4" key={item.id}>
                <p className="text-sm text-stone-600">Approved {dateTimeLabel(item.approved_at ?? item.created_at)}</p>
                <h3 className="mt-1 font-semibold">{item.title}</h3>
                <p className="mt-2">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {visibleEntries.length ? (
        <section className="mt-5">
          <h2 className="text-xl font-semibold">Shared by me</h2>
          <div className="mt-3 space-y-3">
            {visibleEntries.map((entry) => (
              <article className="rounded-md border border-stone-300 bg-white p-4" key={entry.id}>
                <p className="text-sm text-stone-600">{dateTimeLabel(entry.occurred_at)} / {displayToken(entry.entry_type)}</p>
                <p className="mt-2">{entry.content}</p>
              </article>
            ))}
          </div>
        </section>
      ) : (approvedContent ?? []).length ? null : (
        <p className="mt-5 rounded-md border border-stone-300 bg-white p-4 text-stone-700">
          No approved patient-facing content is available yet.
        </p>
      )}
    </main>
  );
}
