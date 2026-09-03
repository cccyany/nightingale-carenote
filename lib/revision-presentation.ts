export type AiRevisionPresentation = {
  summary: string | null;
  keyPoints: string[];
  provider: string | null;
  providerDisplay: string | null;
  model: string | null;
  reviewState: string | null;
  generatedAt: string | null;
  sourceLabel: string | null;
  sourceSessionIdentifier: string | null;
};

export type RevisionDiffChunk = {
  value: string;
  kind: "added" | "removed" | "unchanged";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

export function displayRevisionToken(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bAi\b/g, "AI");
}

function tokenizeForDiff(value: string) {
  return value.match(/\S+\s*/g) ?? [];
}

export function revisionDiff(previous: string | null, current: string): RevisionDiffChunk[] {
  if (!previous) return [{ value: current, kind: "added" }];
  if (previous === current) return [{ value: current, kind: "unchanged" }];

  const oldTokens = tokenizeForDiff(previous);
  const newTokens = tokenizeForDiff(current);
  const lengths = Array.from({ length: oldTokens.length + 1 }, () => Array<number>(newTokens.length + 1).fill(0));

  for (let oldIndex = oldTokens.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newTokens.length - 1; newIndex >= 0; newIndex -= 1) {
      lengths[oldIndex][newIndex] = oldTokens[oldIndex] === newTokens[newIndex]
        ? lengths[oldIndex + 1][newIndex + 1] + 1
        : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1]);
    }
  }

  const chunks: RevisionDiffChunk[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldTokens.length && newIndex < newTokens.length) {
    if (oldTokens[oldIndex] === newTokens[newIndex]) {
      chunks.push({ value: newTokens[newIndex], kind: "unchanged" });
      oldIndex += 1;
      newIndex += 1;
    } else if (lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1]) {
      chunks.push({ value: oldTokens[oldIndex], kind: "removed" });
      oldIndex += 1;
    } else {
      chunks.push({ value: newTokens[newIndex], kind: "added" });
      newIndex += 1;
    }
  }
  for (; oldIndex < oldTokens.length; oldIndex += 1) chunks.push({ value: oldTokens[oldIndex], kind: "removed" });
  for (; newIndex < newTokens.length; newIndex += 1) chunks.push({ value: newTokens[newIndex], kind: "added" });
  return chunks;
}

export function parseAiRevisionSnapshot(content: string): AiRevisionPresentation | null {
  const snapshot = parseJsonRecord(content);
  if (!snapshot) return null;

  const generatedRaw = snapshot.generated;
  let generated: Record<string, unknown> | null = null;
  if (isRecord(generatedRaw)) {
    generated = generatedRaw;
  } else if (typeof generatedRaw === "string") {
    generated = parseJsonRecord(generatedRaw);
  } else {
    generated = snapshot;
  }

  if (!generated) return null;

  const summary = stringValue(generated.summary) ?? stringValue(generated.body) ?? stringValue(generated.content);
  const keyPoints = stringList(generated.key_points).length
    ? stringList(generated.key_points)
    : stringList(generated.keyPoints);

  if (!summary && keyPoints.length === 0) return null;

  return {
    summary,
    keyPoints,
    provider: stringValue(snapshot.provider),
    providerDisplay: stringValue(snapshot.provider_display),
    model: stringValue(snapshot.model),
    reviewState: stringValue(snapshot.review_state),
    generatedAt: stringValue(snapshot.generated_at),
    sourceLabel: stringValue(snapshot.source_label),
    sourceSessionIdentifier: stringValue(snapshot.source_session_identifier)
  };
}
