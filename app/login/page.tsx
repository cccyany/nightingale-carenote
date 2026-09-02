import { CreateDemoPersonForm } from "@/components/DemoPersonActions";
import { type DemoAccessIdentity, listDemoAccess } from "@/lib/demo-access";
import Link from "next/link";

function roleDescription(user: DemoAccessIdentity, clinicName?: string) {
  if (user.platform_admin) return "Manage clinics and provisioning.";
  if (user.role === "admin") return `Manage members and patients inside ${clinicName ?? "this clinic"}.`;
  if (user.role === "clinician") return "Review AI evidence, resolve conflicts and update care plans.";
  if (user.role === "staff" && clinicName === "Clinic B") return "Isolation test for another clinic's scoped workspace.";
  if (user.role === "staff") return "Add follow-ups, comments and care-team tasks.";
  if (user.role === "patient") return "View only clinician-approved patient-safe content.";
  return "Clinic-scoped demo identity.";
}

function actionLabel(user: DemoAccessIdentity, clinicName?: string) {
  if (user.platform_admin) return "Enter platform admin";
  if (user.role === "admin") return `Manage ${clinicName ?? "clinic"}`;
  if (user.role === "clinician") return "Enter as clinician";
  if (user.role === "staff" && clinicName === "Clinic B") return "Enter Clinic B workspace";
  if (user.role === "staff") return "Enter as staff";
  if (user.role === "patient") return "Open patient view";
  return "Open";
}

function actionHref(user: DemoAccessIdentity) {
  if (user.platform_admin) return `/admin/clinics?demo=${user.token}`;
  if (user.role === "patient") return `/patient/me?demo=${user.token}`;
  if (user.role === "admin") return `/admin/clinics/${user.clinic_id}?demo=${user.token}`;
  return `/patients?demo=${user.token}`;
}

function roleLabel(user: DemoAccessIdentity) {
  if (user.platform_admin) return "Platform Administrator";
  if (user.role === "admin") return "Clinic Administrator";
  return user.role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function LoginPage() {
  const access = await listDemoAccess();
  const platformUsers = access.demo_identities.filter((user) => user.platform_admin);
  const clinicUsers = access.demo_identities.filter((user) => !user.platform_admin);

  return (
    <main className="min-h-screen bg-[#f5f7f4] px-4 py-8 text-stone-950 sm:px-6">
      <header className="mx-auto flex max-w-5xl flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-medium text-teal-800 hover:underline" href="/">Nightingale CareNote</Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Demo roles</h1>
          <p className="mt-2 text-stone-700">
            Use these synthetic identities to move through the demo. Role switching is navigation only; server authorization and Supabase RLS enforce the boundaries.
          </p>
        </div>
        <CreateDemoPersonForm clinics={access.clinics} demo={platformUsers[0]?.token ?? "demo-admin"} />
      </header>

      <div className="mx-auto mt-6 max-w-5xl space-y-5">
        <section className="rounded-md border border-teal-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Platform</p>
              <h2 className="text-xl font-semibold">Platform administration</h2>
            </div>
            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-900">{platformUsers.length} {platformUsers.length === 1 ? "role" : "roles"}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {platformUsers.map((user) => <RoleCard clinicName="Platform" key={user.token} user={user} />)}
          </div>
          <p className="mt-3 text-xs text-stone-600">Platform administrator identities are provisioned separately from clinic-scoped demo roles to prevent self-service privilege escalation.</p>
        </section>

        {access.clinics.map((clinic) => {
          const users = clinicUsers.filter((user) => user.clinic_id === clinic.id);
          const patientRecords = access.patient_records.filter((patient) => patient.clinic_id === clinic.id);
          return (
            <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm" key={clinic.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">{clinic.name}</p>
                  <h2 className="text-xl font-semibold">Clinic roles</h2>
                </div>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">{users.length} demo {users.length === 1 ? "identity" : "identities"}</span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {users.map((user) => <RoleCard clinicName={clinic.name} key={user.token} user={user} />)}
                {patientRecords
                  .filter((patient) => !patient.has_demo_identity)
                  .map((patient) => (
                    <div className="rounded-md border border-stone-200 bg-stone-50 p-4" key={patient.id}>
                      <h3 className="font-semibold">{patient.display_name}</h3>
                      <p className="mt-1 text-sm text-stone-600">Patient record · {clinic.name}</p>
                      <p className="mt-2 text-sm text-stone-700">No patient demo login is provisioned for this record.</p>
                    </div>
                  ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function RoleCard({ user, clinicName }: { user: DemoAccessIdentity; clinicName: string }) {
  return (
    <section className="rounded-md border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{user.display_name}</h3>
          <p className="mt-1 text-sm text-stone-600">{roleLabel(user)}{user.platform_admin ? "" : ` · ${clinicName}`}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.platform_admin ? "bg-teal-700 text-white" : user.role === "admin" ? "bg-teal-50 text-teal-900" : clinicName === "Clinic B" ? "bg-amber-100 text-amber-900" : "bg-stone-100 text-stone-700"}`}>
          {user.platform_admin ? "Platform" : user.role === "admin" ? "Clinic admin" : clinicName}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-stone-700">{roleDescription(user, clinicName)}</p>
      <div className="mt-4">
        <Link className="inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" href={actionHref(user)}>
          {actionLabel(user, clinicName)}
        </Link>
      </div>
      <details className="mt-4 text-xs text-stone-600">
        <summary className="cursor-pointer font-medium text-stone-700">Technical details</summary>
        <code className="mt-2 block rounded bg-stone-100 p-2">{user.token}</code>
      </details>
    </section>
  );
}
