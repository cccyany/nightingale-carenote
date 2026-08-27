export function EvidenceText({
  content,
  evidenceStart,
  evidenceEnd
}: {
  content: string;
  evidenceStart?: number | null;
  evidenceEnd?: number | null;
}) {
  if (evidenceStart === null || evidenceEnd === null || evidenceStart === undefined || evidenceEnd === undefined) {
    return <p className="mt-3 whitespace-pre-wrap">{content}</p>;
  }

  return (
    <p className="mt-3 whitespace-pre-wrap">
      {content.slice(0, evidenceStart)}
      <mark className="rounded bg-amber-200 px-1">{content.slice(evidenceStart, evidenceEnd)}</mark>
      {content.slice(evidenceEnd)}
    </p>
  );
}
