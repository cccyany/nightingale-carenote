export type RedactionClass = "name" | "id" | "phone" | "email" | "structured_id";

export type RedactionReplacement = {
  class: RedactionClass;
  placeholder: string;
  start: number;
  end: number;
};

export type RedactionResult = {
  originalLength: number;
  redactedText: string;
  replacements: RedactionReplacement[];
  classCounts: Partial<Record<RedactionClass, number>>;
  allowed: boolean;
  blockedReason?: string;
};

const patterns: Array<{ class: RedactionClass; regex: RegExp }> = [
  { class: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { class: "id", regex: /\b[STFGM]\d{7}[A-Z]\b/gi },
  { class: "phone", regex: /(?:\+65[\s-]?)?(?:[689]\d{3}[\s-]?\d{4})\b/g },
  { class: "structured_id", regex: /\b(?:MRN|ID|IC|FIN)(?=[:#\s-])[:#\s-]*[A-Z0-9-]{5,}\b/gi },
  { class: "name", regex: /\b(?:Jane Tan|Alex Lim|Sam Lee|Mina Koh|Avery Ong|Bo Chen)\b/g }
];
const unresolvedNamePattern = /\b(?!(?:No known|Repeat renal)\b)[A-Z][a-z]+ [A-Z][a-z]+\b/;

export function redactForLlm(rawText: string): RedactionResult {
  const matches: RedactionReplacement[] = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of rawText.matchAll(pattern.regex)) {
      if (match.index === undefined || !match[0]) continue;
      const start = match.index;
      const end = start + match[0].length;
      if (matches.some((existing) => start < existing.end && end > existing.start)) continue;
      matches.push({ class: pattern.class, placeholder: "", start, end });
    }
  }

  matches.sort((a, b) => a.start - b.start);
  const classCounts: Partial<Record<RedactionClass, number>> = {};
  let cursor = 0;
  let redactedText = "";
  const replacements = matches.map((replacement) => {
    classCounts[replacement.class] = (classCounts[replacement.class] ?? 0) + 1;
    const placeholder = `[${replacement.class.toUpperCase()}_${classCounts[replacement.class]}]`;
    redactedText += rawText.slice(cursor, replacement.start) + placeholder;
    cursor = replacement.end;
    return { ...replacement, placeholder };
  });
  redactedText += rawText.slice(cursor);

  const verification = verifyRedaction(redactedText);
  return {
    originalLength: rawText.length,
    redactedText,
    replacements,
    classCounts,
    allowed: verification.safe,
    blockedReason: verification.safe ? undefined : verification.reason
  };
}

export function verifyRedaction(redactedText: string): { safe: true } | { safe: false; reason: string } {
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(redactedText)) return { safe: false, reason: `unredacted ${pattern.class} detected` };
  }
  if (unresolvedNamePattern.test(redactedText)) return { safe: false, reason: "unredacted name detected" };
  return { safe: true };
}

export function redactionAuditMetadata(result: RedactionResult) {
  return {
    original_length: result.originalLength,
    redacted_length: result.redactedText.length,
    classes: Object.keys(result.classCounts).sort(),
    replacement_count: result.replacements.length,
    allowed: result.allowed,
    blocked_reason: result.blockedReason ?? null
  };
}
