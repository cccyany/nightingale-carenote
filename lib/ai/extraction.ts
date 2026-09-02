export type CandidateType = "allergy" | "medication" | "dosage" | "frequency" | "symptom" | "follow_up_action";
export type EvidenceQualityState = "strong_evidence" | "supported" | "needs_review";
export type CandidateReviewState = "suggested" | "confirmed" | "needs_review" | "rejected";

export type StructuredCandidate = {
  candidateType: CandidateType;
  normalizedValue: string;
  value?: string;
  unit?: string;
  assertion: "present" | "absent" | "unknown";
  sourceEvidenceText: string;
  charStart: number;
  charEnd: number;
  sourceEntryId: string;
  sourceVersion?: number;
  sourceSessionIdentifier?: string;
  extractionMethod: "deterministic_rule" | "mock_llm_structured" | "provider_structured";
  evidenceQualityState: EvidenceQualityState;
  reviewState: CandidateReviewState;
  evidenceExplanation: string;
  supportingEvidence?: Array<{
    sourceEvidenceText: string;
    charStart: number;
    charEnd: number;
    evidenceExplanation: string;
  }>;
};

type ExtractInput = {
  entryId: string;
  content: string;
  sourceVersion?: number;
  sourceSessionIdentifier?: string;
  authorRole?: string;
};

const medicationPattern = /\b(metformin|lisinopril|atorvastatin)\b/gi;
const speakerLinePattern = /^(?:doctor|clinician|nurse|patient|staff|unknown|speaker\s*\d+|spk[:_\s-]*\d+):\s*/i;

function candidateBase(input: ExtractInput, match: RegExpExecArray, normalizedValue: string) {
  return {
    normalizedValue,
    sourceEvidenceText: match[0],
    charStart: match.index,
    charEnd: match.index + match[0].length,
    sourceEntryId: input.entryId,
    sourceVersion: input.sourceVersion,
    sourceSessionIdentifier: input.sourceSessionIdentifier,
    extractionMethod: "deterministic_rule" as const,
    evidenceQualityState: input.authorRole === "clinician" ? "strong_evidence" as const : "supported" as const,
    reviewState: input.authorRole === "clinician" ? "confirmed" as const : "needs_review" as const,
    evidenceExplanation: "Exact source span found by deterministic clinical rule."
  };
}

function lineContainingRange(content: string, start: number, end: number) {
  const lineStart = content.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = content.indexOf("\n", end);
  const lineEnd = nextNewline >= 0 ? nextNewline : content.length;
  return content.slice(lineStart, lineEnd).trim();
}

function isQuestionFormMention(content: string, match: RegExpExecArray) {
  return /\?\s*$/.test(lineContainingRange(content, match.index, match.index + match[0].length));
}

export function extractStructuredCandidates(input: ExtractInput): StructuredCandidate[] {
  const candidates: StructuredCandidate[] = [];
  const content = input.content;

  for (const pattern of [
    /\bPenicillin allergy\b/i,
    /\ballergic to penicillin\b/i
  ]) {
    const match = pattern.exec(content);
    if (match) {
      const preceding = content.slice(Math.max(0, match.index - 48), match.index).toLowerCase();
      if (/\b(mother|father|parent|sister|brother|child|daughter|son)\b/.test(preceding)) continue;
      candidates.push({
        ...candidateBase(input, match, "penicillin"),
        candidateType: "allergy",
        assertion: "present"
      });
      break;
    }
  }

  const nkda = /\bno known (?:drug )?allergies\b/i.exec(content);
  if (nkda) {
    candidates.push({
      ...candidateBase(input, nkda, "penicillin"),
      candidateType: "allergy",
      assertion: "absent",
      reviewState: "needs_review",
      evidenceExplanation: "Global no-known-allergies statement can contradict prior allergy facts."
    });
  }

  for (const contextual of contextualAllergyCandidates(input)) {
    if (!candidates.some((candidate) => candidate.candidateType === "allergy" && candidate.assertion === "present" && candidate.normalizedValue === contextual.normalizedValue)) {
      candidates.push(contextual);
    }
  }

  for (const match of content.matchAll(medicationPattern)) {
    const preceding = content.slice(Math.max(0, match.index - 24), match.index).toLowerCase();
    const following = content.slice(match.index, match.index + 48).toLowerCase();
    const stopped = /stopped|not taking|discontinued/.test(`${preceding} ${following}`);
    candidates.push({
      ...candidateBase(input, match as RegExpExecArray, match[0].toLowerCase()),
      candidateType: "medication",
      assertion: stopped ? "absent" : "present",
      reviewState: stopped ? "needs_review" : (input.authorRole === "clinician" ? "confirmed" : "suggested"),
      evidenceExplanation: stopped ? "Medication appears in a stopped/not-taking context." : "Medication mention has exact source span."
    });
  }

  for (const match of content.matchAll(/\b(metformin|lisinopril|atorvastatin)\s+(\d+(?:\.\d+)?)\s*(mg|milligrams?|mcg|g)\b/gi)) {
    const unit = /^milligrams?$/i.test(match[3]) ? "mg" : match[3].toLowerCase();
    candidates.push({
      ...candidateBase(input, match as RegExpExecArray, match[1].toLowerCase()),
      candidateType: "dosage",
      value: match[2],
      unit,
      assertion: "present",
      evidenceExplanation: "Medication dose captured with exact source span."
    });
  }

  for (const match of content.matchAll(/\b(?:twice daily|once daily|daily|bid|od)\b/gi)) {
    candidates.push({
      ...candidateBase(input, match as RegExpExecArray, match[0].toLowerCase()),
      candidateType: "frequency",
      assertion: "present",
      evidenceExplanation: "Medication frequency captured with exact source span."
    });
  }

  for (const match of content.matchAll(/\b(nocturnal cough|cough|dizziness|shortness of breath)\b/gi)) {
    if (isQuestionFormMention(content, match as RegExpExecArray)) continue;
    candidates.push({
      ...candidateBase(input, match as RegExpExecArray, match[0].toLowerCase()),
      candidateType: "symptom",
      assertion: "present",
      reviewState: "suggested"
    });
  }

  for (const match of content.matchAll(/\b(repeat renal panel|follow up|review in \d+ weeks?)\b/gi)) {
    candidates.push({
      ...candidateBase(input, match as RegExpExecArray, match[0].toLowerCase()),
      candidateType: "follow_up_action",
      assertion: "present",
      reviewState: "suggested"
    });
  }

  return candidates;
}

function contextualAllergyCandidates(input: ExtractInput): StructuredCandidate[] {
  const candidates: StructuredCandidate[] = [];
  const lineMatches = [...input.content.matchAll(/[^\r\n]+/g)];
  for (let index = 0; index < lineMatches.length - 1; index += 1) {
    const questionMatch = lineMatches[index];
    const answerMatch = lineMatches[index + 1];
    const question = questionMatch[0].trim();
    const answer = answerMatch[0].trim();
    const questionText = question.replace(speakerLinePattern, "").trim();
    const answerText = answer.replace(speakerLinePattern, "").trim();
    if (!/\b(?:medication|drug)?\s*allerg(?:y|ies)\b/i.test(questionText) || !/\b(do you have|any|known)\b/i.test(questionText)) continue;
    if (/^(?:no|nope|none|no known allergies|no known drug allergies)\b/i.test(answerText)) continue;
    if (!/^(?:yes|yeah|yep)\b/i.test(answerText)) continue;
    const penicillin = /\bpenicillin\b/i.exec(answer);
    if (!penicillin) continue;
    candidates.push({
      ...candidateBase(input, {
        0: answer,
        index: answerMatch.index ?? 0,
        input: input.content
      } as RegExpExecArray, "penicillin"),
      candidateType: "allergy",
      assertion: "present",
      reviewState: "needs_review",
      evidenceQualityState: "needs_review",
      evidenceExplanation: "Allergy inferred from an affirmative answer immediately following an allergy question; requires human review.",
      supportingEvidence: [{
        sourceEvidenceText: question,
        charStart: questionMatch.index ?? 0,
        charEnd: (questionMatch.index ?? 0) + question.length,
        evidenceExplanation: "Question establishes allergy context for the elliptical answer."
      }]
    });
  }
  return candidates;
}
