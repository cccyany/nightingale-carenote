# Nightingale CareNote Demo Script

Target length: 6 to 8 minutes.

## Preflight Checklist

- Supabase is reachable and `.env.local` contains current demo credentials.
- Run `npm.cmd run supabase:apply` to clean and reseed the synthetic demo state.
- Run `npm.cmd run supabase:verify`.
- Start the app with `npm.cmd run dev`.
- Open `/login`.
- Confirm Jane Tan in Clinic A is the primary patient.
- Confirm no secrets or real PHI are visible.
- Confirm Care Glance source navigation works.
- Confirm revision/revert works.
- Confirm patient approval workflow works.
- Keep backup screenshots or a short backup recording in case network latency is unstable.

## Scenario A: Glance, AI Scribe, and Provenance

1. Enter through the Clinic A staff or clinician demo role.
2. Open Jane Tan.
3. Pause on Care Glance. It should be readable in under 10 seconds with the allergy conflict, renal-panel action, and persistent cough.
4. Explain: risk is severity; importance is what the team should see first right now.
5. Open the allergy conflict.
6. Click View Source and show the page jumping to the exact source entry/evidence span.
7. Call out that the source-of-truth remains the longitudinal timeline.
8. Point to evidence wording: strong/supporting evidence plus conflicting sources means it still needs clinician review.

## Scenario B: Collaboration and Audit

1. As staff, add a staff note.
2. Add a comment mentioning the clinician.
3. Assign a follow-up task.
4. Switch to the clinician demo role.
5. Confirm or highlight an AI-derived phrase where the flow is available.
6. Edit the clinician plan.
7. Open revision history.
8. Show the version labels, actor, timestamp, basic diff summary, and revert action.
9. Mention that stale same-entry edits return HTTP 409 rather than last-write-wins.

## Scenario C: Longitudinal Context and Learning

1. Show the April 15 2025 clinician penicillin allergy note.
2. Show the February 6 2026 AI nurse "no known drug allergies" summary.
3. Show the August 2026 cough and renal-panel context.
4. Explain why the conflict remains HIGH risk even if ranking adapts.
5. Open "Why prioritized" on a Glance item.
6. Point out clinician-facing reasons: unresolved action, recency, confirmation, entity priority, decay, and adaptive influence.
7. Explain HOT/WARM/COLD: it affects ranking/read priority and never deletes source history.

## Security Moment

1. Switch to Jane's patient-safe view.
2. Show that raw AI-scribed notes, internal comments, and internal staff/clinician notes are absent.
3. If demonstrating API behavior, call or cite the RBAC/RLS tests showing direct unauthorized requests are rejected.
4. State clearly: the UI is not the security boundary.

## Privacy Moment

1. Use a synthetic input containing a synthetic name, NRIC/FIN-like ID, and Singapore phone number.
2. Show the redacted LLM-bound payload with placeholders.
3. Explain that all provider calls go through raw input -> redaction -> verification -> provider.
4. Mention that redaction metadata reports classes/counts without storing original PHI.

## Patient-Facing Safety

1. Show an AI-generated patient-facing draft or needs-approval item in clinician review.
2. Confirm it is hidden from `/patient/me`.
3. Approve it as clinician.
4. Return to `/patient/me` and show it is now visible.
5. Explain that unresolved provenance or low trust blocks approval.

## Bonus Voice

Only include if the flow is smooth and time remains.

1. Label the capture as synthetic/demo.
2. Show speaker-labelled transcript segments and timestamps.
3. Explain transcription -> transcript -> redaction -> AI extraction/summarization.
4. Show provenance back to a transcript timestamp.
5. State the limitations: noisy rooms, overlapping speech, diarization, code-switching, and multilingual medical terminology are not production-validated.

## Performance Close

Mention, do not benchmark live unless useful:

- warm-up requests: 10
- measured requests: 50
- concurrency: 1
- network included
- P50: 153.55 ms
- P95: 253.12 ms
- P99: 436.82 ms
- target: P95 <= 300 ms

End with: AI proposes. Humans verify. Provenance proves.
