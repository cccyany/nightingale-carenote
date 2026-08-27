import { demoUsers } from "@/lib/demo-data";
import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Demo roles</h1>
      <p className="mt-2 text-stone-700">
        These synthetic roles help demonstrate different views. Security is still enforced
        by server authorization and Supabase Row Level Security.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {demoUsers.map((user) => (
          <section key={user.id} className="rounded-md border border-stone-300 bg-white p-4">
            <h2 className="font-semibold">{user.name}</h2>
            <p className="text-sm text-stone-600">{user.role} / {user.clinicName}</p>
            <code className="mt-3 block rounded bg-stone-100 p-2 text-sm">{user.token}</code>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <Link className="rounded-md bg-teal-700 px-3 py-1.5 text-white" href={user.role === "patient" ? `/patient/me?demo=${user.token}` : `/patients?demo=${user.token}`}>
                Open workspace
              </Link>
              {user.role !== "patient" ? (
                <Link className="rounded-md border border-stone-300 px-3 py-1.5" href={`/patients/30000000-0000-0000-0000-000000000001?demo=${user.token}`}>
                  Jane Tan
                </Link>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
