import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="border-b border-stone-300 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          Synthetic care-team workspace
        </p>
        <h1 className="mt-2 text-4xl font-semibold">Nightingale CareNote</h1>
        <p className="mt-3 max-w-2xl text-stone-700">
          Know what matters. Know why. Know where it came from. AI proposes, humans
          verify, and provenance proves each important item.
        </p>
      </header>
      <nav className="flex flex-wrap gap-3">
        <Link className="rounded-md bg-teal-700 px-4 py-2 text-white" href="/login">
          Demo roles
        </Link>
        <Link className="rounded-md border border-stone-300 px-4 py-2" href="/patients">
          Patients
        </Link>
        <Link className="rounded-md border border-stone-300 px-4 py-2" href="/patient/me">
          Patient view
        </Link>
      </nav>
    </main>
  );
}
