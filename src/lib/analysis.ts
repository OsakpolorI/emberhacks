import { REASONING_POLICY } from './reasoning-policy';
import { assessmentSchema, type Assessment, type Turn } from './contracts';

export function insufficient(
  reason = 'There is not enough completed speech to assess this story.',
): Assessment {
  return {
    suspicionScore: null,
    evidenceStrength: 'insufficient',
    evidence: [],
    uncertainty: [reason],
    explanation: reason,
    verdict: 'insufficient_evidence',
    spokenSummary: `Insufficient evidence. ${reason}`,
  };
}
export function meaningful(turns: Turn[], allowPartial = false) {
  return (
    turns
      .filter((t) => t.speaker === 'player' && (t.completed || allowPartial))
      .map((t) => t.text)
      .join(' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length >= 3
  );
}
export function groundAssessment(raw: unknown, turns: Turn[], allowPartial = false): Assessment {
  const parsed = assessmentSchema.parse(raw);
  const evidence = parsed.evidence.filter(
    (card) =>
      card.quotes.length > 0 &&
      card.quotes.every((q) => {
        const t = turns.find((t) => t.id === q.turnId);
        return (
          t?.speaker === 'player' &&
          t.text.includes(q.text) &&
          (!['possible_contradiction', 'implausible_claim'].includes(card.category) || t.completed)
        );
      }) &&
      (card.category !== 'possible_contradiction' || card.quotes.length >= 2),
  );
  if (!meaningful(turns, allowPartial) || evidence.length === 0)
    return insufficient(
      'No sufficiently grounded evidence was available. A consistent story alone cannot establish truth.',
    );
  if (evidence.length !== parsed.evidence.length)
    return {
      ...insufficient(
        'Some proposed evidence could not be verified against the transcript. No verdict is issued from those claims.',
      ),
      evidence,
    };
  if (parsed.evidenceStrength === 'insufficient')
    return {
      ...parsed,
      suspicionScore: null,
      verdict: 'insufficient_evidence',
      spokenSummary: `Insufficient evidence. ${parsed.explanation}`,
    };
  if (
    parsed.verdict === 'likely_bluff' &&
    !evidence.some((e) => ['possible_contradiction', 'implausible_claim'].includes(e.category))
  )
    return {
      ...insufficient(
        'No substantive unresolved inconsistency was identified. The story needs more evidence before calling a bluff.',
      ),
      evidence,
    };
  return {
    ...parsed,
    evidence,
    spokenSummary: `${parsed.verdict.replaceAll('_', ' ')}. ${parsed.explanation}`,
  };
}
export const ANALYST_PROMPT = `You are the independent evidence analyst for a consensual bluff game. ${REASONING_POLICY} Cite exact substrings and source turn IDs. Evaluate the complete supplied transcript, without assuming previous assessments are correct. Return the required JSON object only.`;
