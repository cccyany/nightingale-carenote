import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { bearerToken, jsonError } from "@/lib/http";
import { authorizeEntryCreate, getPatientTimelineForToken } from "@/lib/rbac";

const createEntrySchema = z.object({
  authorRole: z.enum(["staff", "clinician", "admin"]),
  content: z.string().min(1),
  entryType: z.enum(["staff_note", "clinician_note", "instruction", "admin_event"]),
  visibility: z.enum(["staff_internal", "clinician_internal", "clinic_internal", "patient_approved", "admin_only"])
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const result = getPatientTimelineForToken(bearerToken(request) ?? "", id);
  if (!result.ok) {
    return jsonError(result.status, result.error);
  }
  return NextResponse.json({ patient: result.patient, entries: result.entries });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = createEntrySchema.safeParse(await request.json());
  if (!body.success) {
    return jsonError(400, "Invalid entry payload");
  }
  const result = authorizeEntryCreate(bearerToken(request) ?? "", id, body.data.authorRole);
  if (!result.ok) {
    return jsonError(result.status, result.error);
  }
  return NextResponse.json(
    {
      entry: {
        id: "pending-persistence",
        clinicId: result.patient.clinicId,
        patientId: id,
        authorRole: body.data.authorRole,
        authorId: result.user.id,
        entryType: body.data.entryType,
        visibility: body.data.visibility,
        content: body.data.content,
        currentVersion: 1
      }
    },
    { status: 201 }
  );
}
