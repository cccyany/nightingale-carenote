"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-[#f5f7f4] px-4 py-8 text-stone-950 sm:px-6">
      <section className="mx-auto max-w-5xl rounded-md border border-red-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">CareNote unavailable</p>
        <h1 className="mt-2 text-2xl font-semibold">We could not load this view.</h1>
        <p className="mt-2 text-stone-700">Access may be restricted, or the Supabase project may be unavailable.</p>
        <button className="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-teal-600" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
