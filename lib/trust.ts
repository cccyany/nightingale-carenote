export type RiskLevel = "low" | "medium" | "high" | "critical";
export type HighlightState = "suggested" | "confirmed" | "rejected" | "needs_review";

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

const rankRisk: Record<number, RiskLevel> = {
  1: "low",
  2: "medium",
  3: "high",
  4: "critical"
};

export const deterministicRiskFloors: Record<string, RiskLevel> = {
  ALLERGY_CONFLICT: "high",
  MEDICATION_CONFLICT: "high",
  MEDICATION_DOSE_CONFLICT: "high",
  UNRESOLVED_CRITICAL_TASK: "high",
  UNRESOLVED_TASK: "medium"
};

export function applyRiskFloor(ruleKey: string, suggestedRisk: RiskLevel): RiskLevel {
  const floor = deterministicRiskFloors[ruleKey] ?? "low";
  return rankRisk[Math.max(riskRank[floor], riskRank[suggestedRisk])];
}

export function evidenceLabel(score: number, explanation: string): { label: string; trusted: boolean; explanation: string } {
  if (score >= 0.9) {
    return { label: "Strong evidence", trusted: true, explanation };
  }
  if (score >= 0.75) {
    return { label: "Supported", trusted: true, explanation };
  }
  return { label: "Needs review", trusted: false, explanation };
}
