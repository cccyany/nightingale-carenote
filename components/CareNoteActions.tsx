"use client";

import { useState } from "react";

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

function authHeaders(role: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer demo-${role}`
  };
}

export function NoteComposer({ patientId }: { patientId: string }) {
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
      window.location.reload();
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
      <button className="mt-3 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!content.trim()} onClick={submit} type="button">Save note</button>
      {message ? <p className="mt-2 text-sm text-stone-700">{message}</p> : null}
    </details>
  );
}

export function EntryEditor({ entry }: { entry: Entry }) {
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
    if (response.ok) window.location.reload();
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
      <button className="mt-2 rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!content.trim()} onClick={submit} type="button">
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
    if (response.ok) window.location.reload();
  }

  return (
    <details className="mt-3 rounded-md border border-stone-200 bg-white/70 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Comment</summary>
      <select className="mt-2 w-full rounded border border-stone-300 p-2 text-sm" onChange={(event) => setMention(event.target.value)} value={mention}>
        <option value="">No mention</option>
        {users.map((user) => <option key={user.profile_id} value={user.profile_id}>@{user.profiles?.display_name ?? user.profile_id} ({user.role})</option>)}
      </select>
      <textarea className="mt-2 min-h-16 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setBody(event.target.value)} placeholder="Internal collaboration comment" value={body} />
      <button className="mt-2 rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!body.trim()} onClick={submit} type="button">Post comment</button>
      {message ? <p className="mt-2 text-sm text-stone-700">{message}</p> : null}
    </details>
  );
}

export function ReplyComposer({ entryId, parentCommentId }: { entryId: string; parentCommentId: string }) {
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    const response = await fetch(`/api/entries/${entryId}/comments`, {
      method: "POST",
      headers: authHeaders("staff"),
      body: JSON.stringify({ body, parentCommentId, mentions: [] })
    });
    setMessage(response.ok ? "Reply saved." : `Reply failed (${response.status}).`);
    if (response.ok) window.location.reload();
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-medium text-teal-800">Reply</summary>
      <textarea className="mt-2 min-h-14 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setBody(event.target.value)} placeholder="Reply to this thread" value={body} />
      <button className="mt-2 rounded bg-stone-800 px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!body.trim()} onClick={submit} type="button">Post reply</button>
      {message ? <span className="ml-2 text-xs text-stone-600">{message}</span> : null}
    </details>
  );
}

export function CommentResolveButton({ commentId, resolved }: { commentId: string; resolved: boolean }) {
  async function submit() {
    await fetch(`/api/comments/${commentId}/resolve`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ resolved: !resolved })
    });
    window.location.reload();
  }

  return <button className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" onClick={submit} type="button">{resolved ? "Unresolve" : "Resolve"}</button>;
}

export function TaskComposer({ patientId, entryId, users }: { patientId: string; entryId?: string; users: AssignableUser[] }) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState(users[0]?.profile_id ?? "");
  const [dueDate, setDueDate] = useState("");

  async function submit() {
    await fetch(`/api/patients/${patientId}/tasks`, {
      method: "POST",
      headers: authHeaders("staff"),
      body: JSON.stringify({ title, assigneeId: assignee, sourceEntryId: entryId ?? null, dueDate: dueDate || null })
    });
    window.location.reload();
  }

  return (
    <details className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer text-base font-semibold">+ Assign follow-up</summary>
      <input className="mt-3 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setTitle(event.target.value)} placeholder="Task title" value={title} />
      <select className="mt-2 w-full rounded border border-stone-300 p-2" onChange={(event) => setAssignee(event.target.value)} value={assignee}>
        {users.map((user) => <option key={user.profile_id} value={user.profile_id}>{user.profiles?.display_name ?? user.profile_id} ({user.role})</option>)}
      </select>
      <input className="mt-2 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
      <button className="mt-3 rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50" disabled={!title.trim() || !assignee} onClick={submit} type="button">Create task</button>
    </details>
  );
}

export function TaskStatusButton({ taskId, status }: { taskId: string; status: string }) {
  async function submit() {
    await fetch(`/api/tasks/${taskId}/status`, {
      method: "POST",
      headers: authHeaders("staff"),
      body: JSON.stringify({ status: status === "completed" ? "open" : "completed" })
    });
    window.location.reload();
  }

  return <button className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" onClick={submit} type="button">{status === "completed" ? "Reopen" : "Complete"}</button>;
}

export function HighlightFeedbackButtons({ highlightId }: { highlightId: string }) {
  const [message, setMessage] = useState("");

  async function submit(feedbackType: "pin" | "clinician_confirmation" | "rejection") {
    const response = await fetch(`/api/highlights/${highlightId}/feedback`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ feedbackType })
    });
    setMessage(response.ok ? "Feedback recorded." : `Feedback failed (${response.status}).`);
    if (response.ok) window.location.reload();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" onClick={() => submit("pin")} type="button">Pin</button>
      <button className="rounded border border-teal-600 px-2 py-1 text-xs text-teal-900 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600" onClick={() => submit("clinician_confirmation")} type="button">Confirm suggestion</button>
      <button className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-teal-600" onClick={() => submit("rejection")} type="button">Reject suggestion</button>
      {message ? <span className="text-xs text-stone-600">{message}</span> : null}
    </span>
  );
}

export function PatientContentStatusButtons({ contentId, status }: { contentId: string; status: string }) {
  const [message, setMessage] = useState("");

  async function submit(nextStatus: "approved" | "rejected") {
    const response = await fetch(`/api/patient-content/${contentId}/status`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ status: nextStatus })
    });
    setMessage(response.ok ? `Marked ${nextStatus}.` : `Status change failed (${response.status}).`);
    if (response.ok) window.location.reload();
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <button className="rounded border border-teal-700 px-2 py-1 text-xs" disabled={status === "approved"} onClick={() => submit("approved")} type="button">Approve</button>
      <button className="rounded border border-stone-300 px-2 py-1 text-xs" disabled={status === "rejected"} onClick={() => submit("rejected")} type="button">Reject</button>
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
  const [message, setMessage] = useState("");

  async function submit() {
    const response = await fetch(`/api/entries/${entryId}/revert`, {
      method: "POST",
      headers: authHeaders("clinician"),
      body: JSON.stringify({ expectedVersion, revertToVersion: version })
    });
    const payload = await response.json();
    setMessage(response.ok ? `Reverted into version ${payload.version}.` : `Revert failed (${response.status}).`);
    if (response.ok) window.location.reload();
  }

  return (
    <span>
      <button className="rounded border border-stone-300 px-2 py-1 text-xs" onClick={submit} type="button">
        Revert to this
      </button>
      {message ? <span className="ml-2 text-xs text-stone-600">{message}</span> : null}
    </span>
  );
}
