export type TranscriptSegment = {
  speaker: "patient" | "clinician" | "staff" | "unknown";
  start_ms: number;
  end_ms: number;
  text: string;
  confidence: number;
  uncertain: boolean;
};

export interface TranscriptionProvider {
  transcribe(input: { syntheticTranscriptText: string }): Promise<TranscriptSegment[]>;
}

export class DeterministicTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: { syntheticTranscriptText: string }): Promise<TranscriptSegment[]> {
    const parts = input.syntheticTranscriptText.split(/\n+/).filter(Boolean);
    return parts.map((part, index) => {
      const speakerMatch = /^(patient|clinician|staff|unknown):\s*/i.exec(part);
      const text = part.replace(/^(patient|clinician|staff|unknown):\s*/i, "");
      return {
        speaker: (speakerMatch?.[1]?.toLowerCase() as TranscriptSegment["speaker"]) ?? "unknown",
        start_ms: index * 5000,
        end_ms: index * 5000 + Math.max(1000, text.length * 40),
        text,
        confidence: /unclear|inaudible|\[uncertain\]/i.test(text) ? 0.55 : 0.85,
        uncertain: /unclear|inaudible|\[uncertain\]/i.test(text)
      };
    });
  }
}

export function transcriptText(segments: TranscriptSegment[]) {
  return segments.map((segment) => `${segment.speaker}: ${segment.text}`).join("\n");
}
