export type ConflictEvidenceSide = "fact_a" | "fact_b";

export type ConflictEvidence<TFact, TEntry extends { occurred_at?: string | null; created_at?: string | null } | undefined> = {
  side: ConflictEvidenceSide;
  fact: TFact;
  entry: TEntry;
};

function evidenceSortTime(entry: { occurred_at?: string | null; created_at?: string | null } | undefined) {
  const value = entry?.occurred_at ?? entry?.created_at;
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function chronologicalConflictEvidence<TFact, TEntry extends { occurred_at?: string | null; created_at?: string | null } | undefined>(
  evidence: [ConflictEvidence<TFact, TEntry>, ConflictEvidence<TFact, TEntry>]
) {
  return [...evidence].sort((left, right) => {
    const byTime = evidenceSortTime(left.entry) - evidenceSortTime(right.entry);
    if (byTime !== 0) return byTime;
    return left.side.localeCompare(right.side);
  }) as [ConflictEvidence<TFact, TEntry>, ConflictEvidence<TFact, TEntry>];
}

export function outcomeForConflictEvidenceSide(side: ConflictEvidenceSide) {
  return side === "fact_a" ? "accept_fact_a" : "accept_fact_b";
}
