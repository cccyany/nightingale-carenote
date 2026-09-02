import { createClient } from "@supabase/supabase-js";
import { clinics as staticClinics, demoUsers, patients as staticPatients } from "@/lib/demo-data";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

export type DemoAccessClinic = {
  id: string;
  name: string;
  code: string | null;
};

export type DemoAccessIdentity = {
  token: string;
  profile_id: string;
  clinic_id: string;
  role: "admin" | "clinician" | "staff" | "patient";
  display_name: string;
  platform_admin: boolean;
};

export type DemoAccessPatientRecord = {
  id: string;
  clinic_id: string;
  display_name: string;
  has_demo_identity: boolean;
};

export type DemoAccess = {
  clinics: DemoAccessClinic[];
  demo_identities: DemoAccessIdentity[];
  patient_records: DemoAccessPatientRecord[];
};

export const clinicUuidBySlug: Record<string, string> = {
  "clinic-a": "20000000-0000-0000-0000-000000000001",
  "clinic-b": "20000000-0000-0000-0000-000000000002"
};

function fallbackDemoAccess(): DemoAccess {
  const clinics = staticClinics.map((clinic) => ({
    id: clinicUuidBySlug[clinic.id] ?? clinic.id,
    name: clinic.name,
    code: clinic.id
  }));
  return {
    clinics,
    demo_identities: demoUsers.map((user) => ({
      token: user.token,
      profile_id: user.profileId ?? user.id,
      clinic_id: clinicUuidBySlug[user.clinicId] ?? user.clinicId,
      role: user.role,
      display_name: user.name,
      platform_admin: Boolean(user.platformAdmin)
    })),
    patient_records: staticPatients.map((patient) => ({
      id: patient.id,
      clinic_id: clinicUuidBySlug[patient.clinicId] ?? patient.clinicId,
      display_name: patient.displayName,
      has_demo_identity: demoUsers.some((user) => user.patientId === patient.id)
    }))
  };
}

export async function listDemoAccess(): Promise<DemoAccess> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return fallbackDemoAccess();

  const supabase = createClient(normalizeSupabaseUrl(supabaseUrl), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.rpc("list_demo_access");
  if (error || !data) return fallbackDemoAccess();
  return data as DemoAccess;
}
