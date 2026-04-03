import { useMemo, useRef, useState } from 'react';
import { RULE_GUIDES, RULE_GUIDE_ORDER, type RuleGuideId } from '../../app/gameUi';
import { getPieceGuide, getRulesetPieceKinds } from '../../app/pieceGuides';
import { PieceMovementPreview } from '../PieceMovementPreview';
import { getPieceDefinition } from '../../game/pieces';
import { getRuleset } from '../../game/rulesets';
import { type PieceKind, type RulesetId } from '../../game/types';
import { ModalDialog } from './ModalDialog';

interface RuleGuideDialogProps {
  activeTab: RuleGuideId;
  onSelectTab: (tab: RuleGuideId) => void;
  onClose: () => void;
}

function resolvePreviewRulesetId(activeTab: RuleGuideId): RulesetId {
  return activeTab === 'advanced' || activeTab === 'intermediate' ? 'advanced' : 'beginner';
}

export function RuleGuideDialog({ activeTab, onSelectTab, onClose }: RuleGuideDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const currentGuide = RULE_GUIDES[activeTab];
  const previewRulesetId = resolvePreviewRulesetId(activeTab);
  const previewRuleset = getRuleset(previewRulesetId);
  const pieceKinds = useMemo(() => getRulesetPieceKinds(previewRulesetId), [previewRulesetId]);
  const [selectedKind, setSelectedKind] = useState<PieceKind | null>(null);
  const resolvedSelectedKind = selectedKind && pieceKinds.includes(selectedKind) ? selectedKind : pieceKinds[0];
  const pieceGuide = getPieceGuide(resolvedSelectedKind);
  const pieceDefinition = getPieceDefinition(resolvedSelectedKind);

  return (
    <ModalDialog
      eyebrow="ルール"
      title="軍儀ルール"
      onClose={onClose}
      initialFocusRef={closeButtonRef}
      headerActions={
        <button ref={closeButtonRef} type="button" className="rule-button" onClick={onClose}>
          閉じる
        </button>
      }
    >
      <div className="rule-tab-row">
        {RULE_GUIDE_ORDER.map((tabId) => (
          <button
            type="button"
            key={tabId}
            className={activeTab === tabId ? 'rule-tab-button active' : 'rule-tab-button'}
            onClick={() => onSelectTab(tabId)}
          >
            {RULE_GUIDES[tabId].label}
          </button>
        ))}
      </div>

      <p className="modal-lead">{currentGuide.lead}</p>

      <div className="modal-sections">
        {currentGuide.sections.map((section) => (
          <section key={section.title} className="modal-section">
            <h3>{section.title}</h3>
            <ul className="modal-list">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}

        <section className="modal-section">
          <div className="section-heading">
            <h3>駒の動きプレビュー</h3>
            <span className="piece-insight-badge">{previewRuleset.name}</span>
          </div>

          <div className="piece-picker-grid">
            {pieceKinds.map((kind) => (
              <button
                key={kind}
                type="button"
                className={resolvedSelectedKind === kind ? 'piece-picker-button active' : 'piece-picker-button'}
                onClick={() => setSelectedKind(kind)}
              >
                {getPieceDefinition(kind).label}
              </button>
            ))}
          </div>

          <div className="rule-guide-piece-layout">
            <div className="rule-guide-piece-copy">
              <strong>{pieceDefinition.label}</strong>
              <p className="muted">{pieceGuide.summary}</p>
              <ul className="modal-list compact-list">
                {pieceGuide.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
              <ul className="modal-list compact-list">
                {pieceGuide.specialNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>

            <PieceMovementPreview kind={resolvedSelectedKind} maxTier={previewRuleset.maxStackHeight} />
          </div>
        </section>
      </div>
    </ModalDialog>
  );
}
