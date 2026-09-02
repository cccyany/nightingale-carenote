import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginPage = readFileSync("app/login/page.tsx", "utf8");
const appShell = readFileSync("components/AppShell.tsx", "utf8");
const clinicDirectory = readFileSync("app/admin/clinics/page.tsx", "utf8");
const clinicDetail = readFileSync("app/admin/clinics/[clinicId]/page.tsx", "utf8");
const clinicActions = readFileSync("components/ClinicManagementActions.tsx", "utf8");
const demoPersonActions = readFileSync("components/DemoPersonActions.tsx", "utf8");
const patientMePage = readFileSync("app/patient/me/page.tsx", "utf8");
const demoAccess = readFileSync("lib/demo-access.ts", "utf8");
const demoData = readFileSync("lib/demo-data.ts", "utf8");
const demoAccessMigration = readFileSync("supabase/migrations/025_demo_identity_access.sql", "utf8");
const supabaseRequest = readFileSync("lib/supabase/request.ts", "utf8");

test("Avery is presented as platform administrator, not Clinic A authority", () => {
  assert.match(demoData, /name: "Avery Ong"[\s\S]*clinicId: "platform"[\s\S]*clinicName: "Platform"[\s\S]*platformAdmin: true/);
  assert.match(loginPage, /Platform Administrator/);
  assert.match(loginPage, /Platform administrator identities are provisioned separately from clinic-scoped demo roles to prevent self-service privilege escalation/);
  assert.doesNotMatch(loginPage, /Avery Ong[\s\S]{0,200}Admin · Clinic A/);
});

test("Clara manages Clinic A directly and is not routed to platform clinic creation", () => {
  assert.match(demoData, /token: "demo-clinic-admin-a"[\s\S]*name: "Clara Ng"[\s\S]*role: "admin"/);
  assert.match(loginPage, /if \(user\.role === "admin"\) return `\/admin\/clinics\/\$\{user\.clinic_id\}\?demo=\$\{user\.token\}`/);
  assert.match(loginPage, /Manage \$\{clinicName \?\? "clinic"\}/);
  assert.match(clinicDirectory, /if \(!isPlatformAdmin && clinics\.length === 1\)/);
  assert.match(clinicDirectory, /redirect\(`\/admin\/clinics\/\$\{clinics\[0\]\.id\}\?demo=/);
  assert.match(clinicDirectory, /isPlatformAdmin \? <CreateClinicForm/);
});

test("Avery has platform clinic directory and create-clinic navigation", () => {
  assert.match(loginPage, /if \(user\.platform_admin\) return `\/admin\/clinics\?demo=\$\{user\.token\}`/);
  assert.match(loginPage, /Enter platform admin/);
  assert.match(clinicDirectory, /Platform administration/);
  assert.match(clinicDirectory, /CreateClinicForm/);
});

test("role-specific navigation separates platform admin from clinic admin", () => {
  assert.match(appShell, /actor\?\.platformAdmin/);
  assert.match(appShell, /Clinic management/);
  assert.match(appShell, /clinicManagementHref/);
  assert.match(appShell, /Platform Administrator/);
  assert.match(appShell, /Clinic Administrator/);
  assert.doesNotMatch(appShell, /actor\?\.role === "admin" \? \(\s*<Link[\s\S]*Clinics/);
});

test("create demo person is demo-scoped and cannot create platform administrators", () => {
  assert.match(loginPage, /CreateDemoPersonForm/);
  assert.ok(loginPage.indexOf("<CreateDemoPersonForm") < loginPage.indexOf("Platform administration"));
  assert.match(demoPersonActions, /\+ Create demo person/);
  assert.match(demoPersonActions, /This is not a production invitation/);
  assert.match(demoPersonActions, /admin: "Clinic Administrator"/);
  assert.doesNotMatch(demoPersonActions, /Platform Administrator<\/option>|value="platform/);
  assert.match(loginPage, /Platform administrator identities are provisioned separately from clinic-scoped demo roles to prevent self-service privilege escalation/);
});

test("new demo identities are listed by clinic from the registry", () => {
  assert.match(loginPage, /const access = await listDemoAccess\(\)/);
  assert.match(loginPage, /access\.clinics\.map\(\(clinic\)/);
  assert.match(loginPage, /clinicUsers\.filter\(\(user\) => user\.clinic_id === clinic\.id\)/);
  assert.doesNotMatch(loginPage, /No patient demo login is provisioned for this record/);
  assert.match(demoAccessMigration, /from demo_identities/);
  assert.match(supabaseRequest, /resolve_demo_identity/);
});

test("Alex Lim is a Clinic B patient demo identity, not a staff-routed patient record", () => {
  assert.match(demoData, /token: "demo-patient-alex"[\s\S]*name: "Alex Lim"[\s\S]*role: "patient"[\s\S]*clinicId: "clinic-b"/);
  assert.match(loginPage, /View approved patient-facing information/);
  assert.match(loginPage, /Enter as patient/);
  assert.match(loginPage, /if \(user\.role === "patient"\) return `\/patient\/me\?demo=\$\{user\.token\}`/);
  assert.doesNotMatch(loginPage, /\/patients\/\$\{patient\.id\}\?demo=\$\{careTeamActor\.token\}/);
  assert.match(patientMePage, /actor\?\.role !== "patient"/);
  assert.doesNotMatch(patientMePage, /demo !== "demo-patient"/);
});

test("clinic-level member and patient actions live inside clinic management", () => {
  assert.match(clinicActions, /Add existing demo\/profile/);
  assert.match(clinicActions, /Edit role/);
  assert.match(clinicActions, /Remove/);
  assert.match(clinicActions, /Transfer clinic/);
  assert.match(clinicActions, /Clinic Administrator/);
  assert.doesNotMatch(clinicActions, /Platform Administrator<\/option>/);
  assert.match(clinicActions, /Create patient/);
  assert.match(clinicActions, /\/api\/admin\/clinics\/\$\{clinicId\}\/members/);
  assert.match(clinicActions, /\/api\/admin\/clinic-memberships\/\$\{membershipId\}/);
  assert.match(clinicActions, /\/api\/admin\/clinic-memberships\/\$\{membershipId\}\/transfer/);
  assert.match(clinicActions, /\/api\/admin\/clinics\/\$\{clinicId\}\/patients/);
  assert.match(clinicDetail, /AddClinicMemberForm/);
  assert.match(clinicDetail, /ClinicMemberLifecycleActions/);
  assert.match(clinicDetail, /canTransfer=\{management\.can_create_clinics\}/);
  assert.match(clinicDetail, /CreateClinicPatientForm/);
  assert.match(clinicDetail, /rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white/);
  assert.doesNotMatch(clinicDetail, /Open CareNote -&gt;/);
});

test("ordinary clinician, staff and patient navigation does not expose clinic administration controls", () => {
  assert.doesNotMatch(appShell, /actor\?\.role === "staff"[\s\S]*\/admin\/clinics/);
  assert.doesNotMatch(appShell, /actor\?\.role === "clinician"[\s\S]*\/admin\/clinics/);
  assert.match(appShell, /patientView/);
});
