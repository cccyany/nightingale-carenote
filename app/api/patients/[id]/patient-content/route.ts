import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { invokeSafeLlm } from "@/lib/ai/safe-gateway";
import { defaultPatientSummaryTitle, parsePatientSummaryResponse, patientContentTypes } from "@/lib/ai/patient-summary";
import { bearerToken, jsonError } from "@/lib/http";
import { createSupabaseActorClient } from "@/lib/supabase/request";

const sourceEntryIds = z.array(z.string().uuid()).min(1).max(8);
const contentType = z.enum(patientContentTypes);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    contentType,
    sourceEntryIds
  }),
  z.object({
    action: z.literal("save"),
    contentType,
    generationMethod: z.enum(["manual", "ai_assisted"]),
    sourceEntryIds,
    title: z.string().min(1),
    body: z.string().min(1)
  })
]);

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function sourceLabel(entry: { entry_type: string; author_role: string; occurred_at: string }) {
  const label = entry.entry_type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${label} - ${dateLabel(entry.occurred_at)}`;
}

function isEligibleSource(entry: { entry_type: string; visibility: string }) {
  if (entry.visibility === "admin_only") return false;
  return !["admin_event", "system_event"].includes(entry.entry_type);
}

async function loadAuthorizedSources(supabase: Awaited<ReturnType<typeof createSupabaseActorClient>>, patientId: string, ids: string[]) {
  const { data: authUser, error: authError } = await supabase.auth.getUser();
  if (authError || !authUser.user) return { ok: false as const, status: 401, message: "Unauthorized" };

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .select("id, clinic_id")
    .eq("id", patientId)
    .single();
  if (patientError || !patient) return { ok: false as const, status: 404, message: "Patient was not found." };

  const { data: membership, error: membershipError } = await supabase
    .from("clinic_memberships")
    .select("role")
    .eq("clinic_id", patient.clinic_id)
    .eq("profile_id", authUser.user.id)
    .in("role", ["clinician", "admin"])
    .limit(1);
  if (membershipError || !membership?.length) return { ok: false as const, status: 403, message: "You do not have access to create patient-facing content." };

  const { data: entries, error } = await supabase
    .from("care_entries")
    .select("id, entry_type, author_role, visibility, content, occurred_at, current_version")
    .eq("patient_id", patientId)
    .in("id", ids);
  if (error) return { ok: false as const, status: 403, message: "Selected sources could not be loaded." };
  const rows = entries ?? [];
  const foundIds = new Set(rows.map((entry) => entry.id));
  if (ids.some((id) => !foundIds.has(id))) return { ok: false as const, status: 403, message: "One or more selected sources are not available." };
  if (rows.some((entry) => !isEligibleSource(entry))) return { ok: false as const, status: 403, message: "One or more selected sources are not eligible." };

  const ordered = ids.map((id) => rows.find((entry) => entry.id === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return { ok: true as const, patient, entries: ordered };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return jsonError(400, "Invalid patient-facing content payload", "validation_error");

  const token = bearerToken(request);
  if (!token) return jsonError(401, "Unauthorized", "unauthorized");
  const supabase = await createSupabaseActorClient(token);

  const sources = await loadAuthorizedSources(supabase, id, parsed.data.sourceEntryIds);
  if (!sources.ok) return jsonError(sources.status, sources.message, sources.status === 404 ? "not_found" : "forbidden");

  if (parsed.data.action === "generate") {
    const sourceText = sources.entries
      .map((entry, index) => [
        `Source ${index + 1}: ${sourceLabel(entry)}`,
        "Audience: patient",
        "Use only supported source information. Preserve uncertainty and do not publish automatically.",
        entry.content
      ].join("\n"))
      .join("\n\n");
    const gateway = await invokeSafeLlm(sourceText, "patient_summary");
    if (!gateway.ok) {
      return NextResponse.json(
        { status: "needs_review", code: gateway.code ?? "provider_error", redaction: gateway.auditMetadata },
        { status: 422 }
      );
    }
    const generated = parsePatientSummaryResponse(gateway.response);
    if (!generated) return jsonError(422, "AI generation could not be completed safely.", "provider_error");
    return NextResponse.json({
      title: defaultPatientSummaryTitle(parsed.data.contentType, sources.entries.map((entry) => dateLabel(entry.occurred_at))),
      body: generated.summary,
      keyPoints: generated.keyPoints,
      provider: gateway.response.providerDisplayName,
      model: gateway.response.model ?? null,
      redaction: gateway.auditMetadata,
      sourceCount: sources.entries.length
    });
  }

  const { data, error } = await supabase.rpc("create_patient_facing_draft_from_sources", {
    p_patient_id: id,
    p_source_entry_ids: parsed.data.sourceEntryIds,
    p_content_type: parsed.data.contentType,
    p_generation_method: parsed.data.generationMethod,
    p_title: parsed.data.title,
    p_body: parsed.data.body
  });
  if (error) return jsonError(403, "Patient-facing draft could not be saved.", "database_error", error);
  return NextResponse.json({ content: data }, { status: 201 });
}
