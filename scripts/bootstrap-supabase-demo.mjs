import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const admin = createClient(new URL(supabaseUrl).origin, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const demoUsers = [
  { id: "10000000-0000-0000-0000-000000000001", email: "patient.jane@example.test", password: "demo-password" },
  { id: "10000000-0000-0000-0000-000000000002", email: "staff.a@example.test", password: "demo-password" },
  { id: "10000000-0000-0000-0000-000000000003", email: "clinician.a@example.test", password: "demo-password" },
  { id: "10000000-0000-0000-0000-000000000004", email: "admin.a@example.test", password: "demo-password" },
  { id: "10000000-0000-0000-0000-000000000005", email: "staff.b@example.test", password: "demo-password" },
  { id: "10000000-0000-0000-0000-000000000006", email: "clinic.admin.a@example.test", password: "demo-password" },
  { id: "10000000-0000-0000-0000-000000000007", email: "patient.alex@example.test", password: "demo-password" }
];

for (const user of demoUsers) {
  const { data, error } = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { synthetic_demo: true }
  });

  if (error && !error.message.toLowerCase().includes("already")) {
    throw error;
  }

  if (error) {
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: { synthetic_demo: true }
    });
    if (updateError) {
      throw updateError;
    }
    console.log(`updated auth user ${user.email}`);
  } else {
    console.log(`created auth user ${data.user?.email}`);
  }
}
