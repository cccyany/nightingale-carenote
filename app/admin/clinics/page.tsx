import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
import { CreateClinicForm } from "@/components/ClinicManagementActions";
import { listManagedClinics, type AvailableProfile } from "@/lib/clinic-management";
import { createSupabaseActorClient } from "@/lib/supabase/request";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

export default async function ClinicsPage({
  searchParams
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const demo = (await searchParams)?.demo ?? "demo-admin";
  const actor = actorForDemo(demo);
  const [clinics, supabase] = await Promise.all([
    listManagedClinics(demo),
    createSupabaseActorClient(demo)
  ]);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, primary_role")
    .in("primary_role", ["admin", "clinician", "staff"])
    .order("display_name");

  return (
    <AppShell demo={demo} clinicName={actor?.clinicName ?? "Platform"}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Platform administration</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Clinics</h1>
            <p className="mt-2 max-w-3xl text-stone-700">
              Provision clinics using the existing membership and RLS model. Production invitations are not implemented in this prototype.
            </p>
          </div>
          <CreateClinicForm demo={demo} profiles={(profiles ?? []) as AvailableProfile[]} />
        </header>

        <div className="mt-6 grid gap-4">
          {clinics.length ? clinics.map((clinic) => (
            <Link
              className="block rounded-md border border-stone-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/30 focus:outline-none focus:ring-2 focus:ring-teal-600"
              href={`/admin/clinics/${clinic.id}?demo=${encodeURIComponent(demo)}`}
              key={clinic.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold">{clinic.name}</h2>
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">{clinic.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-stone-600">{clinic.code ?? "No code"} · {clinic.timezone}</p>
                  <p className="mt-3 text-sm text-stone-700">
                    {clinic.administrator_count} admin · {clinic.clinician_count} clinicians · {clinic.staff_count} staff · {clinic.patient_count} patients
                  </p>
                  <p className="mt-1 text-sm text-stone-600">Created {dateLabel(clinic.created_at)}</p>
                </div>
                <span className="mt-1 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white">Open management -&gt;</span>
              </div>
            </Link>
          )) : (
            <p className="rounded-md border border-stone-200 bg-white p-4 text-stone-600">No clinics available to manage.</p>
          )}
        </div>
      </main>
    </AppShell>
  );
}
