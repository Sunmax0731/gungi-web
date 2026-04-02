import { BOARD_SIZE, type PieceDefinition, type PieceKind } from './types';

function grow(base: number): readonly [number, number, number] {
  return [base, base + 1, base + 2] as const;
}

function fixed(distance: number): readonly [number, number, number] {
  return [distance, distance, distance] as const;
}

const unlimited = fixed(BOARD_SIZE - 1);

export const STANDARD_INVENTORY: Record<PieceKind, number> = {
  marshal: 1,
  general: 1,
  lieutenant: 1,
  minor: 2,
  samurai: 2,
  spear: 3,
  horse: 2,
  shinobi: 2,
  fortress: 2,
  soldier: 4,
  bow: 2,
  cylinder: 1,
  cannon: 1,
  tactician: 1,
};

export const PIECE_DEFINITIONS: Record<PieceKind, PieceDefinition> = {
  marshal: {
    kind: 'marshal',
    label: '帥',
    shortLabel: '帥',
    value: 10_000,
    tags: ['royal'],
    movement: [
      { dx: -1, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: -1, maxByTier: grow(1) },
      { dx: 1, dy: -1, maxByTier: grow(1) },
      { dx: -1, dy: 0, maxByTier: grow(1) },
      { dx: 1, dy: 0, maxByTier: grow(1) },
      { dx: -1, dy: 1, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
      { dx: 1, dy: 1, maxByTier: grow(1) },
    ],
  },
  general: {
    kind: 'general',
    label: '大',
    shortLabel: '大',
    value: 900,
    tags: ['major'],
    movement: [
      { dx: -1, dy: 0, maxByTier: unlimited },
      { dx: 1, dy: 0, maxByTier: unlimited },
      { dx: 0, dy: -1, maxByTier: unlimited },
      { dx: 0, dy: 1, maxByTier: unlimited },
      { dx: -1, dy: -1, maxByTier: grow(1) },
      { dx: 1, dy: -1, maxByTier: grow(1) },
      { dx: -1, dy: 1, maxByTier: grow(1) },
      { dx: 1, dy: 1, maxByTier: grow(1) },
    ],
  },
  lieutenant: {
    kind: 'lieutenant',
    label: '中',
    shortLabel: '中',
    value: 860,
    tags: ['major'],
    movement: [
      { dx: -1, dy: -1, maxByTier: unlimited },
      { dx: 1, dy: -1, maxByTier: unlimited },
      { dx: -1, dy: 1, maxByTier: unlimited },
      { dx: 1, dy: 1, maxByTier: unlimited },
      { dx: -1, dy: 0, maxByTier: grow(1) },
      { dx: 1, dy: 0, maxByTier: grow(1) },
      { dx: 0, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
  minor: {
    kind: 'minor',
    label: '小',
    shortLabel: '小',
    value: 420,
    tags: ['support'],
    movement: [
      { dx: -1, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: -1, maxByTier: grow(1) },
      { dx: 1, dy: -1, maxByTier: grow(1) },
      { dx: -1, dy: 0, maxByTier: grow(1) },
      { dx: 1, dy: 0, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
  samurai: {
    kind: 'samurai',
    label: '侍',
    shortLabel: '侍',
    value: 380,
    tags: ['frontline'],
    movement: [
      { dx: -1, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: -1, maxByTier: grow(1) },
      { dx: 1, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
  spear: {
    kind: 'spear',
    label: '槍',
    shortLabel: '槍',
    value: 430,
    tags: ['frontline'],
    movement: [
      { dx: -1, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: -1, maxByTier: [2, 3, 4] },
      { dx: 1, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
  horse: {
    kind: 'horse',
    label: '馬',
    shortLabel: '馬',
    value: 520,
    tags: ['runner'],
    movement: [
      { dx: 0, dy: -1, maxByTier: [2, 3, 4] },
      { dx: -1, dy: 0, maxByTier: grow(1) },
      { dx: 1, dy: 0, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: [2, 3, 4] },
    ],
  },
  shinobi: {
    kind: 'shinobi',
    label: '忍',
    shortLabel: '忍',
    value: 500,
    tags: ['runner'],
    movement: [
      { dx: -1, dy: -1, maxByTier: [2, 3, 4] },
      { dx: 1, dy: -1, maxByTier: [2, 3, 4] },
      { dx: -1, dy: 1, maxByTier: [2, 3, 4] },
      { dx: 1, dy: 1, maxByTier: [2, 3, 4] },
    ],
  },
  fortress: {
    kind: 'fortress',
    label: '砦',
    shortLabel: '砦',
    value: 390,
    tags: ['support'],
    movement: [
      { dx: 0, dy: -1, maxByTier: grow(1) },
      { dx: -1, dy: 0, maxByTier: grow(1) },
      { dx: 1, dy: 0, maxByTier: grow(1) },
      { dx: -1, dy: 1, maxByTier: grow(1) },
      { dx: 1, dy: 1, maxByTier: grow(1) },
    ],
  },
  soldier: {
    kind: 'soldier',
    label: '兵',
    shortLabel: '兵',
    value: 240,
    tags: ['basic'],
    movement: [
      { dx: 0, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
  bow: {
    kind: 'bow',
    label: '弓',
    shortLabel: '弓',
    value: 460,
    tags: ['special', 'jump'],
    movement: [
      {
        dx: -1,
        dy: -1,
        maxByTier: grow(1),
        originShift: { dx: 0, dy: -1 },
        jumpOverOrigin: true,
      },
      {
        dx: 0,
        dy: -1,
        maxByTier: grow(1),
        originShift: { dx: 0, dy: -1 },
        jumpOverOrigin: true,
      },
      {
        dx: 1,
        dy: -1,
        maxByTier: grow(1),
        originShift: { dx: 0, dy: -1 },
        jumpOverOrigin: true,
      },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
  cylinder: {
    kind: 'cylinder',
    label: '筒',
    shortLabel: '筒',
    value: 500,
    tags: ['special', 'jump'],
    movement: [
      { dx: 0, dy: -1, minByTier: [2, 2, 2], maxByTier: [2, 3, 4], leap: true },
      { dx: -1, dy: 1, maxByTier: grow(1) },
      { dx: 1, dy: 1, maxByTier: grow(1) },
    ],
  },
  cannon: {
    kind: 'cannon',
    label: '砲',
    shortLabel: '砲',
    value: 540,
    tags: ['special', 'jump'],
    movement: [
      { dx: 0, dy: -1, minByTier: [3, 3, 3], maxByTier: [3, 4, 5], leap: true },
      { dx: -1, dy: 0, maxByTier: grow(1) },
      { dx: 1, dy: 0, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
  tactician: {
    kind: 'tactician',
    label: '謀',
    shortLabel: '謀',
    value: 650,
    tags: ['special'],
    movement: [
      { dx: -1, dy: -1, maxByTier: grow(1) },
      { dx: 1, dy: -1, maxByTier: grow(1) },
      { dx: 0, dy: 1, maxByTier: grow(1) },
    ],
  },
};

export function getPieceDefinition(kind: PieceKind): PieceDefinition {
  return PIECE_DEFINITIONS[kind];
}
