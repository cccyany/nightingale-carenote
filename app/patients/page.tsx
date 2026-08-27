import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function firstName(value: { name: string } | { name: string }[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "Clinic";
  return value?.name ?? "Clinic";
}

function dob(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

export default async function PatientsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: patients, error } = await supabase
    .from("patients")
    .select("id, display_name, date_of_birth, clinics(name)")
    .order("display_name");

  if (error) throw error;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Synthetic clinic data</p>
        <h1 className="mt-2 text-3xl font-semibold">Patients</h1>
        <p className="mt-2 text-stone-700">Jane Tan in Clinic A is the primary demo record. Clinic B exists for isolation testing.</p>
      </header>
      <div className="mt-5 divide-y divide-stone-200 rounded-md border border-stone-300 bg-white">
        {(patients ?? []).length ? (patients ?? []).map((patient) => {
          const clinic = firstName(patient.clinics);
          return (
            <Link
              className={`block p-4 hover:bg-stone-50 ${clinic === "Clinic B" ? "bg-stone-50" : ""}`}
              href={`/patients/${patient.id}`}
              key={patient.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{patient.display_name}</span>
                {clinic === "Clinic A" ? <span className="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-900">golden demo</span> : <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">isolation fixture</span>}
              </div>
              <p className="mt-1 text-sm text-stone-600">{dob(patient.date_of_birth)} / {clinic}</p>
            </Link>
          );
        }) : (
          <p className="p-4 text-stone-600">No synthetic patients found. Apply migrations and seed data.</p>
        )}
      </div>
    </main>
  );
}
