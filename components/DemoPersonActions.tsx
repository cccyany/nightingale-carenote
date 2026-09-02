"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { DemoAccessClinic } from "@/lib/demo-access";

type DemoPersonRole = "admin" | "clinician" | "staff";

const roleLabels: Record<DemoPersonRole, string> = {
  admin: "Clinic Administrator",
  clinician: "Clinician",
  staff: "Staff"
};

export function CreateDemoPersonForm({ clinics, demo }: { clinics: DemoAccessClinic[]; demo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clinicId, setClinicId] = useState(clinics[0]?.id ?? "");
  const [role, setRole] = useState<DemoPersonRole>("clinician");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const canSubmit = useMemo(() => name.trim().length > 0 && clinicId.length > 0 && role in roleLabels && status !== "saving", [clinicId, name, role, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus("saving");
    setMessage("");
    const response = await fetch("/api/admin/demo-people", {
      method: "POST",
      headers: {
        authorization: `Bearer ${demo}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ name: name.trim(), clinicId, role })
    });
    if (!response.ok) {
      setStatus("error");
      setMessage("Demo person could not be created.");
      return;
    }
    setStatus("success");
    setMessage("Demo person created.");
    setName("");
    router.refresh();
  }

  return (
    <div className="shrink-0">
      <button
        className="inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-stone-300"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        + Create demo person
      </button>
      {open ? (
        <form className="mt-3 grid w-full gap-3 rounded-md border border-stone-200 bg-white p-4 shadow-sm sm:w-80" onSubmit={submit}>
          <p className="text-sm text-stone-700">Creates a synthetic demo profile and clinic membership. This is not a production invitation.</p>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-stone-800">Name</span>
            <input className="rounded-md border border-stone-300 p-2 focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-stone-800">Clinic</span>
            <select className="rounded-md border border-stone-300 p-2 focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setClinicId(event.target.value)} value={clinicId}>
              {clinics.map((clinic) => <option key={clinic.id} value={clinic.id}>{clinic.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-stone-800">Role</span>
            <select className="rounded-md border border-stone-300 p-2 focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setRole(event.target.value as DemoPersonRole)} value={role}>
              <option value="admin">Clinic Administrator</option>
              <option value="clinician">Clinician</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:bg-stone-300" disabled={!canSubmit} type="submit">
            {status === "saving" ? "Creating..." : "Create demo person"}
          </button>
          {message ? <p className={`text-sm ${status === "error" ? "text-red-700" : "text-teal-800"}`}>{message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
