# Data Decay and Warm Glance Read Model

This prototype classifies persisted Glance items as `HOT`, `WARM`, or `COLD`.

`HOT` means recent, unresolved, safety-critical, active, or immediately actionable. Allergy conflicts, medication conflicts, medication-dose conflicts, unresolved critical tasks, and high/critical unresolved items are protected from ordinary age decay.

`WARM` means older but still longitudinally relevant information. It can remain searchable and explainable, but its recency contribution is lower.

`COLD` means old ordinary resolved context retained primarily for history and provenance.

Decay changes ranking/read priority only. It never deletes or mutates source timeline entries, entry versions, provenance spans, clinical facts, fact conflicts, audit events, comments, or tasks.

The warm consult read path uses persisted `glance_items`, ordered by precomputed `importance_score`, `created_at`, and `id` for deterministic tie-breaking. It does not call an LLM and does not run extraction. Write/ingestion paths create facts, provenance, feedback, and reranked Glance rows ahead of the consult read.

Prototype hazards for adaptive importance:

- exposure bias: exposure is tracked separately and is not treated as rejection
- care-team fatigue: explicit rejection is bounded and cannot hide safety-critical classes
- sparse feedback: boosts are capped and intentionally small
- feedback confounding: learning affects importance only, never evidence, risk, provenance, or facts
- safety floors: deterministic clinical risk floors remain independent from ranking

Physical archival/compression is deferred. The current implementation provides deterministic classification, ranking behavior, indexes, and documentation while preserving the full source-of-truth history.
