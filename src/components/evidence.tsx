import { Check, CircleHelp, GitCompareArrows, Quote } from 'lucide-react';
import type { Evidence } from '@/lib/contracts';
const labels = {
  possible_contradiction: 'Possible contradiction',
  implausible_claim: 'Implausible claim',
  consistent_detail: 'Consistent detail',
  needs_clarification: 'Needs clarification',
  insufficient_evidence: 'Insufficient evidence',
};
export function EvidenceCards({
  cards,
  onQuote,
}: {
  cards: Evidence[];
  onQuote: (id: string) => void;
}) {
  return (
    <div className="evidence-list">
      {cards.map((card, i) => (
        <article className={`evidence-card ${card.category}`} key={`${i}-${card.claim}`}>
          <div className="evidence-label">
            {card.category === 'possible_contradiction' ? (
              <GitCompareArrows size={14} />
            ) : card.category === 'consistent_detail' ? (
              <Check size={14} />
            ) : (
              <CircleHelp size={14} />
            )}{' '}
            {labels[card.category]}
          </div>
          <h4>{card.claim}</h4>
          {card.quotes.map((quote, j) => (
            <button className="quote" key={j} onClick={() => onQuote(quote.turnId)}>
              <Quote size={12} />
              <span>“{quote.text}”</span>
            </button>
          ))}
        </article>
      ))}
    </div>
  );
}
