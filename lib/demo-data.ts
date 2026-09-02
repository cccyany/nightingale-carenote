import type { CareEntry, Comment, DemoUser, Patient } from "@/lib/types";

export const clinics = [
  { id: "clinic-a", name: "Clinic A" },
  { id: "clinic-b", name: "Clinic B" }
];

export const demoUsers: DemoUser[] = [
  {
    id: "user-patient-jane",
    profileId: "10000000-0000-0000-0000-000000000001",
    token: "demo-patient",
    name: "Jane Tan",
    role: "patient",
    clinicId: "clinic-a",
    clinicName: "Clinic A",
    patientId: "patient-jane-tan"
  },
  {
    id: "user-staff-a",
    profileId: "10000000-0000-0000-0000-000000000002",
    token: "demo-staff",
    name: "Sam Lee",
    role: "staff",
    clinicId: "clinic-a",
    clinicName: "Clinic A"
  },
  {
    id: "user-clinician-a",
    profileId: "10000000-0000-0000-0000-000000000003",
    token: "demo-clinician",
    name: "Dr Mina Koh",
    role: "clinician",
    clinicId: "clinic-a",
    clinicName: "Clinic A"
  },
  {
    id: "user-admin-a",
    profileId: "10000000-0000-0000-0000-000000000004",
    token: "demo-admin",
    name: "Avery Ong",
    role: "admin",
    clinicId: "clinic-a",
    clinicName: "Clinic A",
    platformAdmin: true
  },
  {
    id: "user-clinic-admin-a",
    profileId: "10000000-0000-0000-0000-000000000006",
    token: "demo-clinic-admin-a",
    name: "Clara Ng",
    role: "admin",
    clinicId: "clinic-a",
    clinicName: "Clinic A"
  },
  {
    id: "user-staff-b",
    profileId: "10000000-0000-0000-0000-000000000005",
    token: "demo-clinic-b-staff",
    name: "Bo Chen",
    role: "staff",
    clinicId: "clinic-b",
    clinicName: "Clinic B"
  },
  {
    id: "user-patient-alex",
    profileId: "10000000-0000-0000-0000-000000000007",
    token: "demo-patient-alex",
    name: "Alex Lim",
    role: "patient",
    clinicId: "clinic-b",
    clinicName: "Clinic B",
    patientId: "patient-clinic-b"
  }
];

export const patients: Patient[] = [
  {
    id: "patient-jane-tan",
    clinicId: "clinic-a",
    clinicName: "Clinic A",
    displayName: "Jane Tan",
    age: 58
  },
  {
    id: "patient-clinic-b",
    clinicId: "clinic-b",
    clinicName: "Clinic B",
    displayName: "Alex Lim",
    age: 44
  }
];

export const careEntries: CareEntry[] = [
  {
    id: "entry-allergy-2025",
    clinicId: "clinic-a",
    patientId: "patient-jane-tan",
    authorRole: "clinician",
    authorId: "user-clinician-a",
    entryType: "clinician_note",
    visibility: "clinician_internal",
    content: "Penicillin allergy documented.",
    currentVersion: 1,
    occurredAt: "2025-04-15T09:00:00.000Z"
  },
  {
    id: "entry-ai-nurse-2026",
    clinicId: "clinic-a",
    patientId: "patient-jane-tan",
    authorRole: "system",
    authorId: null,
    entryType: "ai_nurse_consult_summary",
    visibility: "ai_internal",
    content: "Patient reports no known drug allergies.",
    currentVersion: 1,
    occurredAt: "2026-02-06T10:30:00.000Z"
  },
  {
    id: "entry-ai-patient-session-2026",
    clinicId: "clinic-a",
    patientId: "patient-jane-tan",
    authorRole: "system",
    authorId: null,
    entryType: "ai_patient_session_summary",
    visibility: "ai_internal",
    content: "Patient reports a nocturnal cough persisting for approximately three weeks.",
    currentVersion: 1,
    occurredAt: "2026-08-26T08:15:00.000Z"
  },
  {
    id: "entry-ai-doctor-2026",
    clinicId: "clinic-a",
    patientId: "patient-jane-tan",
    authorRole: "system",
    authorId: null,
    entryType: "ai_doctor_consult_summary",
    visibility: "ai_internal",
    content: "Persistent nocturnal cough discussed. Repeat renal panel discussed.",
    currentVersion: 1,
    occurredAt: "2026-08-26T11:00:00.000Z"
  },
  {
    id: "entry-renal-followup-2026",
    clinicId: "clinic-a",
    patientId: "patient-jane-tan",
    authorRole: "staff",
    authorId: "user-staff-a",
    entryType: "staff_note",
    visibility: "staff_internal",
    content: "Repeat renal panel has not yet been ordered.",
    currentVersion: 1,
    occurredAt: "2026-08-26T14:00:00.000Z"
  },
  {
    id: "entry-patient-approved",
    clinicId: "clinic-a",
    patientId: "patient-jane-tan",
    authorRole: "clinician",
    authorId: "user-clinician-a",
    entryType: "instruction",
    visibility: "patient_approved",
    content: "Please attend the scheduled follow-up appointment.",
    currentVersion: 1,
    occurredAt: "2026-08-26T15:00:00.000Z"
  },
  {
    id: "entry-clinic-b-note",
    clinicId: "clinic-b",
    patientId: "patient-clinic-b",
    authorRole: "staff",
    authorId: "user-staff-b",
    entryType: "staff_note",
    visibility: "staff_internal",
    content: "Synthetic Clinic B internal note.",
    currentVersion: 1,
    occurredAt: "2026-08-26T12:00:00.000Z"
  }
];

export const comments: Comment[] = [
  {
    id: "comment-internal-renal",
    clinicId: "clinic-a",
    patientId: "patient-jane-tan",
    entryId: "entry-renal-followup-2026",
    authorId: "user-staff-a",
    visibility: "internal",
    body: "Internal reminder for clinician review."
  }
];
