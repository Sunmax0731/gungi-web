import { BOARD_SIZE, type Coord, type PieceKind } from './types';
import { getPieceDefinition } from './pieces';

export interface PreviewMarker extends Coord {
  type: 'move';
}

function getTierIndex(tier: number): 0 | 1 | 2 {
  if (tier >= 3) {
    return 2;
  }
  if (tier === 2) {
    return 1;
  }
  return 0;
}

export function getMovementPreviewTargets(kind: PieceKind, tier: number): PreviewMarker[] {
  const definition = getPieceDefinition(kind);
  const tierIndex = getTierIndex(tier);
  const markers = new Map<string, PreviewMarker>();

  for (const vector of definition.movement) {
    const minStep = vector.minByTier?.[tierIndex] ?? 1;
    const maxStep = vector.maxByTier[tierIndex];
    const originShift = vector.originShift ?? { dx: 0, dy: 0 };

    for (let step = minStep; step <= maxStep; step += 1) {
      const coord = {
        x: originShift.dx + vector.dx * step,
        y: originShift.dy + vector.dy * step,
      };
      markers.set(`${coord.x},${coord.y}`, { ...coord, type: 'move' });
    }
  }

  return [...markers.values()];
}

export function getPreviewBoardRadius(): number {
  return Math.floor(BOARD_SIZE / 2);
}
