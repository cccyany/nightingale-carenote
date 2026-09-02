"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailableProfile, ManagedClinicOption } from "@/lib/clinic-management";

const primaryButtonClass =
  "rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:bg-teal-200 disabled:text-teal-950";
const secondaryButtonClass =
  "rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-55";
const destructiveButtonClass =
  "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-55";

type ClinicMemberRole = "admin" | "clinician" | "staff";

function authHeaders(demo: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${demo}`
  };
}

function roleLabel(role: ClinicMemberRole) {
  if (role === "admin") return "Clinic Administrator";
  return role.replace(/\b\w/g, (letter) => letter.toUpperCase());
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
      <summary className="cursor-pointer text-sm font-semibold text-stone-800">Add existing demo/profile</summary>
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

export function ClinicMemberLifecycleActions({
  membershipId,
  memberName,
  clinicName,
  sourceClinicId,
  currentRole,
  demo,
  canTransfer,
  clinics
}: {
  membershipId: string;
  memberName: string;
  clinicName: string;
  sourceClinicId: string;
  currentRole: ClinicMemberRole;
  demo: string;
  canTransfer: boolean;
  clinics: ManagedClinicOption[];
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [role, setRole] = useState<ClinicMemberRole>(currentRole);
  const [targetClinicId, setTargetClinicId] = useState(() => clinics.find((clinic) => clinic.id !== sourceClinicId)?.id ?? "");
  const [targetRole, setTargetRole] = useState<ClinicMemberRole>(currentRole);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const transferClinics = clinics.filter((clinic) => clinic.id !== sourceClinicId && clinic.status === "active");

  async function updateRole() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/clinic-memberships/${membershipId}`, {
      method: "PATCH",
      headers: authHeaders(demo),
      body: JSON.stringify({ role })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Role updated." : payload?.error ?? `Role update failed (${response.status}).`);
    if (response.ok) {
      setEditOpen(false);
      router.refresh();
    }
  }

  async function removeMember() {
    const confirmed = window.confirm(`Remove ${memberName} from ${clinicName}?\n\nThis removes ${clinicName} access but does not delete the user profile or historical records.`);
    if (!confirmed) return;
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/clinic-memberships/${membershipId}`, {
      method: "DELETE",
      headers: authHeaders(demo)
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Member removed from clinic." : payload?.error ?? `Remove failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  async function transferMember() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/admin/clinic-memberships/${membershipId}/transfer`, {
      method: "POST",
      headers: authHeaders(demo),
      body: JSON.stringify({ targetClinicId, role: targetRole })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    setMessage(response.ok ? "Member transferred." : payload?.error ?? `Transfer failed (${response.status}).`);
    if (response.ok) {
      setTransferOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-2">
        <button className={secondaryButtonClass} onClick={() => setEditOpen((value) => !value)} type="button">Edit role</button>
        <button className={destructiveButtonClass} disabled={pending} onClick={removeMember} type="button">Remove</button>
        {canTransfer ? <button className={secondaryButtonClass} disabled={!transferClinics.length} onClick={() => setTransferOpen((value) => !value)} type="button">Transfer clinic</button> : null}
      </div>

      {editOpen ? (
        <div className="grid gap-2 rounded-md border border-stone-200 bg-stone-50 p-3 sm:grid-cols-[1fr_auto]">
          <label className="text-sm font-medium text-stone-700">
            Role
            <select className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setRole(event.target.value as ClinicMemberRole)} value={role}>
              <option value="admin">Clinic Administrator</option>
              <option value="clinician">Clinician</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          <button className={primaryButtonClass} disabled={pending || role === currentRole} onClick={updateRole} type="button">{pending ? "Saving..." : "Save changes"}</button>
        </div>
      ) : null}

      {transferOpen ? (
        <div className="grid gap-2 rounded-md border border-stone-200 bg-stone-50 p-3">
          <p className="text-sm text-stone-700">Transfer {memberName} from {clinicName}. The user profile and historical records are preserved.</p>
          <label className="text-sm font-medium text-stone-700">
            To clinic
            <select className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setTargetClinicId(event.target.value)} value={targetClinicId}>
              {transferClinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-stone-700">
            Role in target clinic
            <select className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setTargetRole(event.target.value as ClinicMemberRole)} value={targetRole}>
              <option value="admin">Clinic Administrator</option>
              <option value="clinician">Clinician</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          <button className={primaryButtonClass} disabled={pending || !targetClinicId} onClick={transferMember} type="button">{pending ? "Transferring..." : "Transfer"}</button>
        </div>
      ) : null}

      {message ? <p className="text-sm text-stone-700">{message}</p> : null}
      <p className="sr-only">Current role: {roleLabel(currentRole)}</p>
    </div>
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
