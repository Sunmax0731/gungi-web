import { useRef } from 'react';
import { RULE_GUIDES, RULE_GUIDE_ORDER, type RuleGuideId } from '../../app/gameUi';
import { ModalDialog } from './ModalDialog';

interface RuleGuideDialogProps {
  activeTab: RuleGuideId;
  onSelectTab: (tab: RuleGuideId) => void;
  onClose: () => void;
}

export function RuleGuideDialog({ activeTab, onSelectTab, onClose }: RuleGuideDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const currentGuide = RULE_GUIDES[activeTab];

  return (
    <ModalDialog
      eyebrow="Rule Guide"
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
      </div>
    </ModalDialog>
  );
}
