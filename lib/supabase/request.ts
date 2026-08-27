import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";
import { demoAccountByToken } from "@/lib/demo-auth";

export function createSupabaseBearerClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase request environment variables are not configured.");
  }

  return createClient(normalizeSupabaseUrl(supabaseUrl), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

export async function createSupabaseActorClient(tokenOrDemoToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase request environment variables are not configured.");
  }

  const demoAccount = demoAccountByToken[tokenOrDemoToken];
  if (!demoAccount) {
    return createSupabaseBearerClient(tokenOrDemoToken);
  }

  const supabase = createClient(normalizeSupabaseUrl(supabaseUrl), anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: demoAccount.email,
    password: "demo-password"
  });

  if (error || !data.session?.access_token) {
    throw new Error(`Demo sign-in failed for ${demoAccount.email}`);
  }

  return createSupabaseBearerClient(data.session.access_token);
}
