import { demoUsers } from "@/lib/demo-data";

export default function LoginPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Demo accounts</h1>
      <p className="mt-2 text-stone-700">
        Use these bearer tokens against `/api/*` routes while Supabase Auth is not configured.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {demoUsers.map((user) => (
          <section key={user.id} className="rounded-md border border-stone-300 bg-white p-4">
            <h2 className="font-semibold">{user.name}</h2>
            <p className="text-sm text-stone-600">{user.role} · {user.clinicName}</p>
            <code className="mt-3 block rounded bg-stone-100 p-2 text-sm">{user.token}</code>
          </section>
        ))}
      </div>
    </main>
  );
}
