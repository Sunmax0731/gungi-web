import { getPieceGuide } from '../app/pieceGuides';
import { getPieceDefinition } from '../game/pieces';
import { getRuleset } from '../game/rulesets';
import { type PieceKind, type RulesetId } from '../game/types';
import { PieceMovementPreview } from './PieceMovementPreview';

interface PieceInsightCardProps {
  emptyText: string;
  kind: PieceKind | null;
  rulesetId: RulesetId;
  title: string;
}

export function PieceInsightCard({ emptyText, kind, rulesetId, title }: PieceInsightCardProps) {
  if (!kind) {
    return (
      <section className="card piece-insight-card">
        <h2>{title}</h2>
        <p className="muted">{emptyText}</p>
      </section>
    );
  }

  const definition = getPieceDefinition(kind);
  const guide = getPieceGuide(kind);
  const ruleset = getRuleset(rulesetId);

  return (
    <section className="card piece-insight-card">
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="piece-insight-badge">{definition.label}</span>
      </div>
      <p className="muted">{guide.summary}</p>
      <PieceMovementPreview kind={kind} maxTier={ruleset.maxStackHeight} />
      <div className="piece-insight-list">
        <strong>使いどころ</strong>
        <ul className="modal-list compact-list">
          {guide.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>
      <div className="piece-insight-list">
        <strong>補足</strong>
        <ul className="modal-list compact-list">
          {guide.specialNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
