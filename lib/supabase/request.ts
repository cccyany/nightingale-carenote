import { createClient } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";
import { demoAccountByToken } from "@/lib/demo-auth";

type DemoAccount = { email: string; label: string };

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

  let demoAccount: DemoAccount | undefined = demoAccountByToken[tokenOrDemoToken];
  if (!demoAccount && tokenOrDemoToken.startsWith("demo-person-")) {
    const resolver = createClient(normalizeSupabaseUrl(supabaseUrl), anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data } = await resolver.rpc("resolve_demo_identity", { p_token: tokenOrDemoToken });
    if (data?.status === "ok" && typeof data.email === "string") {
      demoAccount = { email: data.email, label: "Demo person" };
    }
  }
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
