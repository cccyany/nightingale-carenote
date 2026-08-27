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
};

type ExtractInput = {
  entryId: string;
  content: string;
  sourceVersion?: number;
  sourceSessionIdentifier?: string;
  authorRole?: string;
};

const medicationPattern = /\b(metformin|lisinopril|atorvastatin)\b/gi;

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

export function extractStructuredCandidates(input: ExtractInput): StructuredCandidate[] {
  const candidates: StructuredCandidate[] = [];
  const content = input.content;

  for (const pattern of [
    /\bPenicillin allergy\b/i,
    /\ballergic to penicillin\b/i
  ]) {
    const match = pattern.exec(content);
    if (match) {
      candidates.push({
        ...candidateBase(input, match, "penicillin"),
        candidateType: "allergy",
        assertion: "present"
      });
      break;
    }
  }

  const nkda = /\bno known drug allergies\b/i.exec(content);
  if (nkda) {
    candidates.push({
      ...candidateBase(input, nkda, "penicillin"),
      candidateType: "allergy",
      assertion: "absent",
      reviewState: "needs_review",
      evidenceExplanation: "Global no-known-allergies statement can contradict prior allergy facts."
    });
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

  for (const match of content.matchAll(/\b(metformin|lisinopril|atorvastatin)\s+(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b/gi)) {
    candidates.push({
      ...candidateBase(input, match as RegExpExecArray, match[1].toLowerCase()),
      candidateType: "dosage",
      value: match[2],
      unit: match[3].toLowerCase(),
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
