import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f7f4] px-4 py-8 text-stone-950 sm:px-6">
      <header className="mx-auto max-w-5xl border-b border-stone-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Clinical SaaS prototype</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Nightingale CareNote</h1>
        <div className="mt-4 max-w-3xl text-2xl font-medium leading-tight text-stone-800 sm:text-3xl">
          <p>Know what matters.</p>
          <p>Know why.</p>
          <p>Know where it came from.</p>
        </div>
        <p className="mt-4 max-w-2xl text-stone-700">AI proposes. Humans verify. Provenance proves.</p>
      </header>
      <section className="mx-auto mt-6 grid max-w-5xl gap-4 md:grid-cols-3">
        <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Care Team Workspace</h2>
          <p className="mt-2 text-sm leading-6 text-stone-700">Review longitudinal context, AI findings, conflicts and follow-ups.</p>
          <Link className="mt-5 inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/patients?demo=demo-clinician">
            Enter care team demo
          </Link>
        </article>
        <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Patient View</h2>
          <p className="mt-2 text-sm leading-6 text-stone-700">See only information explicitly approved for the patient.</p>
          <Link className="mt-5 inline-flex rounded-md border border-teal-700 px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/patient/me?demo=demo-patient">
            Open patient-safe view
          </Link>
        </article>
        <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Security / Demo Roles</h2>
          <p className="mt-2 text-sm leading-6 text-stone-700">Explore role-scoped synthetic identities. The role selector is not the security boundary.</p>
          <Link className="mt-5 inline-flex rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" href="/login">
            View demo roles
          </Link>
        </article>
      </section>
    </main>
  );
}
