import fs from "node:fs";
import path from "node:path";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

function normalizeSupabaseUrl(raw) {
  const url = new URL(raw);
  return `${url.protocol}//${url.host}`;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) : "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const patientId = process.env.GLANCE_BENCHMARK_PATIENT_ID ?? "30000000-0000-0000-0000-000000000001";
const requests = Number(process.env.GLANCE_BENCHMARK_REQUESTS ?? 20);
const concurrency = Number(process.env.GLANCE_BENCHMARK_CONCURRENCY ?? 1);

if (!supabaseUrl || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  process.exit(2);
}

async function signIn() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: "staff.a@example.test", password: "demo-password" })
  });
  if (!response.ok) throw new Error(`demo sign-in failed: ${response.status}`);
  const payload = await response.json();
  return payload.access_token;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

async function timedRequest(token) {
  const started = performance.now();
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/read_patient_glance`, {
    method: "POST",
    headers: { apikey: anonKey, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ p_patient_id: patientId })
  });
  const text = await response.text();
  const elapsed = performance.now() - started;
  return { elapsed, ok: response.ok, status: response.status, bytes: text.length };
}

const token = await signIn();
for (let i = 0; i < concurrency; i += 1) {
  await timedRequest(token);
}

const results = [];
let next = 0;
async function worker() {
  while (next < requests) {
    next += 1;
    results.push(await timedRequest(token));
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));

const latencies = results.map((result) => result.elapsed);
const failures = results.filter((result) => !result.ok);
const report = {
  generated_at: new Date().toISOString(),
  environment: "direct Supabase PostgREST from local benchmark script",
  endpoint: "POST /rest/v1/rpc/read_patient_glance persisted warm read",
  patient_id: patientId,
  warmup_requests: concurrency,
  measured_requests: requests,
  concurrency,
  includes_network_latency: true,
  warm_path_has_llm_call: false,
  warm_path_has_extraction: false,
  failures: failures.length,
  p50_ms: percentile(latencies, 50),
  p95_ms: percentile(latencies, 95),
  p99_ms: percentile(latencies, 99),
  target_p95_ms: 300,
  target_met: percentile(latencies, 95) <= 300
};

const outDir = path.join("docs", "performance");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "glance-benchmark.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
