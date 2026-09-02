import { demoUsers } from "@/lib/demo-data";
import Link from "next/link";

function roleDescription(role: string, clinicName: string) {
  if (role === "clinician") return "Review AI evidence, resolve conflicts and update care plans.";
  if (role === "staff" && clinicName === "Clinic B") return "Isolation test for another clinic's scoped workspace.";
  if (role === "staff") return "Add follow-ups, comments and care-team tasks.";
  if (role === "patient") return "View only clinician-approved patient-safe content.";
  return "Provision clinics, manage memberships and create clinic-scoped patients.";
}

function actionLabel(role: string, clinicName: string) {
  if (role === "clinician") return "Enter as clinician";
  if (role === "staff" && clinicName === "Clinic B") return "Enter Clinic B workspace";
  if (role === "staff") return "Enter as staff";
  if (role === "patient") return "Open patient view";
  return "Open clinic management";
}

function roleLabel(role: string) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#f5f7f4] px-4 py-8 text-stone-950 sm:px-6">
      <header className="mx-auto max-w-5xl">
        <Link className="text-sm font-medium text-teal-800 hover:underline" href="/">Nightingale CareNote</Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Demo roles</h1>
        <p className="mt-2 text-stone-700">
          Use these synthetic identities to move through the demo. Server authorization and Supabase RLS still enforce the real boundaries.
        </p>
      </header>
      <div className="mx-auto mt-6 grid max-w-5xl gap-4 md:grid-cols-2">
        {demoUsers.map((user) => (
          <section key={user.id} className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{user.name}</h2>
                <p className="mt-1 text-sm text-stone-600">{roleLabel(user.role)} · {user.clinicName}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${user.clinicName === "Clinic B" ? "bg-amber-100 text-amber-900" : "bg-teal-50 text-teal-900"}`}>
                {user.clinicName === "Clinic B" ? "Isolation" : "Clinic A"}
              </span>
            </div>
            <p className="mt-3 min-h-12 text-sm leading-6 text-stone-700">{roleDescription(user.role, user.clinicName)}</p>
            <div className="mt-4">
              <Link className="inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" href={user.role === "patient" ? `/patient/me?demo=${user.token}` : user.role === "admin" ? `/admin/clinics?demo=${user.token}` : `/patients?demo=${user.token}`}>
                {actionLabel(user.role, user.clinicName)}
              </Link>
            </div>
            <details className="mt-4 text-xs text-stone-600">
              <summary className="cursor-pointer font-medium text-stone-700">Technical details</summary>
              <code className="mt-2 block rounded bg-stone-100 p-2">{user.token}</code>
            </details>
          </section>
        ))}
      </div>
    </main>
  );
}
