# Synthetic Ambient Voice Capture Limitations

M30 implements a synthetic transcript capture path with a deterministic mock transcriber. It is designed to demonstrate architecture, privacy sequencing, role boundaries, AI-scribed entry creation, and timestamp provenance.

The privacy sequence is:

synthetic transcript submission -> deterministic transcription abstraction -> raw transcript -> PHI redaction -> LLM summarization/extraction

The raw transcript is never sent to the LLM provider before redaction. If redaction verification fails, the flow returns `needs_review`.

Prototype limitations:

- no production audio enhancement
- no validated diarization accuracy
- overlapping speech is not handled
- noisy-room transcription quality is not measured
- code-switching and multilingual medical terminology are represented architecturally, not solved
- confidence/uncertainty markers are deterministic demo metadata, not calibrated probabilities

Only synthetic audio/transcript material is supported in this repository.
