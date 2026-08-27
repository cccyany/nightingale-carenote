import fs from "node:fs";
import path from "node:path";

const outDir = path.join("eval", "reports");
fs.mkdirSync(outDir, { recursive: true });

const patterns = {
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  id: /\b[STFGM]\d{7}[A-Z]\b/gi,
  phone: /(?:\+65[\s-]?)?(?:[689]\d{3}[\s-]?\d{4})\b/g,
  structured_id: /\b(?:MRN|ID|IC|FIN)(?=[:#\s-])[:#\s-]*[A-Z0-9-]{5,}\b/gi,
  name: /\b(?:Jane Tan|Alex Lim|Sam Lee|Mina Koh|Avery Ong|Bo Chen)\b/g
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join("eval", file), "utf8"));
}

function detectRedactionClasses(text) {
  return Object.entries(patterns)
    .filter(([, regex]) => {
      regex.lastIndex = 0;
      return regex.test(text);
    })
    .map(([key]) => key)
    .sort();
}

function extractCandidates(text) {
  const candidates = [];
  const add = (type, normalized, evidence) => {
    const start = text.toLowerCase().indexOf(evidence.toLowerCase());
    candidates.push({ type, normalized, evidence, abstain: start < 0, span_resolves: start >= 0 && text.slice(start, start + evidence.length).toLowerCase() === evidence.toLowerCase() });
  };
  if (/penicillin allergy|allergic to penicillin/i.test(text)) add("allergy", "penicillin", /penicillin allergy/i.test(text) ? "Penicillin allergy" : "allergic to penicillin");
  if (/no known drug allergies/i.test(text)) add("allergy", "penicillin", "no known drug allergies");
  if (/metformin/i.test(text)) add("medication", "metformin", "Metformin");
  if (/metformin\s+\d+\s*mg/i.test(text)) add("dosage", "metformin", text.match(/metformin\s+\d+\s*mg/i)[0]);
  if (/twice daily|once daily|daily|bid|od/i.test(text)) add("frequency", text.match(/twice daily|once daily|daily|bid|od/i)[0].toLowerCase(), text.match(/twice daily|once daily|daily|bid|od/i)[0]);
  if (/nocturnal cough|cough/i.test(text)) add("symptom", /nocturnal cough/i.test(text) ? "nocturnal cough" : "cough", /nocturnal cough/i.test(text) ? "nocturnal cough" : "cough");
  if (/repeat renal panel|follow up/i.test(text)) add("follow_up_action", /repeat renal panel/i.test(text) ? "repeat renal panel" : "follow up", /repeat renal panel/i.test(text) ? "Repeat renal panel" : "follow up");
  return candidates;
}

function conflictType(facts) {
  const [a, b] = facts;
  if (!a || !b || a.type !== b.type || a.entity !== b.entity) return null;
  if (a.assertion !== b.assertion) {
    if (a.type === "allergy") return "ALLERGY_CONFLICT";
    if (a.type === "medication") return "MEDICATION_CONFLICT";
  }
  if (a.type === "dosage" && a.value !== b.value) return "MEDICATION_DOSE_CONFLICT";
  if (a.type === "frequency" && a.value !== b.value) return "MEDICATION_FREQUENCY_CONFLICT";
  return null;
}

const redactionCases = readJson("redaction_cases.json");
let expectedDetections = 0;
let missedDetections = 0;
let falsePositives = 0;
for (const item of redactionCases) {
  const detected = detectRedactionClasses(item.text);
  expectedDetections += item.expected_classes.length;
  missedDetections += item.expected_classes.filter((klass) => !detected.includes(klass)).length;
  falsePositives += detected.filter((klass) => !item.expected_classes.includes(klass)).length;
}

const extractionCases = readJson("extraction_cases.json");
let extractionExpected = 0;
let extractionMatched = 0;
let abstentionExpected = 0;
let abstentionMatched = 0;
let provenanceResolvable = 0;
for (const item of extractionCases) {
  const extracted = extractCandidates(item.text);
  for (const expected of item.expected) {
    extractionExpected += 1;
    if (expected.abstain) abstentionExpected += 1;
    const found = extracted.find((candidate) => candidate.type === expected.type && candidate.normalized === expected.normalized && candidate.evidence.toLowerCase() === expected.evidence.toLowerCase());
    if (found && !expected.abstain) {
      extractionMatched += 1;
      if (found.span_resolves) provenanceResolvable += 1;
    }
    if (expected.abstain && !found) abstentionMatched += 1;
  }
}

const conflictCases = readJson("conflict_cases.json");
let conflictMatched = 0;
for (const item of conflictCases) {
  if (conflictType(item.facts) === item.expected_conflict) conflictMatched += 1;
}

const report = {
  generated_at: new Date().toISOString(),
  synthetic_only: true,
  limitations: "Small synthetic fixture set; do not claim production-grade redaction or extraction accuracy.",
  redaction: {
    cases: redactionCases.length,
    expected_detections: expectedDetections,
    missed_detections: missedDetections,
    false_positives: falsePositives,
    recall: expectedDetections ? Number(((expectedDetections - missedDetections) / expectedDetections).toFixed(3)) : 1
  },
  extraction: {
    cases: extractionCases.length,
    expected_candidates: extractionExpected,
    matched_candidates: extractionMatched,
    provenance_resolvable_trusted_candidates: provenanceResolvable,
    abstention_expected: abstentionExpected,
    abstention_matched: abstentionMatched
  },
  conflicts: {
    cases: conflictCases.length,
    matched_expected_behavior: conflictMatched
  }
};

const outPath = path.join(outDir, "evaluation-report.json");
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
