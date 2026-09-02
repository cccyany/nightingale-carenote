import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
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

function patientSafeTitle(title: string) {
  if (title.startsWith("Synthetic patient approval")) return "Approved care instruction";
  if (title.startsWith("Synthetic approved summary")) return "Approved care summary";
  return title.replace(/\s+[0-9a-f-]{36}$/i, "");
}

function patientSafeBody(title: string, body: string) {
  if (title.startsWith("Synthetic patient approval") && /^Synthetic approved instruction\.$/i.test(body.trim())) {
    return "Please follow the care team's approved follow-up instructions.";
  }
  return body;
}

function uniqueByContent<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item).replace(/\s+/g, " ").trim().toLowerCase();
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export default async function PatientMePage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const demo = (await searchParams)?.demo;
  const actor = actorForDemo(demo);
  if (!demo || actor?.role !== "patient") {
    return (
      <AppShell patientView>
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
            <h1 className="text-3xl font-semibold">Choose a demo role</h1>
            <p className="mt-2 text-stone-700">Patient content is loaded through a patient-authenticated Supabase session.</p>
            <Link className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/login">View demo roles</Link>
          </section>
        </main>
      </AppShell>
    );
  }

  const supabase = await createSupabaseActorClient(demo);
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, display_name, clinics(name)")
    .limit(1)
    .single();

  if (patientError || !patient) {
    return (
      <AppShell demo={demo} patientView>
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
            <h1 className="text-3xl font-semibold">My CareNote</h1>
            <p className="mt-2 text-stone-700">No patient-safe record is available for this signed-in patient.</p>
          </section>
        </main>
      </AppShell>
    );
  }

  const clinic = Array.isArray(patient.clinics) ? patient.clinics[0] : patient.clinics;
  const [{ data: entries, error }, { data: approvedContent, error: contentError }] = await Promise.all([
    supabase
      .from("care_entries")
      .select("id, content, occurred_at, entry_type, author_role, visibility")
      .eq("patient_id", patient.id)
      .in("visibility", ["patient_approved", "patient_submitted"])
      .order("occurred_at", { ascending: false }),
    supabase
      .from("patient_facing_content")
      .select("id, title, body, approved_at, created_at")
      .eq("patient_id", patient.id)
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
  ]);

  if (error) throw error;
  if (contentError) throw contentError;

  const safeEntries = (entries ?? []).filter((entry) => !String(entry.entry_type).startsWith("ai_"));
  const patientEntries = safeEntries.filter((entry) => entry.author_role === "patient" || entry.entry_type === "patient_note" || entry.visibility === "patient_submitted");
  const careTeamEntries = safeEntries.filter((entry) => !patientEntries.some((patientEntry) => patientEntry.id === entry.id));
  const uniqueApprovedContent = uniqueByContent(approvedContent ?? [], (item) => `${patientSafeTitle(item.title)} ${patientSafeBody(item.title, item.body)}`)
    .map((item) => ({
      title: patientSafeTitle(item.title),
      body: patientSafeBody(item.title, item.body),
      approvedAt: item.approved_at ?? item.created_at
    }));
  const uniqueCareTeamEntries = uniqueByContent(careTeamEntries, (entry) => entry.content)
    .map((entry) => ({
      content: entry.content,
      occurredAt: entry.occurred_at,
      entryType: entry.entry_type
    }));
  const uniquePatientEntries = uniqueByContent(patientEntries, (entry) => entry.content)
    .map((entry) => ({
      content: entry.content,
      occurredAt: entry.occurred_at,
      entryType: entry.entry_type
    }));

  return (
    <AppShell demo={demo} clinicName={clinic?.name ?? undefined} patientName={patient.display_name} patientView>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="rounded-md border border-teal-700 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Patient-safe view</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">My CareNote</h1>
          <p className="mt-2 max-w-2xl text-stone-700">
            Information your care team has approved for you.
          </p>
        </header>

        {uniqueApprovedContent.length || uniqueCareTeamEntries.length ? (
          <section className="mt-5">
            <h2 className="text-xl font-semibold">From your care team</h2>
            <div className="mt-3 space-y-3">
              {uniqueApprovedContent.map((item) => (
                <article className="rounded-md border border-teal-200 bg-white p-4 shadow-sm" key={`${item.title}-${item.approvedAt}`}>
                  <p className="text-sm font-medium text-teal-800">{dateTimeLabel(item.approvedAt)}</p>
                  <h3 className="mt-1 font-semibold">{item.title}</h3>
                  <p className="mt-2 leading-6 text-stone-800">{item.body}</p>
                </article>
              ))}
              {uniqueCareTeamEntries.map((entry) => (
                <article className="rounded-md border border-stone-200 bg-white p-4 shadow-sm" key={`${entry.entryType}-${entry.occurredAt}`}>
                  <p className="text-sm font-medium text-teal-800">{dateTimeLabel(entry.occurredAt)}</p>
                  <h3 className="mt-1 font-semibold">{displayToken(entry.entryType)}</h3>
                  <p className="mt-2 leading-6 text-stone-800">{entry.content}</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {uniquePatientEntries.length ? (
          <section className="mt-5">
            <h2 className="text-xl font-semibold">Shared by you</h2>
            <div className="mt-3 space-y-3">
              {uniquePatientEntries.map((entry) => (
                <article className="rounded-md border border-stone-200 bg-white p-4 shadow-sm" key={`${entry.entryType}-${entry.occurredAt}`}>
                  <p className="text-sm text-stone-600">{dateTimeLabel(entry.occurredAt)} · {displayToken(entry.entryType)}</p>
                  <p className="mt-2 leading-6 text-stone-800">{entry.content}</p>
                </article>
              ))}
            </div>
          </section>
        ) : uniqueApprovedContent.length || uniqueCareTeamEntries.length ? null : (
          <p className="mt-5 rounded-md border border-stone-300 bg-white p-4 text-stone-700">
            No approved patient-facing content is available yet.
          </p>
        )}
      </main>
    </AppShell>
  );
}
