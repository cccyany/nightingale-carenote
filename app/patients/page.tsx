import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function firstName(value: { name: string } | { name: string }[] | null): string {
  if (Array.isArray(value)) return value[0]?.name ?? "Clinic";
  return value?.name ?? "Clinic";
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
      <h1 className="text-3xl font-semibold">Patients</h1>
      <div className="mt-5 divide-y divide-stone-200 rounded-md border border-stone-300 bg-white">
        {(patients ?? []).map((patient) => (
          <Link
            className="block p-4 hover:bg-stone-50"
            href={`/patients/${patient.id}`}
            key={patient.id}
          >
            <span className="font-medium">{patient.display_name}</span>
            <span className="ml-3 text-sm text-stone-600">{patient.date_of_birth} · {firstName(patient.clinics)}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
