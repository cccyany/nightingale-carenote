"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <section className="rounded-md border border-red-300 bg-white p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-700">CareNote unavailable</p>
        <h1 className="mt-2 text-2xl font-semibold">We could not load this view.</h1>
        <p className="mt-2 text-stone-700">Access may be restricted, or the Supabase project may be unavailable.</p>
        <button className="mt-4 rounded-md bg-stone-900 px-4 py-2 text-sm text-white" onClick={reset} type="button">
          Try again
        </button>
      </section>
    </main>
  );
}
