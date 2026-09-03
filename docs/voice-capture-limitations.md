# Ambient Consult Audio Limitations

Phase A Ambient Consult supports post-consult synthetic audio capture and upload. It is designed to demonstrate the trust pipeline from recorded consultation audio into AI-scribed internal notes, needs-review clinical facts, conflicts, Glance items, and provenance.

The implemented path is:

synthetic audio -> Gemini transcription -> speaker-labelled timestamped transcript -> transcript persistence -> PHI redaction -> downstream AI Scribe summary -> deterministic extraction/conflicts/Glance -> human review

When `GEMINI_API_KEY` is configured, transcription uses the repository's Gemini transcription provider. The default model is `gemini-3.5-transcribe`, configured by `GEMINI_TRANSCRIBE_MODEL`, and the provider uses Gemini file upload plus the interactions API. Deterministic transcription remains only for automated tests and explicit offline fixture paths.

Privacy boundary:

- Raw audio reaches the ASR provider before transcript text exists.
- The original transcript is persisted as source evidence.
- Transcript text then goes through the centralized PHI redaction gateway before downstream generative LLM summarization.
- The repository does not claim raw-audio PHI redaction before cloud ASR.

Current trust behavior:

- Voice-derived AI Scribe entries are internal and unverified.
- Voice-derived facts use `authority_role = system` and remain `needs_review`.
- Medication and dosage evidence is not clinician-confirmed automatically.
- Speaker labels from the provider and semantic speaker-role mapping are stored separately.
- Provenance can resolve to direct transcript segments with speaker labels and timestamps.
- Entry-level AI Scribe Review Source shows the full immutable transcript session; fact and Glance source links prefer exact transcript segments.

Validated prototype evidence:

- A real synthetic English two-speaker WAV was transcribed through Gemini, persisted, summarized, extracted into facts/conflicts/Glance, and linked through direct transcript-segment provenance.
- A real synthetic multilingual/code-switched WAV was also tested. English clinical content remained usable, Malay degraded, and Hokkien-style phrases were unreliable. This is classified as partial multilingual support, not production multilingual robustness.
- A question-form symptom false positive was fixed with a line-local question guard.
- Dosage extraction recognizes `mg`, `milligram`, and `milligrams`, normalizing them to `mg`.

Prototype limitations:

- no realtime streaming, partial transcript, or live allergy alerting
- no production audio retention or third-party ASR privacy audit
- no noisy-room, overlapping-speech, or multi-device validation
- no claim of robust Hokkien or broad multilingual clinical NLP
- no translation-first persistence; original transcript evidence is preserved
- confidence/uncertainty markers are evidence-quality metadata, not calibrated clinical probabilities

Only synthetic audio/transcript material should be used with this repository.
