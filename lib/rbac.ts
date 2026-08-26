import { careEntries, comments, demoUsers, patients } from "@/lib/demo-data";
import type { CareEntry, Comment, DemoUser, Patient, Role } from "@/lib/types";

type AuthResult = { ok: true; user: DemoUser } | { ok: false; status: 401 | 403; error: string };
type TimelineResult =
  | { ok: true; patient: Patient; entries: CareEntry[] }
  | { ok: false; status: 401 | 403 | 404; error: string };
type EntryResult =
  | { ok: true; entry: CareEntry }
  | { ok: false; status: 401 | 403 | 404; error: string };
type CommentsResult =
  | { ok: true; comments: Comment[] }
  | { ok: false; status: 401 | 403 | 404; error: string };
type CreateEntryAuthorizationResult =
  | { ok: true; user: DemoUser; patient: Patient }
  | { ok: false; status: 401 | 403 | 404; error: string };
type EditEntryAuthorizationResult =
  | { ok: true; user: DemoUser; entry: CareEntry }
  | { ok: false; status: 401 | 403 | 404 | 409; error: string };

const aiEntryTypes = new Set([
  "ai_doctor_consult_summary",
  "ai_nurse_consult_summary",
  "ai_patient_session_summary"
]);

export function authenticateToken(token: string | null): AuthResult {
  const user = demoUsers.find((candidate) => candidate.token === token);
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, user };
}

function canReadPatient(user: DemoUser, patient: Patient): boolean {
  if (user.role === "patient") {
    return user.patientId === patient.id;
  }
  return user.clinicId === patient.clinicId;
}

function canReadEntry(user: DemoUser, entry: CareEntry): boolean {
  if (user.clinicId !== entry.clinicId) {
    return false;
  }
  if (user.role === "patient") {
    return (
      user.patientId === entry.patientId &&
      (entry.visibility === "patient_approved" || entry.visibility === "patient_submitted") &&
      !aiEntryTypes.has(entry.entryType)
    );
  }
  if (user.role === "staff") {
    return entry.visibility !== "admin_only";
  }
  if (user.role === "clinician") {
    return entry.visibility !== "admin_only";
  }
  return user.role === "admin";
}

function canReadComment(user: DemoUser, comment: Comment): boolean {
  if (user.clinicId !== comment.clinicId) {
    return false;
  }
  if (user.role === "patient") {
    return user.patientId === comment.patientId && comment.visibility === "patient_visible";
  }
  return user.role === "staff" || user.role === "clinician" || user.role === "admin";
}

function canEditEntry(user: DemoUser, entry: CareEntry): boolean {
  if (user.clinicId !== entry.clinicId || user.role === "patient") {
    return false;
  }
  if (user.role === "staff") {
    return entry.authorRole === "staff" && entry.authorId === user.id;
  }
  if (user.role === "clinician") {
    return entry.authorRole === "clinician" && entry.authorId === user.id;
  }
  return user.role === "admin";
}

function canCreateEntry(user: DemoUser, patient: Patient, authorRole: Role): boolean {
  if (user.clinicId !== patient.clinicId) {
    return false;
  }
  if (user.role === "staff") {
    return authorRole === "staff";
  }
  if (user.role === "clinician") {
    return authorRole === "clinician";
  }
  return user.role === "admin" && authorRole !== "system";
}

export function listPatientsForToken(token: string): Patient[] {
  const auth = authenticateToken(token);
  if (!auth.ok) {
    return [];
  }
  return patients.filter((patient) => canReadPatient(auth.user, patient));
}

export function getPatientTimelineForToken(token: string, patientId: string): TimelineResult {
  const auth = authenticateToken(token);
  if (!auth.ok) {
    return auth;
  }
  const patient = patients.find((candidate) => candidate.id === patientId);
  if (!patient) {
    return { ok: false, status: 404, error: "Patient not found" };
  }
  if (!canReadPatient(auth.user, patient)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return {
    ok: true,
    patient,
    entries: careEntries
      .filter((entry) => entry.patientId === patientId && canReadEntry(auth.user, entry))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  };
}

export function getEntryForToken(token: string, entryId: string): EntryResult {
  const auth = authenticateToken(token);
  if (!auth.ok) {
    return auth;
  }
  const entry = careEntries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    return { ok: false, status: 404, error: "Entry not found" };
  }
  if (!canReadEntry(auth.user, entry)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, entry };
}

export function listCommentsForToken(token: string, patientId: string): CommentsResult {
  const auth = authenticateToken(token);
  if (!auth.ok) {
    return auth;
  }
  const patient = patients.find((candidate) => candidate.id === patientId);
  if (!patient || !canReadPatient(auth.user, patient)) {
    return { ok: false, status: patient ? 403 : 404, error: patient ? "Forbidden" : "Patient not found" };
  }
  return {
    ok: true,
    comments: comments.filter((comment) => comment.patientId === patientId && canReadComment(auth.user, comment))
  };
}

export function authorizeEntryCreate(
  token: string,
  patientId: string,
  authorRole: Role
): CreateEntryAuthorizationResult {
  const auth = authenticateToken(token);
  if (!auth.ok) {
    return auth;
  }
  const patient = patients.find((candidate) => candidate.id === patientId);
  if (!patient) {
    return { ok: false, status: 404, error: "Patient not found" };
  }
  if (!canCreateEntry(auth.user, patient, authorRole)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, user: auth.user, patient };
}

export function authorizeEntryEdit(
  token: string,
  entryId: string,
  expectedVersion: number
): EditEntryAuthorizationResult {
  const auth = authenticateToken(token);
  if (!auth.ok) {
    return auth;
  }
  const entry = careEntries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    return { ok: false, status: 404, error: "Entry not found" };
  }
  if (!canEditEntry(auth.user, entry)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (entry.currentVersion !== expectedVersion) {
    return { ok: false, status: 409, error: "Version conflict" };
  }
  return { ok: true, user: auth.user, entry };
}
