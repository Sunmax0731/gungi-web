import { useState } from 'react';
import { getMovementPreviewTargets, getPreviewBoardRadius } from '../game/movement-preview';
import { type PieceKind } from '../game/types';

interface PieceMovementPreviewProps {
  kind: PieceKind;
  maxTier: 2 | 3;
}

export function PieceMovementPreview({ kind, maxTier }: PieceMovementPreviewProps) {
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const clampedTier = Math.min(tier, maxTier) as 1 | 2 | 3;
  const markers = getMovementPreviewTargets(kind, clampedTier);
  const markerSet = new Set(markers.map((marker) => `${marker.x},${marker.y}`));
  const radius = getPreviewBoardRadius();
  const rows = Array.from({ length: radius * 2 + 1 }, (_, rowIndex) => radius - rowIndex);
  const cols = Array.from({ length: radius * 2 + 1 }, (_, colIndex) => colIndex - radius);

  return (
    <div className="movement-preview">
      <div className="movement-preview-toolbar">
        <span>段数</span>
        <div className="movement-preview-tier-row" role="tablist" aria-label="移動プレビュー段数">
          {[1, 2, 3]
            .filter((value) => value <= maxTier)
            .map((value) => (
              <button
                key={value}
                type="button"
                className={clampedTier === value ? 'movement-tier-button active' : 'movement-tier-button'}
                onClick={() => setTier(value as 1 | 2 | 3)}
              >
                {value}段
              </button>
            ))}
        </div>
      </div>

      <div className="movement-grid" aria-label="駒の移動範囲">
        {rows.map((row) =>
          cols.map((col) => {
            const key = `${col},${row}`;
            const isOrigin = col === 0 && row === 0;
            const isTarget = markerSet.has(key);
            return (
              <div
                key={key}
                className={[
                  'movement-cell',
                  isOrigin ? 'origin' : '',
                  isTarget ? 'target' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {isOrigin ? '自' : ''}
              </div>
            );
          }),
        )}
      </div>

      <div className="movement-preview-legend">
        <span>
          <i className="movement-legend-swatch origin" />
          自駒
        </span>
        <span>
          <i className="movement-legend-swatch target" />
          移動可能
        </span>
        <span>南側の向きで表示</span>
      </div>
    </div>
  );
}
