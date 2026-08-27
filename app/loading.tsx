export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f5f7f4] px-4 py-8 text-stone-950 sm:px-6">
      <div className="mx-auto max-w-5xl rounded-md border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Nightingale CareNote</p>
        <h1 className="mt-2 text-2xl font-semibold">Loading clinical context</h1>
        <p className="mt-2 text-stone-600">Retrieving role-scoped data and trusted Glance state.</p>
      </div>
    </main>
  );
}
