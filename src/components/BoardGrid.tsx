import { useMemo, useRef } from 'react';
import { compareCoords, coordLabel, getStack, listCoords } from '../game/board';
import { getPieceDefinition } from '../game/pieces';
import { type Coord, type GameMove, type GameState } from '../game/types';

interface BoardGridProps {
  state: GameState;
  selectedSquare: Coord | null;
  highlightedMoves: GameMove[];
  onSquareClick: (coord: Coord) => void;
}

function markerPriority(type: GameMove['type']): number {
  if (type === 'betray') {
    return 5;
  }
  if (type === 'capture') {
    return 4;
  }
  if (type === 'stack') {
    return 3;
  }
  if (type === 'drop' || type === 'deploy') {
    return 2;
  }
  if (type === 'move') {
    return 1;
  }
  return 0;
}

function markerLabel(type: GameMove['type']): string {
  if (type === 'betray') {
    return '寝返り';
  }
  if (type === 'capture') {
    return '捕獲';
  }
  if (type === 'stack') {
    return 'ツケ';
  }
  if (type === 'drop') {
    return '新';
  }
  if (type === 'deploy') {
    return '配置';
  }
  return '移動';
}

export function BoardGrid({ state, selectedSquare, highlightedMoves, onSquareClick }: BoardGridProps) {
  const cellRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const moveMarkers = useMemo(() => {
    const map = new Map<string, GameMove['type']>();

    for (const move of highlightedMoves) {
      if (move.type === 'resign' || move.type === 'ready') {
        continue;
      }
      const key = `${move.to.x},${move.to.y}`;
      const current = map.get(key);
      if (!current || markerPriority(move.type) > markerPriority(current)) {
        map.set(key, move.type);
      }
    }

    return map;
  }, [highlightedMoves]);

  return (
    <div className="board-grid-shell">
      <div className="board-grid-label-row board-grid-label-row-top" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={`top-${index}`}>{index + 1}</span>
        ))}
      </div>
      <div className="board-grid-layout">
        <div className="board-grid-label-column" aria-hidden="true">
          {Array.from({ length: 9 }, (_, index) => (
            <span key={`left-${index}`}>{String.fromCharCode(65 + index)}</span>
          ))}
        </div>
        <div className="board-grid" data-testid="board-grid" role="grid" aria-label="盤面">
          {listCoords().map((coord) => {
            const stack = getStack(state.board, coord);
            const top = stack.at(-1) ?? null;
            const marker = moveMarkers.get(`${coord.x},${coord.y}`) ?? null;
            const selected = selectedSquare ? compareCoords(coord, selectedSquare) : false;
            const key = `${coord.x},${coord.y}`;

            const cellLabel = [
              coordLabel(coord),
              top ? `${top.owner === 'south' ? '先手' : '後手'} ${getPieceDefinition(top.kind).label}` : '空きマス',
              stack.length > 1 ? `${stack.length}段` : null,
              marker ? `${markerLabel(marker)}可能` : null,
              selected ? '選択中' : null,
            ]
              .filter(Boolean)
              .join(' / ');

            return (
              <button
                type="button"
                key={key}
                data-testid={`board-cell-${coord.x}-${coord.y}`}
                ref={(element) => {
                  cellRefs.current.set(key, element);
                }}
                className={[
                  'board-grid-cell',
                  selected ? 'selected' : '',
                  marker ? `marker-${marker}` : '',
                  top ? `owner-${top.owner}` : 'empty',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={cellLabel}
                onClick={() => onSquareClick(coord)}
                onKeyDown={(event) => {
                  let nextCoord: Coord | null = null;

                  if (event.key === 'ArrowUp') {
                    nextCoord = { x: coord.x, y: Math.max(0, coord.y - 1) };
                  } else if (event.key === 'ArrowDown') {
                    nextCoord = { x: coord.x, y: Math.min(8, coord.y + 1) };
                  } else if (event.key === 'ArrowLeft') {
                    nextCoord = { x: Math.max(0, coord.x - 1), y: coord.y };
                  } else if (event.key === 'ArrowRight') {
                    nextCoord = { x: Math.min(8, coord.x + 1), y: coord.y };
                  }

                  if (!nextCoord) {
                    return;
                  }

                  event.preventDefault();
                  cellRefs.current.get(`${nextCoord.x},${nextCoord.y}`)?.focus();
                }}
              >
                <span className="board-grid-cell-coord">{coordLabel(coord)}</span>
                {top ? (
                  <>
                    <span className="board-grid-owner">{top.owner === 'south' ? '先' : '後'}</span>
                    <strong className="board-grid-piece">{getPieceDefinition(top.kind).shortLabel}</strong>
                    <span className="board-grid-kind">{getPieceDefinition(top.kind).label}</span>
                  </>
                ) : (
                  <span className="board-grid-empty">-</span>
                )}
                {stack.length > 1 ? <span className="board-grid-stack">{stack.length}段</span> : null}
                {marker ? <span className="board-grid-marker">{markerLabel(marker)}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
