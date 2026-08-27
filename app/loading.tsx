export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-10">
      <div className="rounded-md border border-stone-300 bg-white p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Nightingale CareNote</p>
        <h1 className="mt-2 text-2xl font-semibold">Loading trusted care context...</h1>
        <p className="mt-2 text-stone-600">Retrieving the latest approved, clinic-scoped data.</p>
      </div>
    </main>
  );
}
