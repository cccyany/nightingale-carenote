import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PatientMePage() {
  const supabase = createSupabaseAdminClient();
  const [{ data: entries, error }, { data: approvedContent, error: contentError }] = await Promise.all([
    supabase
    .from("care_entries")
    .select("id, content, occurred_at, entry_type")
    .eq("patient_id", "30000000-0000-0000-0000-000000000001")
    .in("visibility", ["patient_approved", "patient_submitted"])
      .order("occurred_at", { ascending: true }),
    supabase
      .from("patient_facing_content")
      .select("id, title, body, approved_at, created_at")
      .eq("patient_id", "30000000-0000-0000-0000-000000000001")
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
  ]);

  if (error) throw error;
  if (contentError) throw contentError;
  const visibleEntries = (entries ?? []).filter((entry) => !String(entry.entry_type).startsWith("ai_"));

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">My CareNote</h1>
      {(approvedContent ?? []).length ? (
        <section className="mt-5">
          <h2 className="text-xl font-semibold">Approved care summaries</h2>
          <div className="mt-3 space-y-3">
            {(approvedContent ?? []).map((item) => (
              <article className="rounded-md border border-teal-300 bg-white p-4" key={item.id}>
                <p className="text-sm text-stone-600">Approved {item.approved_at ?? item.created_at}</p>
                <h3 className="mt-1 font-semibold">{item.title}</h3>
                <p className="mt-2">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {visibleEntries.length ? (
        <div className="mt-5 space-y-3">
          {visibleEntries.map((entry) => (
            <article className="rounded-md border border-stone-300 bg-white p-4" key={entry.id}>
              <p className="text-sm text-stone-600">{entry.occurred_at}</p>
              <p className="mt-2">{entry.content}</p>
            </article>
          ))}
        </div>
      ) : (approvedContent ?? []).length ? null : (
        <p className="mt-5">No approved patient-facing content is available.</p>
      )}
    </main>
  );
}
