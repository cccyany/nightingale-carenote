import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { loadEnvFile } from "./load-env.mjs";

loadEnvFile();

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error("SUPABASE_DB_URL is required to apply SQL migrations safely from this workspace.");
  console.error("NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY can manage Auth and data, but cannot run DDL.");
  process.exit(2);
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query(`
    create table if not exists public.schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const migrations = readdirSync("supabase/migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const applied = await client.query("select 1 from public.schema_migrations where version = $1", [migration]);
    if (applied.rowCount) {
      console.log(`skipping already applied ${migration}`);
      continue;
    }

    if (migration === "001_foundation_security.sql") {
      const { rows } = await client.query("select to_regclass('public.clinics') as clinics_table");
      if (rows[0]?.clinics_table) {
        await client.query("insert into public.schema_migrations(version) values($1) on conflict do nothing", [migration]);
        console.log(`marking existing ${migration} as applied`);
        continue;
      }
    }

    console.log(`applying migration ${migration}`);
    await client.query("begin");
    try {
      await client.query(readFileSync(`supabase/migrations/${migration}`, "utf8"));
      await client.query("insert into public.schema_migrations(version) values($1)", [migration]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  console.log("applying seed.sql");
  await client.query(readFileSync("supabase/seed.sql", "utf8"));
} finally {
  await client.end();
}
