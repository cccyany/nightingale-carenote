import Link from "next/link";
import { AppShell, actorForDemo } from "@/components/AppShell";
import { AddClinicMemberForm, CreateClinicPatientForm } from "@/components/ClinicManagementActions";
import { getClinicManagement } from "@/lib/clinic-management";

function displayToken(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

export default async function ClinicManagementPage({
  params,
  searchParams
}: {
  params: Promise<{ clinicId: string }>;
  searchParams?: Promise<{ demo?: string }>;
}) {
  const { clinicId } = await params;
  const demo = (await searchParams)?.demo ?? "demo-admin";
  const actor = actorForDemo(demo);
  const management = await getClinicManagement(clinicId, demo);

  if (management.status === "not_found") {
    return (
      <AppShell demo={demo} clinicName={actor?.clinicName ?? "Platform"}>
        <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
          <Link className="text-sm font-medium text-teal-800 hover:underline" href={`/admin/clinics?demo=${encodeURIComponent(demo)}`}>Back to clinics</Link>
          <p className="mt-4 rounded-md border border-stone-200 bg-white p-4 text-stone-700">Clinic not found.</p>
        </main>
      </AppShell>
    );
  }

  const administrators = management.memberships.filter((membership) => membership.role === "admin");
  const clinicians = management.memberships.filter((membership) => membership.role === "clinician");
  const staff = management.memberships.filter((membership) => membership.role === "staff");

  return (
    <AppShell demo={demo} clinicName={management.clinic.name}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm text-stone-600" aria-label="Breadcrumb">
          <Link className="font-medium text-teal-800 hover:underline focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/admin/clinics?demo=${encodeURIComponent(demo)}`}>
            Clinics
          </Link>
          <span>/</span>
          <span className="font-medium text-stone-900">{management.clinic.name}</span>
        </nav>

        <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Clinic management</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{management.clinic.name}</h1>
              <p className="mt-1 text-sm text-stone-600">{management.clinic.code ?? "No code"} · {management.clinic.timezone}</p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-900">{displayToken(management.clinic.status)}</span>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <RoleSection title="Administrators" count={administrators.length} rows={administrators} />
            <RoleSection title="Clinicians" count={clinicians.length} rows={clinicians} />
            <RoleSection title="Staff" count={staff.length} rows={staff} />
            <section className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Patients</h2>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">{management.patients.length} {management.patients.length === 1 ? "patient" : "patients"}</span>
              </div>
              <div className="mt-3 divide-y divide-stone-100">
                {management.patients.length ? management.patients.map((patient) => (
                  <Link className="flex flex-wrap items-center justify-between gap-3 py-3 hover:text-teal-800" href={`/patients/${patient.id}?demo=${encodeURIComponent(demo)}`} key={patient.id}>
                    <span>
                      <span className="block font-medium">{patient.display_name}</span>
                      <span className="text-sm text-stone-600">DOB {dateLabel(patient.date_of_birth)}</span>
                    </span>
                    <span className="text-sm font-medium">Open CareNote -&gt;</span>
                  </Link>
                )) : <p className="py-3 text-sm text-stone-600">No patients in this clinic yet.</p>}
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <AddClinicMemberForm clinicId={management.clinic.id} demo={demo} profiles={management.available_profiles} />
            <CreateClinicPatientForm clinicId={management.clinic.id} demo={demo} />
            <section className="rounded-md border border-stone-200 bg-white p-4 text-sm text-stone-700 shadow-sm">
              <h2 className="font-semibold text-stone-900">Security boundary</h2>
              <p className="mt-2">The browser chooses a management view, but the RPC checks platform-admin or same-clinic admin authority before changing data.</p>
            </section>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}

function RoleSection({
  title,
  count,
  rows
}: {
  title: string;
  count: number;
  rows: Array<{ id: string; display_name: string; primary_role: string; created_at: string }>;
}) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">{count}</span>
      </div>
      <div className="mt-3 divide-y divide-stone-100">
        {rows.length ? rows.map((row) => (
          <div className="py-3" key={row.id}>
            <p className="font-medium">{row.display_name}</p>
            <p className="text-sm text-stone-600">Primary role: {displayToken(row.primary_role)} · Added {dateLabel(row.created_at)}</p>
          </div>
        )) : <p className="py-3 text-sm text-stone-600">None yet.</p>}
      </div>
    </section>
  );
}
