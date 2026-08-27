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

function authHeaders(role: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer demo-${role}`
  };
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
        setError(`${status}. ${payload?.providerError ?? payload?.error ?? "The AI summary was not persisted."}`);
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
      setMessage("Version conflict.");
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

export function PatientContentStatusButtons({ contentId, status }: { contentId: string; status: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);

  async function submit(nextStatus: "approved" | "rejected") {
    setPending(nextStatus);
    setMessage("");
    const response = await fetch(`/api/patient-content/${contentId}/status`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ status: nextStatus })
    });
    setPending(null);
    setMessage(response.ok ? `Marked ${nextStatus}.` : `Status change failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button className={tealOutlineButtonClass} disabled={status === "approved" || Boolean(pending)} onClick={() => submit("approved")} type="button">{pending === "approved" ? "Approving..." : "Approve"}</button>
      <button className={dangerButtonClass} disabled={status === "rejected" || Boolean(pending)} onClick={() => submit("rejected")} type="button">{pending === "rejected" ? "Rejecting..." : "Reject"}</button>
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
