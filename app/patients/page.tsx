import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
import { presentableGlanceItems } from "@/lib/glance-presentation";
import { createSupabaseActorClient } from "@/lib/supabase/request";

type GlanceSummary = {
  id: string;
  status: string;
  title: string;
  short_summary: string;
  risk_reason: string;
  rule_key: string | null;
};

function firstName(value: { name: string } | { name: string }[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "Clinic";
  return value?.name ?? "Clinic";
}

function dob(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function age(value: string) {
  const birthDate = new Date(value);
  const now = new Date("2026-08-27T12:00:00+08:00");
  let years = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) years -= 1;
  return years;
}

function dateTimeLabel(value: string | null) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore"
  }).format(new Date(value));
}

export default async function PatientsPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const demo = (await searchParams)?.demo;
  if (!demo) {
    return (
      <AppShell>
        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
            <h1 className="text-3xl font-semibold">Choose a demo role</h1>
            <p className="mt-2 text-stone-700">Patient lists are loaded through role-authenticated Supabase sessions.</p>
            <Link className="mt-4 inline-block rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/login">View demo roles</Link>
          </section>
        </main>
      </AppShell>
    );
  }

  const actor = actorForDemo(demo);
  const supabase = await createSupabaseActorClient(demo);
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, display_name, date_of_birth, clinics(name)")
    .order("display_name");

  if (error) throw error;

  const patientSummaries = await Promise.all((patients ?? []).map(async (patient) => {
    const [{ data: glanceRows }, { data: latest }] = await Promise.all([
      supabase.from("glance_items").select("id, status, title, short_summary, risk_reason, rule_key").eq("patient_id", patient.id).neq("status", "rejected"),
      supabase.from("care_entries").select("occurred_at").eq("patient_id", patient.id).order("occurred_at", { ascending: false }).limit(1)
    ]);
    const visibleGlance = presentableGlanceItems((glanceRows ?? []) as GlanceSummary[]);
    return {
      patient,
      activeItems: visibleGlance.length,
      needsReview: visibleGlance.filter((item) => item.status === "needs_review").length,
      lastActivity: latest?.[0]?.occurred_at ?? null
    };
  }));

  return (
    <AppShell demo={demo} clinicName={actor?.clinicName}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Role-authenticated workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Patients</h1>
          <p className="mt-2 text-stone-700">
            {actor?.clinicName === "Clinic B"
              ? "The list below is scoped to the Clinic B demo actor by server authorization and Supabase RLS."
              : "The list below is scoped by the signed-in demo actor and Supabase RLS. Clinic A contains the primary golden demo record."}
          </p>
        </header>
        <div className="mt-5 grid gap-4">
          {patientSummaries.length ? patientSummaries.map(({ patient, activeItems, needsReview, lastActivity }) => {
            const clinic = firstName(patient.clinics);
            return (
              <Link
                className="block rounded-md border border-stone-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/30 focus:outline-none focus:ring-2 focus:ring-teal-600"
                href={`/patients/${patient.id}?demo=${encodeURIComponent(demo)}`}
                key={patient.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">{patient.display_name}</h2>
                      {clinic === "Clinic A" ? <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">Golden demo</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">Isolation fixture</span>}
                    </div>
                    <p className="mt-1 text-sm text-stone-600">{age(patient.date_of_birth)} · DOB {dob(patient.date_of_birth)} · {clinic}</p>
                    <p className="mt-3 text-sm text-stone-700">{activeItems} active items · {needsReview} need review</p>
                    <p className="mt-1 text-sm text-stone-600">Last activity: {dateTimeLabel(lastActivity)}</p>
                  </div>
                  <span className="mt-1 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">Open CareNote →</span>
                </div>
              </Link>
            );
          }) : (
            <p className="rounded-md border border-stone-200 bg-white p-4 text-stone-600">No synthetic patients found. Apply migrations and seed data.</p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
