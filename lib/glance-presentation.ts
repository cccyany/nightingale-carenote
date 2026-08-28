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
  "%Synthetic unresolved draft%"
];

type GlancePresentationItem = {
  title: string;
  short_summary: string;
  risk_reason: string;
  rule_key: string | null;
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
  /\bSynthetic unresolved draft\b/i
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

export function activeGlanceBadge(totalActiveItems: number, visibleGlanceItems: number) {
  if (totalActiveItems <= defaultGlanceCount) {
    return `${totalActiveItems} active item${totalActiveItems === 1 ? "" : "s"}`;
  }
  return `${totalActiveItems} active items · showing ${visibleGlanceItems}`;
}
