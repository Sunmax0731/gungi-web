import { useRef } from 'react';
import { formatClockDuration } from '../../app/gameUi';
import { type SaveSlotSummary } from '../../game/storage';
import { ModalDialog } from './ModalDialog';

interface SaveManagerDialogProps {
  autosaveSummary: SaveSlotSummary | null;
  exportText: string;
  importError: string | null;
  importText: string;
  onChangeImportText: (value: string) => void;
  onClearAll: () => void;
  onClose: () => void;
  onCopyExport: () => void;
  onDeleteSlot: (slotId: string) => void;
  onImport: () => void;
  onLoadSlot: (slotId: string) => void;
  onRefreshExport: () => void;
  onSaveSlot: (slotId: string) => void;
  slots: SaveSlotSummary[];
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '未保存';
  }

  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function formatSummary(summary: SaveSlotSummary | null): string {
  if (!summary || !summary.updatedAt) {
    return 'データなし';
  }

  return [
    summary.rulesetId === 'advanced' ? '上級編' : '初級編',
    summary.phase === 'setup' ? '配置中' : '対局中',
    `手数 ${summary.moveCount ?? 0}`,
    `対局時間 ${formatClockDuration(summary.matchElapsedMs ?? 0)}`,
  ].join(' / ');
}

export function SaveManagerDialog({
  autosaveSummary,
  exportText,
  importError,
  importText,
  onChangeImportText,
  onClearAll,
  onClose,
  onCopyExport,
  onDeleteSlot,
  onImport,
  onLoadSlot,
  onRefreshExport,
  onSaveSlot,
  slots,
}: SaveManagerDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      eyebrow="保存"
      title="保存管理"
      onClose={onClose}
      initialFocusRef={closeButtonRef}
      panelClassName="modal-panel-wide"
      headerActions={
        <button ref={closeButtonRef} type="button" className="rule-button" onClick={onClose}>
          閉じる
        </button>
      }
    >
      <div className="modal-sections">
        <section className="modal-section">
          <div className="section-heading">
            <h3>現在の自動保存</h3>
            <button type="button" className="rule-button" onClick={onClearAll}>
              すべて削除
            </button>
          </div>
          <p className="modal-lead">{formatSummary(autosaveSummary)}</p>
          <p className="section-note">{formatTimestamp(autosaveSummary?.updatedAt ?? null)}</p>
        </section>

        <section className="modal-section">
          <h3>保存スロット</h3>
          <div className="save-slot-grid">
            {slots.map((slot) => (
              <article key={slot.id} className="save-slot-card">
                <div className="save-slot-copy">
                  <strong>{slot.label}</strong>
                  <span>{formatSummary(slot)}</span>
                  <span>{formatTimestamp(slot.updatedAt)}</span>
                </div>
                <div className="save-slot-actions">
                  <button type="button" className="rule-button" onClick={() => onSaveSlot(slot.id)}>
                    {slot.updatedAt ? '上書き保存' : '保存'}
                  </button>
                  <button
                    type="button"
                    className="rule-button"
                    disabled={!slot.updatedAt}
                    onClick={() => onLoadSlot(slot.id)}
                  >
                    読み込む
                  </button>
                  <button
                    type="button"
                    className="rule-button secondary"
                    disabled={!slot.updatedAt}
                    onClick={() => onDeleteSlot(slot.id)}
                  >
                    削除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="modal-section">
          <div className="section-heading">
            <h3>局面エクスポート</h3>
            <div className="modal-toolbar-actions">
              <button type="button" className="rule-button" onClick={onRefreshExport}>
                更新
              </button>
              <button type="button" className="rule-button" onClick={onCopyExport}>
                コピー
              </button>
            </div>
          </div>
          <textarea
            className="save-textarea"
            readOnly
            spellCheck={false}
            value={exportText}
          />
        </section>

        <section className="modal-section">
          <h3>局面インポート</h3>
          <textarea
            className="save-textarea"
            spellCheck={false}
            value={importText}
            onChange={(event) => onChangeImportText(event.target.value)}
          />
          {importError ? <p className="error-text">{importError}</p> : null}
          <div className="modal-action-row">
            <button type="button" className="settings-button" onClick={onImport}>
              この内容を読み込む
            </button>
          </div>
        </section>
      </div>
    </ModalDialog>
  );
}
