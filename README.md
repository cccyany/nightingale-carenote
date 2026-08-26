# Nightingale CareNote

Safe longitudinal care-note prototype for the Nightingale 72 Hour Build.

## Local Setup

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:3000/login`.

Copy `.env.example` to `.env.local` and fill Supabase values when connecting to a hosted or local Supabase project. The SQL schema and synthetic seed data live in `supabase/migrations` and `supabase/seed.sql`.

## Validation

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
pytest
```

All committed data is synthetic demo data only.
