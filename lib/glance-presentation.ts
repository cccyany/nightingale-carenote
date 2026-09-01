export const defaultGlanceCount = 3;
export const maxGlanceCount = 5;

export const validationNoiseSqlLikePatterns = [
  "%Synthetic safety baseline%",
  "%Synthetic safety future%",
  "%Synthetic staff-owned note%",
  "%Synthetic first writer wins%",
  "%Synthetic audit updated content%",
  "%Synthetic revision base%",
  "%Synthetic low trust draft%",
  "%Synthetic provenance base%",
  "%Synthetic extraction base%",
  "%Synthetic Clinic A learning item%",
  "%Synthetic exposed future%",
  "%Synthetic exposure baseline%",
  "%Synthetic rejection baseline%",
  "%Synthetic rejection future%",
  "%Synthetic ambient summary%",
  "%Synthetic ambient consult test%",
  "%Synthetic runtime cough%",
  "%Synthetic updated clinician plan%",
  "%Synthetic clinician independent update%",
  "%Synthetic staff independent update%",
  "%Synthetic collaboration note%",
  "%Synthetic rejected draft%",
  "%Synthetic rejected patient content%",
  "%Synthetic approved instruction%",
  "%Synthetic unresolved draft%",
  "%Synthetic dosage approval%",
  "%Patient: No known allergies.%",
  "%Nurse: Penicillin allergy.%"
];

type GlancePresentationItem = {
  title: string;
  short_summary: string;
  risk_reason: string;
  rule_key: string | null;
  status?: string | null;
  confirmation_status?: string | null;
  available_action?: string | null;
};

const validationNoisePatterns = [
  /\bSynthetic safety baseline\b/i,
  /\bSynthetic safety future\b/i,
  /\bSynthetic staff-owned note\b/i,
  /\bSynthetic first writer wins\b/i,
  /\bSynthetic audit updated content\b/i,
  /\bSynthetic revision base\b/i,
  /\bSynthetic low trust draft\b/i,
  /\bSynthetic provenance base\b/i,
  /\bSynthetic extraction base\b/i,
  /\bSynthetic Clinic A learning item\b/i,
  /\bSynthetic exposed future\b/i,
  /\bSynthetic exposure baseline\b/i,
  /\bSynthetic rejection baseline\b/i,
  /\bSynthetic rejection future\b/i,
  /\bSynthetic ambient summary\b/i,
  /\bSynthetic ambient consult test\b/i,
  /\bSynthetic runtime cough summary\b/i,
  /\bSynthetic runtime cough\s+[0-9a-f-]{36}\b/i,
  /\bSynthetic updated clinician plan\b/i,
  /\bSynthetic clinician independent update\b/i,
  /\bSynthetic staff independent update\b/i,
  /\bSynthetic collaboration note\s+[0-9a-f-]{36}\b/i,
  /\bSynthetic rejected draft\b/i,
  /\bSynthetic rejected patient content\b/i,
  /\bSynthetic approved instruction\b/i,
  /\bSynthetic unresolved draft\b/i,
  /\bSynthetic dosage approval\b/i,
  /\bPatient:\s*No known allergies\.\s+[0-9a-f-]{36}\b/i,
  /\bNurse:\s*Penicillin allergy\.\s+[0-9a-f-]{36}\b/i,
  /\bTake synthetic metformin 1000 mg once daily\b/i
];

export function isValidationNoiseText(text: string) {
  return validationNoisePatterns.some((pattern) => pattern.test(text));
}

export function isValidationNoiseGlance(item: GlancePresentationItem) {
  return isValidationNoiseText(`${item.title} ${item.short_summary} ${item.risk_reason}`);
}

function glanceKey(item: GlancePresentationItem) {
  const title = item.title.toLowerCase();
  if (title.includes("allergy") && title.includes("conflict")) return "allergy_conflict";
  if (title.includes("dose") && title.includes("conflict")) return "medication_dose_conflict";
  if (title.includes("medication") && title.includes("conflict")) return "medication_conflict";
  if (title.includes("renal")) return "renal_panel_action";
  if (title.includes("cough")) return "persistent_cough";
  return `${item.rule_key ?? "item"}:${title}`;
}

export function presentableGlanceItems<T extends GlancePresentationItem>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (isValidationNoiseGlance(item)) return false;
    const key = glanceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isConflictGlanceItem(item: GlancePresentationItem) {
  return Boolean(item.rule_key?.includes("CONFLICT"));
}

export function isConfirmedGlanceItem(item: GlancePresentationItem) {
  return item.status === "confirmed" || item.confirmation_status === "confirmed";
}

export function isActiveAttentionGlanceItem(item: GlancePresentationItem) {
  if (item.status === "resolved" || item.status === "rejected") return false;
  if (item.status === "needs_review") return true;
  if (isConflictGlanceItem(item)) return true;
  if (item.rule_key?.startsWith("UNRESOLVED")) return true;
  if (item.available_action?.toLowerCase().includes("complete")) return true;
  return false;
}

export function isConfirmedNonConflictGlanceItem(item: GlancePresentationItem) {
  if (item.status === "resolved" || item.status === "rejected") return false;
  return isConfirmedGlanceItem(item) && !isConflictGlanceItem(item);
}

export function splitGlancePresentationItems<T extends GlancePresentationItem>(items: T[]) {
  return {
    active: items.filter(isActiveAttentionGlanceItem),
    confirmed: items.filter(isConfirmedNonConflictGlanceItem)
  };
}

export function glanceViewBadge(view: "active" | "confirmed", totalItems: number, visibleItems: number) {
  const noun = view === "active" ? "active item" : "confirmed item";
  if (totalItems <= defaultGlanceCount) {
    return `${totalItems} ${noun}${totalItems === 1 ? "" : "s"}`;
  }
  return `${totalItems} ${noun}s · showing ${visibleItems}`;
}

export function activeGlanceBadge(totalActiveItems: number, visibleGlanceItems: number) {
  if (totalActiveItems <= defaultGlanceCount) {
    return `${totalActiveItems} active item${totalActiveItems === 1 ? "" : "s"}`;
  }
  return `${totalActiveItems} active items · showing ${visibleGlanceItems}`;
}
