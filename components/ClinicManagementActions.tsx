"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailableProfile } from "@/lib/clinic-management";

const primaryButtonClass =
  "rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:bg-teal-200 disabled:text-teal-950";
const secondaryButtonClass =
  "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-55";

function authHeaders(demo: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${demo}`
  };
}

export function CreateClinicForm({ demo, profiles }: { demo: string; profiles: AvailableProfile[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [timezone, setTimezone] = useState("Asia/Singapore");
  const [initialAdminProfileId, setInitialAdminProfileId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/admin/clinics", {
      method: "POST",
      headers: authHeaders(demo),
      body: JSON.stringify({ name, code: code || null, timezone, initialAdminProfileId: initialAdminProfileId || null })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setMessage(payload?.error ?? `Clinic creation failed (${response.status}).`);
      return;
    }
    setName("");
    setCode("");
    setInitialAdminProfileId("");
    setOpen(false);
    setMessage("Clinic created.");
    router.push(`/admin/clinics/${payload.clinicId}?demo=${encodeURIComponent(demo)}`);
    router.refresh();
  }

  return (
    <div>
      <button className={primaryButtonClass} onClick={() => setOpen((value) => !value)} type="button">+ Create clinic</button>
      {open ? (
        <div className="mt-3 space-y-3 rounded-md border border-stone-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">
              Clinic name
              <input className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setName(event.target.value)} value={name} />
            </label>
            <label className="text-sm font-medium text-stone-700">
              Clinic code
              <input className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setCode(event.target.value)} placeholder="clinic-c" value={code} />
            </label>
            <label className="text-sm font-medium text-stone-700">
              Timezone
              <input className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setTimezone(event.target.value)} value={timezone} />
            </label>
            <label className="text-sm font-medium text-stone-700">
              Initial clinic admin
              <select className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setInitialAdminProfileId(event.target.value)} value={initialAdminProfileId}>
                <option value="">Assign later</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name} · {profile.primary_role}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={primaryButtonClass} disabled={pending || !name.trim()} onClick={submit} type="button">{pending ? "Creating..." : "Create clinic"}</button>
            <button className={secondaryButtonClass} onClick={() => setOpen(false)} type="button">Cancel</button>
          </div>
          {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddClinicMemberForm({ clinicId, demo, profiles }: { clinicId: string; demo: string; profiles: AvailableProfile[] }) {
  const router = useRouter();
  const [profileId, setProfileId] = useState("");
  const [role, setRole] = useState<"admin" | "clinician" | "staff">("clinician");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/clinics/${clinicId}/members`, {
      method: "POST",
      headers: authHeaders(demo),
      body: JSON.stringify({ profileId, role })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Member provisioned." : payload?.error ?? `Member provisioning failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  return (
    <details className="rounded-md border border-stone-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-stone-800">Add administrator, clinician or staff</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <select className="rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setProfileId(event.target.value)} value={profileId}>
          <option value="">Choose existing user</option>
          {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name} · {profile.primary_role}</option>)}
        </select>
        <select className="rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setRole(event.target.value as "admin" | "clinician" | "staff")} value={role}>
          <option value="admin">Administrator</option>
          <option value="clinician">Clinician</option>
          <option value="staff">Staff</option>
        </select>
        <button className={primaryButtonClass} disabled={pending || !profileId} onClick={submit} type="button">{pending ? "Adding..." : "Add"}</button>
      </div>
      {message ? <p className="mt-2 text-sm text-stone-700">{message}</p> : null}
    </details>
  );
}

export function CreateClinicPatientForm({ clinicId, demo }: { clinicId: string; demo: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/clinics/${clinicId}/patients`, {
      method: "POST",
      headers: authHeaders(demo),
      body: JSON.stringify({ displayName, dateOfBirth, synthetic: true })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Patient created in this clinic." : payload?.error ?? `Patient creation failed (${response.status}).`);
    if (response.ok) {
      setDisplayName("");
      setDateOfBirth("");
      router.refresh();
    }
  }

  return (
    <details className="rounded-md border border-stone-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-stone-800">Create patient</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <input className="rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setDisplayName(event.target.value)} placeholder="Synthetic patient name" value={displayName} />
        <input className="rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setDateOfBirth(event.target.value)} type="date" value={dateOfBirth} />
        <button className={primaryButtonClass} disabled={pending || !displayName.trim() || !dateOfBirth} onClick={submit} type="button">{pending ? "Creating..." : "Create"}</button>
      </div>
      {message ? <p className="mt-2 text-sm text-stone-700">{message}</p> : null}
    </details>
  );
}
