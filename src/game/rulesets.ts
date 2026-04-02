import { STANDARD_INVENTORY } from './pieces';
import { type Ruleset, type RulesetId, type SetupPreset } from './types';

const beginnerSetup: SetupPreset = {
  kind: 'fixed',
  id: 'beginner-fixed',
  name: '初級編の固定配置',
  description:
    '初級編の固定配置です。商品版画像を基準に調整しつつ、手駒からの「新」を試せるよう小・槍・馬・忍・兵を 1 枚ずつ残しています。',
  southPlacements: [
    { coord: { x: 3, y: 8 }, pieces: ['general'] },
    { coord: { x: 4, y: 8 }, pieces: ['marshal'] },
    { coord: { x: 5, y: 8 }, pieces: ['lieutenant'] },
    { coord: { x: 2, y: 7 }, pieces: ['shinobi'] },
    { coord: { x: 3, y: 7 }, pieces: ['spear'] },
    { coord: { x: 4, y: 7 }, pieces: ['minor'] },
    { coord: { x: 5, y: 7 }, pieces: ['spear'] },
    { coord: { x: 6, y: 7 }, pieces: ['horse'] },
    { coord: { x: 0, y: 6 }, pieces: ['soldier'] },
    { coord: { x: 2, y: 6 }, pieces: ['fortress'] },
    { coord: { x: 3, y: 6 }, pieces: ['samurai'] },
    { coord: { x: 4, y: 6 }, pieces: ['soldier'] },
    { coord: { x: 5, y: 6 }, pieces: ['samurai'] },
    { coord: { x: 6, y: 6 }, pieces: ['fortress'] },
    { coord: { x: 8, y: 6 }, pieces: ['soldier'] },
  ],
};

const advancedSetup: SetupPreset = {
  kind: 'free',
  id: 'advanced-free',
  name: '上級編の自由初期配置',
  description:
    '上級編は各自 3 段までの自由初期配置で対局準備を行います。後手の「上がり」で戦闘フェーズへ移行します。',
  deploymentRows: 3,
  allowStacking: true,
  preferredPlacements: [
    { coord: { x: 0, y: 8 }, pieces: ['fortress'] },
    { coord: { x: 1, y: 8 }, pieces: ['horse'] },
    { coord: { x: 2, y: 8 }, pieces: ['samurai'] },
    { coord: { x: 3, y: 8 }, pieces: ['general'] },
    { coord: { x: 4, y: 8 }, pieces: ['marshal'] },
    { coord: { x: 5, y: 8 }, pieces: ['lieutenant'] },
    { coord: { x: 6, y: 8 }, pieces: ['samurai'] },
    { coord: { x: 7, y: 8 }, pieces: ['horse'] },
    { coord: { x: 8, y: 8 }, pieces: ['fortress'] },
    { coord: { x: 2, y: 7 }, pieces: ['spear'] },
    { coord: { x: 3, y: 7 }, pieces: ['minor'] },
    { coord: { x: 4, y: 7 }, pieces: ['soldier'] },
    { coord: { x: 5, y: 7 }, pieces: ['minor'] },
    { coord: { x: 6, y: 7 }, pieces: ['spear'] },
    { coord: { x: 3, y: 6 }, pieces: ['bow'] },
    { coord: { x: 5, y: 6 }, pieces: ['cannon'] },
  ],
};

export const RULESETS: Record<RulesetId, Ruleset> = {
  beginner: {
    id: 'beginner',
    name: '初級編',
    description: '固定配置、特殊駒なし、最大 2 段スタックの基本ルールです。',
    maxStackHeight: 2,
    allowMarshalStacking: false,
    allowDropStacking: false,
    availableKinds: [
      'marshal',
      'general',
      'lieutenant',
      'minor',
      'samurai',
      'spear',
      'horse',
      'shinobi',
      'fortress',
      'soldier',
    ],
    inventory: {
      ...STANDARD_INVENTORY,
      bow: 0,
      cylinder: 0,
      cannon: 0,
      tactician: 0,
    },
    setup: beginnerSetup,
  },
  advanced: {
    id: 'advanced',
    name: '上級編',
    description: '自由初期配置、特殊駒あり、最大 3 段スタック対応の上級ルールです。',
    maxStackHeight: 3,
    allowMarshalStacking: true,
    allowDropStacking: true,
    availableKinds: [
      'marshal',
      'general',
      'lieutenant',
      'minor',
      'samurai',
      'spear',
      'horse',
      'shinobi',
      'fortress',
      'soldier',
      'bow',
      'cylinder',
      'cannon',
      'tactician',
    ],
    inventory: { ...STANDARD_INVENTORY },
    setup: advancedSetup,
  },
};

export function getRuleset(rulesetId: RulesetId): Ruleset {
  return RULESETS[rulesetId];
}
