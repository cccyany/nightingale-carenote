import Link from "next/link";
import type { ReactNode } from "react";
import { demoUsers } from "@/lib/demo-data";

type AppShellProps = {
  demo?: string;
  patientId?: string;
  patientName?: string;
  clinicName?: string;
  children: ReactNode;
  patientView?: boolean;
};

function displayRole(value?: string) {
  if (!value) return "Demo role";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function actorForDemo(demo?: string) {
  return demoUsers.find((user) => user.token === demo);
}

export function AppShell({ demo, patientId, patientName, clinicName, children, patientView = false }: AppShellProps) {
  const actor = actorForDemo(demo);
  const activeClinic = clinicName ?? actor?.clinicName ?? "Clinic";
  const patientsHref = demo ? `/patients?demo=${encodeURIComponent(demo)}` : "/login";

  if (patientView) {
    return (
      <div className="min-h-screen bg-[#f5f7f4] text-stone-950">
        <header className="sticky top-0 z-20 border-b border-teal-100 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div>
              <Link className="text-lg font-semibold tracking-tight text-stone-950 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/">
                Nightingale CareNote
              </Link>
              <p className="text-sm text-teal-800">My CareNote</p>
            </div>
            <div className="rounded-md border border-teal-100 bg-teal-50 px-3 py-2 text-right text-sm">
              <p className="font-medium">{actor?.name ?? patientName ?? "Patient"}</p>
              <p className="text-teal-900">Patient</p>
            </div>
          </div>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7f4] text-stone-950">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <Link className="text-lg font-semibold tracking-tight text-stone-950 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/">
              Nightingale CareNote
            </Link>
            <p className="text-sm text-teal-800">{activeClinic}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Primary navigation">
            <Link className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-600" href={patientsHref}>
              Patients
            </Link>
            <Link className="rounded-md px-3 py-2 text-stone-700 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/login">
              Demo roles
            </Link>
            {patientId ? (
            <Link className="rounded-md border border-teal-200 px-3 py-2 text-teal-900 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/patient/me?demo=demo-patient">
              Patient-safe view
            </Link>
            ) : null}
          </nav>
          <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-right text-sm">
            <p className="font-medium">{actor?.name ?? "No role selected"}</p>
            <p className="text-stone-600">{displayRole(actor?.role)}</p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
