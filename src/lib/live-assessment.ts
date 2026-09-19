import { z } from 'zod';
import { assessmentSchema, evidenceSchema, type Assessment, type Turn } from './contracts';
import { groundAssessment, insufficient } from './analysis';

export const liveAssessmentSchema = assessmentSchema.omit({ spokenSummary: true }).extend({
  latestQuote: z.string().min(1).max(1500),
  evidence: z
    .array(evidenceSchema.extend({ quotes: z.array(z.string().min(1).max(1500)).min(1).max(4) }))
    .max(3),
});
const { $schema: ignored, ...parametersJsonSchema } = z.toJSONSchema(liveAssessmentSchema);
void ignored;
export const assessmentTool = {
  name: 'publish_assessment',
  description:
    'Update the visible suspicion chart after every player answer, before your next spoken question. Cite exact player words and reassess the whole story. latestQuote must come from the latest player answer.',
  parametersJsonSchema,
};
export const playerSignature = (turns: Turn[]) =>
  turns
    .filter((t) => t.speaker === 'player')
    .map((t) => t.text)
    .join('\n');

// Speech punctuation/case vary between the tool and transcription. Match identical
// contiguous words (never semantic similarity), then retain the actual source span.
function sourceQuote(quote: string, turns: Turn[]) {
  const tokens = (text: string) => [...text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)];
  const normalize = (word: string) => word.toLowerCase().replaceAll('’', "'");
  const wanted = tokens(quote).map((t) => normalize(t[0]));
  if (!wanted.length) return null;
  for (const turn of [...turns].reverse()) {
    if (turn.speaker !== 'player') continue;
    // Keep exact punctuation when it already matches.
    if (turn.text.includes(quote)) return { turnId: turn.id, text: quote };
    const words = tokens(turn.text);
    for (let i = 0; i <= words.length - wanted.length; i++) {
      if (wanted.every((word, j) => word === normalize(words[i + j][0]))) {
        const end = words[i + wanted.length - 1];
        return {
          turnId: turn.id,
          text: turn.text.slice(words[i].index, end.index! + end[0].length),
        };
      }
    }
  }
  return null;
}
export function groundLiveAssessment(raw: unknown, turns: Turn[]): Assessment | null {
  const parsed = liveAssessmentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const latest = turns.findLast((t) => t.speaker === 'player');
  if (!latest?.completed || !sourceQuote(parsed.data.latestQuote, [latest])) return null;
  const evidence = parsed.data.evidence.map((card) => ({
    ...card,
    quotes: card.quotes.map((q) => sourceQuote(q, turns)),
  }));
  if (evidence.some((card) => card.quotes.some((q) => !q))) return null;
  return groundAssessment({ ...parsed.data, evidence, spokenSummary: '' }, turns);
}
export function liveReviewFallback(
  assessment: Assessment | undefined,
  covered: string | undefined,
  turns: Turn[],
): Assessment {
  if (!assessment || covered !== playerSignature(turns))
    return insufficient(
      'The independent review is unavailable and the last live assessment does not cover your complete story.',
    );
  const result = groundAssessment(assessment, turns);
  return {
    ...result,
    uncertainty: [
      'Independent final review unavailable. This result uses the last validated Live assessment of your complete story.',
      ...result.uncertainty,
    ].slice(0, 5),
  };
}
