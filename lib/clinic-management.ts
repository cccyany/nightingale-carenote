import { createSupabaseActorClient } from "@/lib/supabase/request";

export type ManagedClinic = {
  id: string;
  name: string;
  code: string | null;
  timezone: string;
  status: string;
  created_at: string;
  administrator_count: number;
  clinician_count: number;
  staff_count: number;
  patient_count: number;
};

export type ManagedMembership = {
  id: string;
  profile_id: string;
  role: "admin" | "clinician" | "staff";
  display_name: string;
  primary_role: string;
  created_at: string;
};

export type ManagedPatient = {
  id: string;
  display_name: string;
  date_of_birth: string;
  synthetic: boolean;
  created_at: string;
};

export type AvailableProfile = {
  id: string;
  display_name: string;
  primary_role: string;
};

export type ManagedClinicOption = {
  id: string;
  name: string;
  status: string;
};

export type ClinicManagement = {
  status: "ok";
  clinic: {
    id: string;
    name: string;
    code: string | null;
    timezone: string;
    status: string;
    created_at: string;
  };
  memberships: ManagedMembership[];
  patients: ManagedPatient[];
  available_profiles: AvailableProfile[];
  can_create_clinics: boolean;
};

export async function listManagedClinics(demo: string) {
  const supabase = await createSupabaseActorClient(demo);
  const { data, error } = await supabase.rpc("list_managed_clinics");
  if (error) throw error;
  return (data ?? []) as ManagedClinic[];
}

export async function getClinicManagement(clinicId: string, demo: string) {
  const supabase = await createSupabaseActorClient(demo);
  const { data, error } = await supabase.rpc("get_clinic_management", { p_clinic_id: clinicId });
  if (error) throw error;
  return data as ClinicManagement | { status: "not_found" };
}
