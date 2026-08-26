import Link from "next/link";
import { listPatientsForToken } from "@/lib/rbac";

export default function PatientsPage() {
  const patients = listPatientsForToken("demo-staff");

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Patients</h1>
      <div className="mt-5 divide-y divide-stone-200 rounded-md border border-stone-300 bg-white">
        {patients.map((patient) => (
          <Link
            className="block p-4 hover:bg-stone-50"
            href={`/patients/${patient.id}`}
            key={patient.id}
          >
            <span className="font-medium">{patient.displayName}</span>
            <span className="ml-3 text-sm text-stone-600">{patient.age} · {patient.clinicName}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}
