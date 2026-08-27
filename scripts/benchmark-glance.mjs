import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

function normalizeSupabaseUrl(raw) {
  const url = new URL(raw);
  return `${url.protocol}//${url.host}`;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) : "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const dbUrl = process.env.SUPABASE_DB_URL;
const patientId = process.env.GLANCE_BENCHMARK_PATIENT_ID ?? "30000000-0000-0000-0000-000000000001";
const requests = Number(process.env.GLANCE_BENCHMARK_REQUESTS ?? 50);
const concurrency = Number(process.env.GLANCE_BENCHMARK_CONCURRENCY ?? 1);
const warmupRequests = Number(process.env.GLANCE_BENCHMARK_WARMUP_REQUESTS ?? 10);
const staffUserId = process.env.GLANCE_BENCHMARK_STAFF_USER_ID ?? "10000000-0000-0000-0000-000000000002";

if (!supabaseUrl || !anonKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
  process.exit(2);
}

async function signIn() {
  const started = performance.now();
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: "staff.a@example.test", password: "demo-password" })
  });
  if (!response.ok) throw new Error(`demo sign-in failed: ${response.status}`);
  const payload = await response.json();
  return { token: payload.access_token, elapsed: performance.now() - started };
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

async function measureDirectDatabase() {
  if (!dbUrl) return null;
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const latencies = [];
    const executionTimes = [];
    for (let i = 0; i < warmupRequests; i += 1) {
      await client.query("begin");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [staffUserId]);
      await client.query("select * from read_patient_glance($1)", [patientId]);
      await client.query("rollback");
    }
    for (let i = 0; i < requests; i += 1) {
      const started = performance.now();
      await client.query("begin");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [staffUserId]);
      await client.query("select * from read_patient_glance($1)", [patientId]);
      await client.query("rollback");
      latencies.push(performance.now() - started);
    }
    for (let i = 0; i < Math.min(10, requests); i += 1) {
      await client.query("begin");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [staffUserId]);
      const plan = await client.query("explain (analyze, format json) select * from read_patient_glance($1)", [patientId]);
      await client.query("rollback");
      executionTimes.push(plan.rows[0]["QUERY PLAN"][0]["Execution Time"]);
    }
    return {
      measured_requests: requests,
      warmup_requests: warmupRequests,
      p50_ms: percentile(latencies, 50),
      p95_ms: percentile(latencies, 95),
      p99_ms: percentile(latencies, 99),
      note: "Direct pooler timing includes multiple client-server round trips: begin, auth claim setup, RPC select, rollback.",
      database_execution_ms_from_explain_analyze: {
        samples: executionTimes.length,
        p50_ms: percentile(executionTimes, 50),
        p95_ms: percentile(executionTimes, 95),
        p99_ms: percentile(executionTimes, 99)
      }
    };
  } finally {
    await client.end();
  }
}

const auth = await signIn();
for (let i = 0; i < warmupRequests; i += 1) {
  await timedRequest(auth.token);
}

const results = [];
let next = 0;
async function worker() {
  while (next < requests) {
    next += 1;
    results.push(await timedRequest(auth.token));
  }
}
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const directDatabase = await measureDirectDatabase();

const latencies = results.map((result) => result.elapsed);
const failures = results.filter((result) => !result.ok);
const report = {
  generated_at: new Date().toISOString(),
  environment: "direct Supabase PostgREST from local benchmark script",
  endpoint: "POST /rest/v1/rpc/read_patient_glance persisted warm read",
  patient_id: patientId,
  warmup_requests: warmupRequests,
  measured_requests: requests,
  concurrency,
  includes_network_latency: true,
  warm_path_has_llm_call: false,
  warm_path_has_extraction: false,
  auth_token_ms: Number(auth.elapsed.toFixed(2)),
  nextjs_route_measured: false,
  nextjs_route_note: "This benchmark measures the Supabase/PostgREST warm read path used by the Next.js route; it does not start a local Next.js server.",
  secondary_reads: "none on warm Glance read; provenance pointers are returned without hydration",
  failures: failures.length,
  p50_ms: percentile(latencies, 50),
  p95_ms: percentile(latencies, 95),
  p99_ms: percentile(latencies, 99),
  direct_database_rpc_ms: directDatabase,
  target_p95_ms: 300,
  target_met: percentile(latencies, 95) <= 300
};

const outDir = path.join("docs", "performance");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "glance-benchmark.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
