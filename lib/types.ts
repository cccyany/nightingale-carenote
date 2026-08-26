export type Role = "patient" | "staff" | "clinician" | "admin" | "system";
export type Visibility =
  | "patient_approved"
  | "patient_submitted"
  | "staff_internal"
  | "clinician_internal"
  | "clinic_internal"
  | "ai_internal"
  | "admin_only";

export type EntryType =
  | "patient_note"
  | "staff_note"
  | "clinician_note"
  | "ai_doctor_consult_summary"
  | "ai_nurse_consult_summary"
  | "ai_patient_session_summary"
  | "instruction"
  | "admin_event"
  | "system_event";

export type DemoUser = {
  id: string;
  token: string;
  name: string;
  role: Exclude<Role, "system">;
  clinicId: string;
  clinicName: string;
  patientId?: string;
};

export type Patient = {
  id: string;
  clinicId: string;
  clinicName: string;
  displayName: string;
  age: number;
};

export type CareEntry = {
  id: string;
  clinicId: string;
  patientId: string;
  authorRole: Role;
  authorId: string | null;
  entryType: EntryType;
  visibility: Visibility;
  content: string;
  currentVersion: number;
  occurredAt: string;
};

export type Comment = {
  id: string;
  clinicId: string;
  patientId: string;
  entryId: string;
  authorId: string;
  visibility: "internal" | "patient_visible";
  body: string;
};
