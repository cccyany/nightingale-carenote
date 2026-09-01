"use client";

import Link from "next/link";
import { useState } from "react";
import type { GlanceItem } from "@/lib/carenote-data";
import { activeGlanceBadge, defaultGlanceCount, maxGlanceCount } from "@/lib/glance-presentation";
import { HighlightFeedbackButtons } from "./CareNoteActions";

function displayToken(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function riskClass(risk: string) {
  if (risk === "high" || risk === "critical") return "bg-red-700 text-white border-red-700";
  if (risk === "medium") return "bg-amber-100 text-amber-950 border-amber-200";
  return "bg-teal-50 text-teal-950 border-teal-100";
}

function humanRiskReason(reason: string) {
  if (reason.includes("ALLERGY_CONFLICT")) return "Potential allergy contradiction. Safety rules keep this item high priority until reviewed.";
  if (reason.includes("MEDICATION_DOSE_CONFLICT")) return "Medication dose information conflicts and needs clinician review.";
  if (reason.includes("MEDICATION_CONFLICT")) return "Medication status conflicts and should be reconciled before acting.";
  if (reason.includes("UNRESOLVED")) return "An open follow-up may affect near-term care.";
  return reason;
}

function componentLabel(key: string) {
  const labels: Record<string, string> = {
    risk: "Clinical severity",
    unresolved_action: "Unresolved action",
    recency: "Recent evidence",
    clinician_confirmation: "Clinician confirmed",
    entity_priority: "Clinical topic priority",
    decay: "Age/decay adjustment",
    adaptive: "Care-team feedback",
    final_score: "Final importance",
    storage_class: "Recency tier"
  };
  return labels[key] ?? displayToken(key);
}

export function GlanceSection({
  demo,
  patientId,
  items
}: {
  demo: string;
  patientId: string;
  items: GlanceItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const totalActiveItems = items.length;
  const shownItems = totalActiveItems <= defaultGlanceCount
    ? items
    : items.slice(0, expanded ? maxGlanceCount : defaultGlanceCount);

  return (
    <section className="mt-5 rounded-md border border-teal-800 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Care Glance</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">What needs attention now</h2>
          <p className="mt-1 text-sm text-stone-600">Top ranked, source-linked items. The timeline remains the source of truth.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-900">
            {activeGlanceBadge(totalActiveItems, shownItems.length)}
          </span>
          {totalActiveItems > defaultGlanceCount ? (
            <button
              className="rounded-md border border-teal-700 bg-white px-3 py-1.5 text-sm font-medium text-teal-900 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded ? "Show top 3" : "Show all active items"}
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shownItems.length ? shownItems.map((item) => (
          <article className={`rounded-md border p-4 shadow-sm ${item.risk === "high" || item.risk === "critical" ? "border-red-200 bg-red-50/60" : "border-stone-200 bg-white"}`} key={item.id}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full border px-2.5 py-1 font-semibold ${riskClass(item.risk)}`}>{item.risk.toUpperCase()}</span>
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 font-medium text-stone-700">{displayToken(item.status)}</span>
            </div>
            <h3 className="mt-3 text-lg font-semibold leading-snug">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-800">{item.short_summary}</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-stone-950">Why it matters</dt>
                <dd className="mt-1 text-stone-700">{humanRiskReason(item.risk_reason)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-stone-950">Evidence</dt>
                <dd className="mt-1 text-stone-700">{item.evidence_label}{item.status === "needs_review" ? " · review needed" : ""} · {item.evidence_explanation}</dd>
              </div>
              <div>
                <dt className="font-semibold text-stone-950">Recommended action</dt>
                <dd className="mt-1 text-stone-700">{item.available_action}</dd>
              </div>
            </dl>
            <details className="mt-3 rounded border border-stone-200 bg-white/70 p-2 text-xs text-stone-600">
              <summary className="cursor-pointer font-semibold text-stone-800">Why prioritized</summary>
              <p className="mt-2 text-stone-700">{item.ranking_explanation}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(item.importance_reasons ?? {})
                  .filter(([key]) => key !== "adaptive_detail" && key !== "explanations")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt className="font-medium">{componentLabel(key)}</dt>
                      <dd>{String(value)}</dd>
                    </div>
                  ))}
                <div>
                  <dt className="font-medium">Recency tier</dt>
                  <dd>{displayToken(item.storage_class)}</dd>
                </div>
              </dl>
              {item.rule_key ? <p className="mt-2">Safety rule: {displayToken(item.rule_key)}</p> : null}
            </details>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              {item.provenance_spans?.entry_id ? (
                <Link className="rounded-md bg-teal-700 px-3 py-1.5 font-medium text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/patients/${patientId}?demo=${encodeURIComponent(demo)}&source=${item.provenance_spans.entry_id}&span=${item.provenance_span_id}#entry-${item.provenance_spans.entry_id}`}>
                  Review evidence -&gt;
                </Link>
              ) : null}
              {item.highlight_id ? (
                <HighlightFeedbackButtons
                  highlightId={item.highlight_id}
                  confirmationStatus={item.confirmation_status}
                  isConflict={Boolean(item.rule_key?.includes("CONFLICT"))}
                />
              ) : null}
            </div>
          </article>
        )) : (
          <p className="rounded-md border border-stone-200 bg-white p-4 text-stone-600">No active Glance items.</p>
        )}
      </div>
    </section>
  );
}
