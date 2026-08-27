import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PatientMePage() {
  const supabase = createSupabaseAdminClient();
  const { data: entries, error } = await supabase
    .from("care_entries")
    .select("id, content, occurred_at, entry_type")
    .eq("patient_id", "30000000-0000-0000-0000-000000000001")
    .in("visibility", ["patient_approved", "patient_submitted"])
    .order("occurred_at", { ascending: true });

  if (error) throw error;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">My CareNote</h1>
      {(entries ?? []).filter((entry) => !String(entry.entry_type).startsWith("ai_")).length ? (
        <div className="mt-5 space-y-3">
          {(entries ?? []).filter((entry) => !String(entry.entry_type).startsWith("ai_")).map((entry) => (
            <article className="rounded-md border border-stone-300 bg-white p-4" key={entry.id}>
              <p className="text-sm text-stone-600">{entry.occurred_at}</p>
              <p className="mt-2">{entry.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5">No approved patient-facing content is available.</p>
      )}
    </main>
  );
}
