"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { canSavePatientFacingDraft, patientSummarySourcePreview } from "@/lib/ai/patient-summary";

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
const sidebarSummaryClass = "cursor-pointer px-4 py-3 text-base font-semibold text-stone-900 hover:bg-stone-50";

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

function authOnlyHeaders(role: string) {
  return {
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
    <details className="rounded-md border border-stone-200 bg-white shadow-sm">
      <summary className={sidebarSummaryClass}>+ Add care-team note</summary>
      <div className="border-t border-stone-100 p-4">
      <p className="text-sm text-stone-600">Demo author choice; server authorization and RLS enforce writes.</p>
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
      </div>
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
    <details className="rounded-md border border-amber-200 bg-white shadow-sm">
      <summary className={sidebarSummaryClass}>+ AI Scribe</summary>
      <div className="space-y-3 border-t border-stone-100 p-4">
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

type AmbientSegment = {
  id?: string;
  speaker: string;
  raw_speaker_label?: string;
  display_speaker?: string;
  semantic_speaker_role?: string;
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number;
  uncertain: boolean;
};

function durationLabel(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function ambientRoleToken(actorRole?: string) {
  if (actorRole === "admin") return "admin";
  if (actorRole === "staff") return "staff";
  return "clinician";
}

export function AmbientConsultComposer({ patientId, actorRole }: { patientId: string; actorRole?: string }) {
  const router = useRouter();
  const [mediaSupported, setMediaSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [readyBlob, setReadyBlob] = useState<Blob | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [entryType, setEntryType] = useState(actorRole === "staff" ? "ai_nurse_consult_summary" : "ai_doctor_consult_summary");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [segments, setSegments] = useState<AmbientSegment[]>([]);
  const [mappingMessage, setMappingMessage] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setMediaSupported(typeof window !== "undefined" && "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (!["clinician", "staff", "admin"].includes(actorRole ?? "")) return null;

  async function startRecording() {
    setError("");
    setMessage("");
    setSegments([]);
    setSessionId("");
    if (!mediaSupported) {
      setError("Audio recording is not supported in this browser. Upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setReadyBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 500);
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was not granted. You can upload an audio file instead.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
  }

  function cancelRecording() {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
    setReadyBlob(null);
    setElapsedMs(0);
    setMessage("Recording discarded.");
  }

  async function processAudio(source: Blob | File) {
    setPending(true);
    setError("");
    setMessage("Transcribing consultation...");
    setSegments([]);
    setSessionId("");
    const formData = new FormData();
    formData.append("audio", source, source instanceof File ? source.name : "ambient-consult.webm");
    formData.append("entryType", entryType);
    formData.append("sourceLabel", "Ambient consult audio");
    const response = await fetch(`/api/patients/${patientId}/voice-captures`, {
      method: "POST",
      headers: authOnlyHeaders(ambientRoleToken(actorRole)),
      body: formData
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setSessionId(payload?.transcriptSessionId ?? "");
      setSegments(Array.isArray(payload?.segments) ? payload.segments : []);
      setError(payload?.message ?? "Ambient consult could not be processed safely.");
      setMessage(payload?.status === "summary_failed" ? "Transcript saved; no AI note was created." : "");
      return;
    }
    setReadyBlob(null);
    setUploadFile(null);
    setSessionId(payload.transcriptSessionId ?? "");
    setSegments(Array.isArray(payload.segments) ? payload.segments : []);
    setMessage(`Transcription complete - ${payload.uncertainSegments ?? 0} uncertain ${payload.uncertainSegments === 1 ? "segment" : "segments"}. AI Scribe created and remains unverified.`);
    router.refresh();
  }

  async function saveSpeakerMapping() {
    if (!sessionId || !segments.some((segment) => segment.id)) return;
    setMappingMessage("");
    const response = await fetch(`/api/patients/${patientId}/voice-captures`, {
      method: "PUT",
      headers: authHeaders(ambientRoleToken(actorRole)),
      body: JSON.stringify({
        sessionId,
        mappings: segments
          .filter((segment) => segment.id)
          .map((segment) => ({
            segment_id: segment.id,
            semantic_speaker_role: segment.semantic_speaker_role ?? segment.speaker ?? "unknown"
          }))
      })
    });
    setMappingMessage(response.ok ? "Speaker mapping saved." : `Speaker mapping failed (${response.status}).`);
    if (response.ok) router.refresh();
  }

  return (
    <details className="rounded-md border border-teal-200 bg-white shadow-sm">
      <summary className={sidebarSummaryClass}>Ambient consult</summary>
      <div className="border-t border-stone-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-teal-800">Post-consult processing - AI output requires review</p>
          <p className="mt-1 text-xs text-stone-600">Capture a clinician-patient or staff-patient consultation. Use synthetic audio only.</p>
        </div>
        <select className="rounded border border-stone-300 p-1.5 text-xs" onChange={(event) => setEntryType(event.target.value)} value={entryType}>
          <option value="ai_doctor_consult_summary">Doctor consult</option>
          <option value="ai_nurse_consult_summary">Nurse consult</option>
          <option value="ai_patient_session_summary">AI-patient session</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!recording ? <button className={primaryButtonClass} disabled={pending} onClick={startRecording} type="button">Record consultation</button> : null}
        {recording ? (
          <>
            <span className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800">Recording {durationLabel(elapsedMs)}</span>
            <button className={primaryButtonClass} onClick={stopRecording} type="button">Stop</button>
            <button className={secondaryButtonClass} onClick={cancelRecording} type="button">Cancel</button>
          </>
        ) : null}
        <label className={`${secondaryButtonClass} cursor-pointer`}>
          Upload audio
          <input
            accept="audio/wav,audio/x-wav,audio/mpeg,audio/mp3,audio/mp4,audio/m4a,audio/webm"
            className="sr-only"
            disabled={pending || recording}
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>
      </div>

      {readyBlob ? (
        <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
          <p>Consult recording - {durationLabel(elapsedMs)}</p>
          <div className="mt-2 flex gap-2">
            <button className={primaryButtonClass} disabled={pending} onClick={() => processAudio(readyBlob)} type="button">{pending ? "Processing..." : "Process recording"}</button>
            <button className={secondaryButtonClass} disabled={pending} onClick={() => setReadyBlob(null)} type="button">Discard</button>
          </div>
        </div>
      ) : null}

      {uploadFile ? (
        <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3 text-sm">
          <p>{uploadFile.name} ready for post-consult transcription.</p>
          <button className={`${primaryButtonClass} mt-2`} disabled={pending} onClick={() => processAudio(uploadFile)} type="button">{pending ? "Processing..." : "Process upload"}</button>
        </div>
      ) : null}

      {message ? <p className="mt-3 rounded border border-teal-100 bg-teal-50 p-2 text-sm text-teal-950">{message}</p> : null}
      {error ? <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-950">{error}</p> : null}

      {segments.length ? (
        <div className="mt-3 rounded border border-stone-200 bg-stone-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-stone-900">Consult transcript</h3>
            {sessionId ? <button className={tealOutlineButtonClass} onClick={saveSpeakerMapping} type="button">Confirm speaker mapping</button> : null}
          </div>
          <div className="mt-2 space-y-2">
            {segments.map((segment, index) => (
              <div className="rounded border border-stone-200 bg-white p-2 text-xs" key={segment.id ?? `${segment.start_ms}-${index}`}>
                <div className="flex flex-wrap items-center gap-2 text-stone-600">
                  <span>{durationLabel(segment.start_ms)}-{durationLabel(segment.end_ms)}</span>
                  <span>{segment.display_speaker ?? segment.raw_speaker_label ?? segment.speaker}</span>
                  {segment.uncertain ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-950">Needs review</span> : null}
                  {segment.id ? (
                    <select
                      className="ml-auto rounded border border-stone-300 p-1"
                      onChange={(event) => setSegments((current) => current.map((item) => item.id === segment.id ? { ...item, semantic_speaker_role: event.target.value } : item))}
                      value={segment.semantic_speaker_role ?? segment.speaker ?? "unknown"}
                    >
                      <option value="clinician">Clinician</option>
                      <option value="staff">Staff</option>
                      <option value="patient">Patient</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-stone-800">{segment.text}</p>
              </div>
            ))}
          </div>
          {mappingMessage ? <p className="mt-2 text-xs text-stone-600">{mappingMessage}</p> : null}
        </div>
      ) : null}
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
  const canSave = canSavePatientFacingDraft({ title, body, sourceEntryIds: selectedIds, contentType });
  const missingFields = [
    !selectedIds.length ? "select at least one source" : "",
    !title.trim() ? "enter a title" : "",
    !body.trim() ? "enter patient-facing body text" : ""
  ].filter(Boolean);

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
      setError(payload?.error ?? (payload?.code ? aiFailureMessage(payload.code) : "AI draft could not be generated from the selected sources. You can adjust the sources, retry, or create the content manually."));
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
    setMessage("");
    setError("");
    if (!canSave) {
      setError(`Before saving, ${missingFields.join(", ")}.`);
      return;
    }
    setPending("save");
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
                        <span className="mt-1 block text-stone-700">{patientSummarySourcePreview(entry)}</span>
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
          {!canSave && missingFields.length ? <p className="text-xs text-stone-600">Before saving, {missingFields.join(", ")}.</p> : null}
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
    <details className="rounded-md border border-stone-200 bg-white shadow-sm">
      <summary className={sidebarSummaryClass}>+ Assign follow-up</summary>
      <div className="border-t border-stone-100 p-4">
      <input className="w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setTitle(event.target.value)} placeholder="Task title" value={title} />
      <select className="mt-2 w-full rounded border border-stone-300 p-2" onChange={(event) => setAssignee(event.target.value)} value={assignee}>
        {users.map((user) => <option key={user.profile_id} value={user.profile_id}>{user.profiles?.display_name ?? user.profile_id} ({user.role})</option>)}
      </select>
      <input className="mt-2 w-full rounded border border-stone-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
      <button className={`${primaryButtonClass} mt-3 px-4 py-2`} disabled={!title.trim() || !assignee} onClick={submit} type="button">Create task</button>
      </div>
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

export function HighlightFeedbackButtons({
  highlightId,
  confirmationStatus,
  isConflict = false
}: {
  highlightId: string;
  confirmationStatus?: string;
  isConflict?: boolean;
}) {
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
      {isConflict ? <a className={tealOutlineButtonClass} href="#conflict-review">Resolve conflict</a> : null}
      {completed === "rejection" ? <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-800">Suggestion rejected</span> : null}
      {completed !== "rejection" ? (
        <>
          <button className={secondaryButtonClass} disabled={Boolean(pending)} onClick={() => submit("pin")} type="button">{pending === "pin" ? "Pinning..." : "Pin"}</button>
          {!isConflict && confirmationStatus !== "confirmed" && completed !== "clinician_confirmation" ? (
            <button className={tealOutlineButtonClass} disabled={Boolean(pending)} onClick={() => submit("clinician_confirmation")} type="button">
              {pending === "clinician_confirmation" ? "Confirming..." : "Confirm suggestion"}
            </button>
          ) : null}
          {!isConflict && (confirmationStatus === "confirmed" || completed === "clinician_confirmation") ? (
            <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-900">Suggestion confirmed</span>
          ) : null}
          <button className={dangerButtonClass} disabled={Boolean(pending)} onClick={() => submit("rejection")} type="button">{pending === "rejection" ? "Rejecting..." : "Reject suggestion"}</button>
        </>
      ) : null}
      {message ? <span className="basis-full text-xs text-stone-600">{message}</span> : null}
    </span>
  );
}

export function ConflictResolutionForm({
  conflictId,
  status,
  conflictType,
  actorRole
}: {
  conflictId: string;
  status: string;
  conflictType: string;
  actorRole?: string;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState("accept_fact_a");
  const [rationale, setRationale] = useState("");
  const [entityType, setEntityType] = useState("medication");
  const [normalizedEntity, setNormalizedEntity] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [assertion, setAssertion] = useState("present");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const canResolve = actorRole === "clinician" || actorRole === "admin";
  const reviewRole = actorRole === "admin" ? "admin" : "clinician";
  const active = status === "unresolved" || status === "needs_further_review";
  const rationaleRequired = outcome !== "unable_to_determine";
  const correctionRequired = outcome === "corrected_value";
  const canSubmit = active
    && (!rationaleRequired || Boolean(rationale.trim()))
    && (!correctionRequired || Boolean(normalizedEntity.trim()));

  async function submit() {
    setPending(true);
    setMessage("");
    const response = await fetch(`/api/conflicts/${conflictId}/resolve`, {
      method: "POST",
      headers: authHeaders(reviewRole),
      body: JSON.stringify({
        outcome,
        rationale,
        expectedStatus: status,
        corrected: correctionRequired ? {
          entityType,
          normalizedEntity,
          value: value.trim() || null,
          unit: unit.trim() || null,
          assertion
        } : undefined
      })
    });
    const payload = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setMessage(payload?.message ?? payload?.error ?? `Resolution failed (${response.status}).`);
      return;
    }
    setMessage(outcome === "unable_to_determine" ? "Conflict remains under review." : "Conflict resolution recorded in the timeline.");
    router.refresh();
  }

  if (!active) {
    return <p className="mt-2 text-xs text-stone-600">Resolved conflicts remain available here for history; the old conflict no longer occupies active Glance.</p>;
  }
  if (!canResolve) {
    return <p className="mt-2 text-xs text-stone-600">Staff can review evidence. Conflict resolution requires clinician or admin review.</p>;
  }

  return (
    <details className="mt-3 rounded border border-red-100 bg-white/70 p-2 text-xs text-stone-700">
      <summary className="cursor-pointer font-semibold text-stone-800">Resolve conflict</summary>
      <div className="mt-2 space-y-2">
        <label className="block font-medium">
          Decision
          <select className="mt-1 w-full rounded border border-stone-300 p-2" onChange={(event) => setOutcome(event.target.value)} value={outcome}>
            <option value="accept_fact_a">Earlier evidence is current/correct</option>
            <option value="accept_fact_b">Later evidence is current/correct</option>
            <option value="corrected_value">Neither is correct - enter corrected information</option>
            <option value="unable_to_determine">Unable to determine - keep under review</option>
          </select>
        </label>
        {correctionRequired ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="font-medium">
              Fact type
              <select className="mt-1 w-full rounded border border-stone-300 p-2" onChange={(event) => setEntityType(event.target.value)} value={entityType}>
                <option value="allergy">Allergy</option>
                <option value="medication">Medication</option>
                <option value="dosage">Medication dose</option>
                <option value="frequency">Medication frequency</option>
              </select>
            </label>
            <label className="font-medium">
              Entity
              <input className="mt-1 w-full rounded border border-stone-300 p-2" onChange={(event) => setNormalizedEntity(event.target.value)} placeholder="metformin" value={normalizedEntity} />
            </label>
            <label className="font-medium">
              Value
              <input className="mt-1 w-full rounded border border-stone-300 p-2" onChange={(event) => setValue(event.target.value)} placeholder="500" value={value} />
            </label>
            <label className="font-medium">
              Unit
              <input className="mt-1 w-full rounded border border-stone-300 p-2" onChange={(event) => setUnit(event.target.value)} placeholder="mg" value={unit} />
            </label>
            <label className="font-medium">
              Assertion
              <select className="mt-1 w-full rounded border border-stone-300 p-2" onChange={(event) => setAssertion(event.target.value)} value={assertion}>
                <option value="present">Present/current</option>
                <option value="absent">Absent/not current</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>
        ) : null}
        <label className="block font-medium">
          Clinician rationale
          <textarea className="mt-1 min-h-20 w-full rounded border border-stone-300 p-2" onChange={(event) => setRationale(event.target.value)} placeholder={`Document the clinical reason for this ${displayToken(conflictType).toLowerCase()} decision.`} value={rationale} />
        </label>
        <button className={primaryButtonClass} disabled={pending || !canSubmit} onClick={submit} type="button">
          {pending ? "Recording..." : outcome === "unable_to_determine" ? "Keep under review" : "Record resolution"}
        </button>
        {message ? <p className="text-xs text-stone-600">{message}</p> : null}
      </div>
    </details>
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
  body,
  actorRole
}: {
  contentId: string;
  status: string;
  title: string;
  body: string;
  actorRole?: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftBody, setDraftBody] = useState(body);
  const [editPending, setEditPending] = useState(false);
  const canReview = actorRole === "clinician" || actorRole === "admin";
  const reviewRole = actorRole === "admin" ? "admin" : "clinician";

  async function submit(nextStatus: "approved" | "rejected") {
    setPending(nextStatus);
    setMessage("");
    const response = await fetch(`/api/patient-content/${contentId}/status`, {
      method: "POST",
      headers: authHeaders(reviewRole),
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
      headers: authHeaders(reviewRole),
      body: JSON.stringify({ title: draftTitle, body: draftBody })
    });
    const payload = await response.json().catch(() => ({}));
    setEditPending(false);
    if (!response.ok) {
      setMessage(payload?.error ?? `Revision failed (${response.status}).`);
      return;
    }
    setEditing(false);
    setMessage("Revised content now needs approval.");
    router.refresh();
  }

  const canApprove = status !== "approved";
  const canReject = status !== "rejected";

  if (!canReview) {
    return <p className="mt-2 text-xs text-stone-600">Staff can review sources; publication changes require clinician or admin review.</p>;
  }

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
          <p className="mt-1 text-xs text-stone-600">Saving a revision always requires a fresh reviewer decision.</p>
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
