export type TranscriptSegment = {
  speaker: "patient" | "clinician" | "staff" | "unknown";
  display_speaker?: string;
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
      const speakerMatch = /^(doctor|clinician|nurse|patient|staff|unknown):\s*/i.exec(part);
      const label = speakerMatch?.[1]?.toLowerCase();
      const speaker = label === "doctor" ? "clinician" : label === "nurse" ? "staff" : label;
      const displaySpeaker = label ? label.charAt(0).toUpperCase() + label.slice(1) : "unknown";
      const text = part.replace(/^(doctor|clinician|nurse|patient|staff|unknown):\s*/i, "");
      return {
        speaker: (speaker as TranscriptSegment["speaker"]) ?? "unknown",
        display_speaker: displaySpeaker,
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
  return segments.map((segment) => `${segment.display_speaker ?? segment.speaker}: ${segment.text}`).join("\n");
}
