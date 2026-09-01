"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type AssignableUser = {
  profile_id: string;
  role: string;
  profiles: { display_name: string } | null;
};

type Entry = {
  id: string;
  current_version: number;
  author_role: string;
};

export type PatientDraftSourceEntry = {
  id: string;
  entry_type: string;
  author_role: string;
  visibility: string;
  content: string;
  occurred_at: string;
  current_version: number;
  profiles?: { display_name: string } | null;
};

function aiFailureMessage(code?: string) {
  if (code === "provider_timeout") {
    return "AI generation timed out. Existing verified information remains available; please retry later.";
  }
  if (code === "provider_unavailable") {
    return "AI generation is temporarily unavailable. Existing verified information remains available; please retry later.";
  }
  return "AI generation could not be completed safely. No AI note was created.";
}

const demoTokens = [
  ["staff", "Staff"],
  ["clinician", "Clinician"],
  ["admin", "Admin"]
];

const primaryButtonClass =
  "rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:bg-teal-200 disabled:text-teal-950";
const secondaryButtonClass =
  "rounded-md border border-stone-300 bg-white px-2 py-1 text-xs font-medium text-stone-800 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-55";
const tealOutlineButtonClass =
  "rounded-md border border-teal-700 bg-white px-2 py-1 text-xs font-medium text-teal-900 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-55";
const dangerButtonClass =
  "rounded-md border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-55";

const patientContentTypes = [
  ["visit_summary", "Visit summary"],
  ["follow_up_instructions", "Follow-up instructions"],
  ["medication_instructions", "Medication instructions"],
  ["care_plan_update", "Care plan update"],
  ["general_update", "General patient update"]
];

function authHeaders(role: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer demo-${role}`
  };
}

function displayToken(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en-SG", { timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function preview(content: string, max = 130) {
  const text = content.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function sourceLabel(entry: PatientDraftSourceEntry) {
  if (entry.author_role === "system") return "AI Scribe";
  if (entry.entry_type === "clinician_note") return "Clinician note";
  if (entry.entry_type === "staff_note") return "Staff note";
  if (entry.entry_type === "patient_note") return "Patient note";
  return displayToken(entry.entry_type);
}

function eligiblePatientDraftSource(entry: PatientDraftSourceEntry) {
  if (entry.visibility === "admin_only") return false;
  return !["admin_event", "system_event"].includes(entry.entry_type);
}

function groupDraftSourcesByDate(entries: PatientDraftSourceEntry[]) {
  const groups: { label: string; entries: PatientDraftSourceEntry[] }[] = [];
  for (const entry of entries.filter(eligiblePatientDraftSource)) {
    const label = dateLabel(entry.occurred_at);
    const existing = groups.find((group) => group.label === label);
    if (existing) existing.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

export function NoteComposer({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [role, setRole] = useState("staff");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    setMessage("");
    const response = await fetch(`/api/patients/${patientId}/entries`, {
      method: "POST",
      headers: authHeaders(role),
      body: JSON.stringify({
        entryType: role === "clinician" ? "clinician_note" : "staff_note",
        visibility: role === "clinician" ? "clinician_internal" : "staff_internal",
        content
      })
    });
    setMessage(response.ok ? "Note created." : `Could not create note (${response.status}).`);
    if (response.ok) {
      setContent("");
      router.refresh();
    }
  }

  return (
    <details className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-base font-semibold">+ Add care-team note</summary>
      <p className="mt-2 text-sm text-stone-600">Demo author choice; server authorization and RLS enforce writes.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {demoTokens.slice(0, 2).map(([value, label]) => (
          <button
            className={`rounded border px-3 py-1 text-sm ${role === value ? "border-teal-700 bg-teal-50" : "border-stone-300"}`}
            key={value}
            onClick={() => setRole(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <textarea className="mt-3 min-h-24 w-full rounded-md border border-stone-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setContent(event.target.value)} placeholder="Synthetic care-team note" value={content} />
      <button className={`${primaryButtonClass} mt-3 px-4 py-2`} disabled={!content.trim()} onClick={submit} type="button">Save note</button>
      {message ? <p className="mt-2 text-sm text-stone-700">{message}</p> : null}
    </details>
  );
}

export function AiScribeComposer({ patientId, actorRole }: { patientId: string; actorRole?: string }) {
  const router = useRouter();
  const [entryType, setEntryType] = useState("ai_doctor_consult_summary");
  const [rawTranscript, setRawTranscript] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (actorRole !== "clinician" && actorRole !== "admin") return null;

  async function submit() {
    setMessage("");
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/patients/${patientId}/ai-scribe`, {
        method: "POST",
        headers: authHeaders(actorRole === "admin" ? "admin" : "clinician"),
        body: JSON.stringify({
          entryType,
          sourceLabel: "Runtime synthetic AI Scribe transcript",
          rawTranscript
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = payload?.status === "needs_review" ? "Needs review" : `Generation failed (${response.status})`;
        setError(`${status}. ${aiFailureMessage(payload?.code)}`);
        return;
      }
      setMessage(`AI Scribe created with ${payload.provider ?? "configured provider"}. It remains needs verification.`);
      setRawTranscript("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-md border border-amber-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-base font-semibold">+ AI Scribe</summary>
      <div className="mt-3 space-y-3">
        <div>
          <label className="text-sm font-medium text-stone-800" htmlFor="ai-scribe-type">Interaction type</label>
          <select
            className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            id="ai-scribe-type"
            onChange={(event) => setEntryType(event.target.value)}
            value={entryType}
          >
            <option value="ai_doctor_consult_summary">Doctor-Patient Consult</option>
            <option value="ai_nurse_consult_summary">Nurse-Patient Consult</option>
            <option value="ai_patient_session_summary">AI-Patient Session</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-stone-800" htmlFor="ai-scribe-transcript">Synthetic consultation transcript</label>
          <p className="mt-1 text-xs text-stone-600">Use synthetic data only. Do not enter real patient information.</p>
          <textarea
            className="mt-2 min-h-36 w-full rounded-md border border-stone-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            id="ai-scribe-transcript"
            onChange={(event) => setRawTranscript(event.target.value)}
            placeholder="Patient reports nocturnal cough for three weeks. Clinician discussed repeat renal panel; no order yet."
            value={rawTranscript}
          />
        </div>
        <button
          className={`${primaryButtonClass} px-4 py-2`}
          disabled={pending || !rawTranscript.trim()}
          onClick={submit}
          type="button"
        >
          {pending ? "Generating..." : "Generate AI Summary"}
        </button>
        {message ? <p className="rounded border border-teal-200 bg-teal-50 p-2 text-sm text-teal-950">{message}</p> : null}
        {error ? <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">{error}</p> : null}
      </div>
    </details>
  );
}

export function PatientFacingDraftComposer({
  patientId,
  actorRole,
  entries,
  initialSourceId
}: {
  patientId: string;
  actorRole?: string;
  entries: PatientDraftSourceEntry[];
  initialSourceId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initialSourceId));
  const [mode, setMode] = useState<"generate" | "manual">(initialSourceId ? "generate" : "generate");
  const [contentType, setContentType] = useState("visit_summary");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSourceId ? [initialSourceId] : []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [provider, setProvider] = useState("");
  const [pending, setPending] = useState<"generate" | "save" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (actorRole !== "clinician" && actorRole !== "admin") return null;

  const groups = groupDraftSourcesByDate(entries);
  const selectedEntries = entries.filter((entry) => selectedIds.includes(entry.id));
  const canSave = Boolean(title.trim() && body.trim() && selectedIds.length);

  function toggleSource(entryId: string) {
    setSelectedIds((ids) => ids.includes(entryId) ? ids.filter((id) => id !== entryId) : [...ids, entryId]);
  }

  function selectDate(entriesForDate: PatientDraftSourceEntry[]) {
    const ids = entriesForDate.map((entry) => entry.id);
    setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
  }

  function resetDraft() {
    setTitle("");
    setBody("");
    setKeyPoints([]);
    setProvider("");
    setMessage("");
    setError("");
  }

  async function generateDraft() {
    setPending("generate");
    setMessage("");
    setError("");
    const response = await fetch(`/api/patients/${patientId}/patient-content`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ action: "generate", contentType, sourceEntryIds: selectedIds })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) {
      setError(payload?.error ?? aiFailureMessage(payload?.code));
      return;
    }
    setTitle(payload.title ?? "");
    setBody(payload.body ?? "");
    setKeyPoints(Array.isArray(payload.keyPoints) ? payload.keyPoints : []);
    setProvider(payload.provider ?? "Configured provider");
    setMode("generate");
    setMessage("Draft generated. Edit it before saving for clinician review.");
  }

  async function saveDraft() {
    setPending("save");
    setMessage("");
    setError("");
    const response = await fetch(`/api/patients/${patientId}/patient-content`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({
        action: "save",
        contentType,
        generationMethod: mode === "generate" ? "ai_assisted" : "manual",
        sourceEntryIds: selectedIds,
        title,
        body
      })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(null);
    if (!response.ok) {
      setError(payload?.error ?? `Draft could not be saved (${response.status}).`);
      return;
    }
    resetDraft();
    setSelectedIds([]);
    setOpen(false);
    setMessage("Saved for patient-facing review. It is not visible to the patient until approved.");
    router.refresh();
  }

  return (
    <div className="mt-3 rounded-md border border-teal-100 bg-teal-50/40 p-3">
      <div className="flex flex-wrap gap-2">
        <button className={primaryButtonClass} onClick={() => { setOpen(true); setMode("generate"); }} type="button">Generate from care record</button>
        <button className={secondaryButtonClass} onClick={() => { setOpen(true); setMode("manual"); resetDraft(); }} type="button">+ Add manually</button>
      </div>
      {open ? (
        <div className="mt-3 space-y-3 rounded-md border border-stone-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Create patient-facing content</h3>
              <p className="text-xs text-stone-600">Select care-record entries first. Drafts stay hidden until approval.</p>
            </div>
            <button className={secondaryButtonClass} onClick={() => setOpen(false)} type="button">Close</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-stone-700">
              Output type
              <select className="mt-1 w-full rounded border border-stone-300 p-2 text-sm" onChange={(event) => setContentType(event.target.value)} value={contentType}>
                {patientContentTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="text-xs text-stone-600">
              <p className="font-medium text-stone-700">Sources selected</p>
              <p>{selectedIds.length} care-record {selectedIds.length === 1 ? "entry" : "entries"}</p>
            </div>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto rounded border border-stone-200 p-2">
            {groups.map((group) => (
              <details className="rounded border border-stone-100 bg-stone-50" key={group.label} open={group.entries.some((entry) => selectedIds.includes(entry.id))}>
                <summary className="cursor-pointer px-2 py-1 text-xs font-semibold text-stone-800">
                  <span>{group.label}</span>
                  <span className="ml-2 font-normal text-stone-500">{group.entries.length} eligible</span>
                </summary>
                <div className="space-y-1 border-t border-stone-100 p-2">
                  <button className={tealOutlineButtonClass} onClick={() => selectDate(group.entries)} type="button">Select all eligible entries from this date</button>
                  {group.entries.map((entry) => (
                    <label className="mt-2 flex gap-2 rounded border border-stone-200 bg-white p-2 text-xs" key={entry.id}>
                      <input checked={selectedIds.includes(entry.id)} className="mt-1" onChange={() => toggleSource(entry.id)} type="checkbox" />
                      <span>
                        <span className="block font-semibold text-stone-800">{sourceLabel(entry)} - {timeLabel(entry.occurred_at)}</span>
                        <span className="block text-stone-600">{entry.profiles?.display_name ?? (entry.author_role === "system" ? "System" : "Care team")} - version {entry.current_version}</span>
                        <span className="mt-1 block text-stone-700">{preview(entry.content)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            ))}
          </div>
          {mode === "generate" ? (
            <button className={primaryButtonClass} disabled={pending === "generate" || !selectedIds.length} onClick={generateDraft} type="button">
              {pending === "generate" ? "Generating draft..." : "Generate draft"}
            </button>
          ) : null}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-stone-700" htmlFor="patient-draft-title">Title</label>
            <input
              className="w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              id="patient-draft-title"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Patient-facing title"
              value={title}
            />
            <label className="block text-xs font-medium text-stone-700" htmlFor="patient-draft-body">Body</label>
            <textarea
              className="min-h-32 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              id="patient-draft-body"
              onChange={(event) => setBody(event.target.value)}
              placeholder={mode === "manual" ? "Write patient-friendly content for clinician review." : "Generate a draft, then edit before saving."}
              value={body}
            />
          </div>
          {keyPoints.length ? (
            <details className="rounded border border-stone-200 p-2 text-xs text-stone-700">
              <summary className="cursor-pointer font-medium">AI draft details</summary>
              {provider ? <p className="mt-1">Provider: {provider}</p> : null}
              <p>Based on {selectedIds.length} selected care-record {selectedIds.length === 1 ? "entry" : "entries"}.</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {keyPoints.map((point) => <li key={point}>{point}</li>)}
              </ul>
            </details>
          ) : selectedEntries.length ? (
            <p className="text-xs text-stone-600">Based on {selectedEntries.length} selected care-record {selectedEntries.length === 1 ? "entry" : "entries"}.</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button className={primaryButtonClass} disabled={pending === "save" || !canSave} onClick={saveDraft} type="button">
              {pending === "save" ? "Saving..." : "Save for review"}
            </button>
            {mode === "generate" ? <button className={secondaryButtonClass} disabled={pending === "generate" || !selectedIds.length} onClick={generateDraft} type="button">Regenerate</button> : null}
            <button className={secondaryButtonClass} onClick={() => { resetDraft(); setSelectedIds([]); setOpen(false); }} type="button">Cancel</button>
          </div>
          {message ? <p className="rounded border border-teal-200 bg-teal-50 p-2 text-xs text-teal-950">{message}</p> : null}
          {error ? <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function EntryEditor({ entry }: { entry: Entry }) {
  const router = useRouter();
  const [role, setRole] = useState(entry.author_role === "clinician" ? "clinician" : "staff");
  const [content, setContent] = useState("");
  const [expectedVersion] = useState(entry.current_version);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);

  async function submit() {
    setMessage("");
    setConflict(null);
    const response = await fetch(`/api/entries/${entry.id}`, {
      method: "PATCH",
      headers: authHeaders(role),
      body: JSON.stringify({ expectedVersion, content })
    });
    const payload = await response.json();
    if (response.status === 409) {
      setConflict(payload.currentContent ?? "Current version changed before your save.");
      setMessage(payload.message ?? "This note was updated by someone else. Review the latest version before saving again.");
      return;
    }
    setMessage(response.ok ? "Edit saved as a new version." : `Edit failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  return (
    <details className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Edit</summary>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="rounded border border-stone-300 p-1 text-sm" onChange={(event) => setRole(event.target.value)} value={role}>
          {demoTokens.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <textarea className="mt-2 min-h-20 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setContent(event.target.value)} placeholder="Updated note text" value={content} />
      <button className={`${primaryButtonClass} mt-2`} disabled={!content.trim()} onClick={submit} type="button">
        Save edit
      </button>
      {message ? <p className="mt-2 text-sm text-stone-700">{message}</p> : null}
      {conflict ? (
        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-sm">
          <strong>Conflict review</strong>
          <p className="mt-1">{conflict}</p>
        </div>
      ) : null}
    </details>
  );
}

export function CommentComposer({ entryId, users }: { entryId: string; users: AssignableUser[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [mention, setMention] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    const response = await fetch(`/api/entries/${entryId}/comments`, {
      method: "POST",
      headers: authHeaders("staff"),
      body: JSON.stringify({
        body,
        parentCommentId: null,
        mentions: mention ? [mention] : []
      })
    });
    setMessage(response.ok ? "Comment saved." : `Comment failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  return (
    <details className="mt-3 rounded-md border border-stone-200 bg-white/70 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Comment</summary>
      <select className="mt-2 w-full rounded border border-stone-300 p-2 text-sm" onChange={(event) => setMention(event.target.value)} value={mention}>
        <option value="">No mention</option>
        {users.map((user) => <option key={user.profile_id} value={user.profile_id}>@{user.profiles?.display_name ?? user.profile_id} ({user.role})</option>)}
      </select>
      <textarea className="mt-2 min-h-16 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setBody(event.target.value)} placeholder="Internal collaboration comment" value={body} />
      <button className={`${primaryButtonClass} mt-2`} disabled={!body.trim()} onClick={submit} type="button">Post comment</button>
      {message ? <p className="mt-2 text-sm text-stone-700">{message}</p> : null}
    </details>
  );
}

export function ReplyComposer({ entryId, parentCommentId }: { entryId: string; parentCommentId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    const response = await fetch(`/api/entries/${entryId}/comments`, {
      method: "POST",
      headers: authHeaders("staff"),
      body: JSON.stringify({ body, parentCommentId, mentions: [] })
    });
    setMessage(response.ok ? "Reply saved." : `Reply failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-teal-800">Reply</summary>
      <textarea className="mt-2 min-h-14 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setBody(event.target.value)} placeholder="Reply to this thread" value={body} />
      <button className={`${primaryButtonClass} mt-2 text-xs`} disabled={!body.trim()} onClick={submit} type="button">Post reply</button>
      {message ? <span className="ml-2 text-xs text-stone-600">{message}</span> : null}
    </details>
  );
}

export function CommentResolveButton({ commentId, resolved }: { commentId: string; resolved: boolean }) {
  const router = useRouter();
  async function submit() {
    await fetch(`/api/comments/${commentId}/resolve`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ resolved: !resolved })
    });
    router.refresh();
  }

  return <button className={secondaryButtonClass} onClick={submit} type="button">{resolved ? "Unresolve" : "Resolve"}</button>;
}

export function TaskComposer({ patientId, entryId, users }: { patientId: string; entryId?: string; users: AssignableUser[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(users[0]?.profile_id ?? "");
  const [dueDate, setDueDate] = useState("");

  async function submit() {
    await fetch(`/api/patients/${patientId}/tasks`, {
      method: "POST",
      headers: authHeaders("staff"),
      body: JSON.stringify({ title, assigneeId: assignee, sourceEntryId: entryId ?? null, dueDate: dueDate || null })
    });
    setTitle("");
    router.refresh();
  }

  return (
    <details className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-base font-semibold">+ Assign follow-up</summary>
      <input className="mt-3 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setTitle(event.target.value)} placeholder="Task title" value={title} />
      <select className="mt-2 w-full rounded border border-stone-300 p-2" onChange={(event) => setAssignee(event.target.value)} value={assignee}>
        {users.map((user) => <option key={user.profile_id} value={user.profile_id}>{user.profiles?.display_name ?? user.profile_id} ({user.role})</option>)}
      </select>
      <input className="mt-2 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
      <button className={`${primaryButtonClass} mt-3 px-4 py-2`} disabled={!title.trim() || !assignee} onClick={submit} type="button">Create task</button>
    </details>
  );
}

export function TaskStatusButton({ taskId, status }: { taskId: string; status: string }) {
  const router = useRouter();
  async function submit() {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "POST",
      headers: authHeaders("staff"),
      body: JSON.stringify({ status: status === "completed" ? "open" : "completed" })
    });
    router.refresh();
  }

  return <button className={secondaryButtonClass} onClick={submit} type="button">{status === "completed" ? "Reopen" : "Complete"}</button>;
}

export function HighlightFeedbackButtons({ highlightId }: { highlightId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"pin" | "clinician_confirmation" | "rejection" | null>(null);
  const [completed, setCompleted] = useState<"pin" | "clinician_confirmation" | "rejection" | null>(null);

  async function submit(feedbackType: "pin" | "clinician_confirmation" | "rejection") {
    setPending(feedbackType);
    setMessage("");
    const response = await fetch(`/api/highlights/${highlightId}/feedback`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ feedbackType })
    });
    setPending(null);
    if (!response.ok) {
      setMessage(`Feedback failed (${response.status}).`);
      return;
    }
    setCompleted(feedbackType);
    if (feedbackType === "clinician_confirmation") {
      setMessage("Suggestion confirmed. Any unresolved conflict still requires clinician review.");
    } else if (feedbackType === "rejection") {
      setMessage("Suggestion rejected. Source history and audit are retained.");
    } else {
      setMessage("Pinned for this care team.");
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {completed === "clinician_confirmation" ? <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-900">Suggestion confirmed</span> : null}
      {completed === "rejection" ? <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-800">Suggestion rejected</span> : null}
      {completed !== "rejection" ? (
        <>
          <button className={secondaryButtonClass} disabled={Boolean(pending)} onClick={() => submit("pin")} type="button">{pending === "pin" ? "Pinning..." : "Pin"}</button>
          <button className={tealOutlineButtonClass} disabled={Boolean(pending) || completed === "clinician_confirmation"} onClick={() => submit("clinician_confirmation")} type="button">
            {pending === "clinician_confirmation" ? "Confirming..." : completed === "clinician_confirmation" ? "Confirmed" : "Confirm suggestion"}
          </button>
          <button className={dangerButtonClass} disabled={Boolean(pending)} onClick={() => submit("rejection")} type="button">{pending === "rejection" ? "Rejecting..." : "Reject suggestion"}</button>
        </>
      ) : null}
      {message ? <span className="basis-full text-xs text-stone-600">{message}</span> : null}
    </span>
  );
}

function statusSuccessMessage(nextStatus: "approved" | "rejected", previousStatus: string) {
  if (previousStatus === "rejected" && nextStatus === "approved") return "Rejection reversed. Content is now approved.";
  if (previousStatus === "approved" && nextStatus === "rejected") return "Approved content rejected. Patients can no longer see it.";
  return nextStatus === "approved" ? "Approved for patient view." : "Rejected; patients cannot see it.";
}

export function PatientContentStatusButtons({
  contentId,
  status,
  title,
  body
}: {
  contentId: string;
  status: string;
  title: string;
  body: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const [editPending, setEditPending] = useState(false);

  async function submit(nextStatus: "approved" | "rejected") {
    setPending(nextStatus);
    setMessage("");
    const response = await fetch(`/api/patient-content/${contentId}/status`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ status: nextStatus })
    });
    setPending(null);
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? statusSuccessMessage(nextStatus, status) : (payload?.error ?? `Status change failed (${response.status}).`));
    if (response.ok) router.refresh();
  }

  async function saveRevision() {
    setEditPending(true);
    setMessage("");
    const response = await fetch(`/api/patient-content/${contentId}`, {
      method: "PATCH",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ title: draftTitle, body: draftBody })
    });
    const payload = await response.json().catch(() => ({}));
    setEditPending(false);
    if (!response.ok) {
      setMessage(payload?.error ?? `Revision failed (${response.status}).`);
      return;
    }
    setEditing(false);
    setMessage("Revised content now needs clinician approval.");
    router.refresh();
  }

  const canApprove = status !== "approved";
  const canReject = status !== "rejected";

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {canApprove ? (
          <button className={tealOutlineButtonClass} disabled={Boolean(pending) || editPending} onClick={() => submit("approved")} type="button">{pending === "approved" ? "Approving..." : status === "rejected" ? "Approve after review" : "Approve"}</button>
        ) : null}
        {canReject ? (
          <button className={dangerButtonClass} disabled={Boolean(pending) || editPending} onClick={() => submit("rejected")} type="button">{pending === "rejected" ? "Rejecting..." : "Reject"}</button>
        ) : null}
        <button className={secondaryButtonClass} disabled={Boolean(pending) || editPending} onClick={() => setEditing((value) => !value)} type="button">{editing ? "Cancel edit" : "Edit / Revise"}</button>
      </div>
      {editing ? (
        <div className="rounded border border-stone-200 bg-stone-50 p-2">
          <label className="block text-xs font-medium text-stone-700" htmlFor={`patient-content-title-${contentId}`}>Title</label>
          <input
            className="mt-1 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            id={`patient-content-title-${contentId}`}
            onChange={(event) => setDraftTitle(event.target.value)}
            value={draftTitle}
          />
          <label className="mt-2 block text-xs font-medium text-stone-700" htmlFor={`patient-content-body-${contentId}`}>Content</label>
          <textarea
            className="mt-1 min-h-24 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
            id={`patient-content-body-${contentId}`}
            onChange={(event) => setDraftBody(event.target.value)}
            value={draftBody}
          />
          <button className={`${primaryButtonClass} mt-2`} disabled={editPending || !draftTitle.trim() || !draftBody.trim()} onClick={saveRevision} type="button">
            {editPending ? "Saving..." : "Save revision"}
          </button>
          <p className="mt-1 text-xs text-stone-600">Saving a revision always requires a fresh clinician decision.</p>
        </div>
      ) : null}
      {message ? <span className="text-xs text-stone-600">{message}</span> : null}
    </div>
  );
}

export function RevertButton({
  entryId,
  expectedVersion,
  version
}: {
  entryId: string;
  expectedVersion: number;
  version: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit() {
    const response = await fetch(`/api/entries/${entryId}/revert`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ expectedVersion, revertToVersion: version })
    });
    const payload = await response.json();
    setMessage(response.ok ? `Reverted into version ${payload.version}.` : `Revert failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  return (
    <span>
      <button className={secondaryButtonClass} onClick={submit} type="button">
        Revert to this
      </button>
      {message ? <span className="ml-2 text-xs text-stone-600">{message}</span> : null}
    </span>
  );
}
