import pg from "pg";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is required for catalog verification of constraints, indexes, and policies.");
  process.exit(2);
}

const expectedTables = [
  "clinics",
  "profiles",
  "clinic_memberships",
  "patients",
  "care_entries",
  "entry_versions",
  "comments",
  "comment_mentions",
  "tasks",
  "provenance_sources",
  "provenance_spans",
  "highlights",
  "clinical_facts",
  "fact_conflicts",
  "importance_feedback",
  "glance_items",
  "patient_facing_content",
  "audit_events"
];

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1)",
    [expectedTables]
  );
  const foundTables = new Set(tables.rows.map((row) => row.table_name));
  const missingTables = expectedTables.filter((table) => !foundTables.has(table));

  const constraints = await client.query(
    "select count(*)::int as count from information_schema.table_constraints where table_schema = 'public' and table_name = any($1)",
    [expectedTables]
  );
  const indexes = await client.query(
    "select count(*)::int as count from pg_indexes where schemaname = 'public' and tablename = any($1)",
    [expectedTables]
  );
  const policies = await client.query(
    "select count(*)::int as count from pg_policies where schemaname = 'public' and tablename = any($1)",
    [expectedTables]
  );
  const rls = await client.query(
    "select relname from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace where nspname = 'public' and relname = any($1) and relrowsecurity",
    [expectedTables]
  );

  const missingRls = expectedTables.filter((table) => !new Set(rls.rows.map((row) => row.relname)).has(table));
  const functions = await client.query(
    "select proname from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace where nspname = 'public' and proname = any($1)",
    [[
      "create_care_entry",
      "edit_care_entry",
      "revert_care_entry",
      "create_comment",
      "set_comment_resolved",
      "create_task",
      "set_task_status",
      "validate_provenance_span",
      "deterministic_risk_floor",
      "seed_jane_trust_glance",
      "create_provenance_for_entry_span",
      "upsert_fact_from_span",
      "detect_fact_conflicts_for_patient",
      "ingest_ai_scribed_note",
      "create_patient_facing_draft",
      "set_patient_content_status"
    ]]
  );

  console.log(JSON.stringify({
    missingTables,
    missingRls,
    constraintCount: constraints.rows[0].count,
    indexCount: indexes.rows[0].count,
    policyCount: policies.rows[0].count,
    requiredFunctions: functions.rows.map((row) => row.proname).sort()
  }, null, 2));

  if (missingTables.length || missingRls.length || policies.rows[0].count < 12 || functions.rows.length < 16) {
    process.exit(1);
  }
} finally {
  await client.end();
}
