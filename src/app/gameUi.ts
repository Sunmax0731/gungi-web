import { getPieceDefinition } from '../game/pieces';
import { type GameMove, type PieceKind, type Player, type RulesetId, type VictoryReason } from '../game/types';

export const HAND_KIND_ORDER: PieceKind[] = [
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
];

export type RuleGuideId = 'introductory' | 'beginner' | 'intermediate' | 'advanced';

export interface RuleGuide {
  label: string;
  title: string;
  lead: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
}

export const RULE_GUIDE_ORDER: RuleGuideId[] = ['introductory', 'beginner', 'intermediate', 'advanced'];

export const RULE_GUIDES: Record<RuleGuideId, RuleGuide> = {
  introductory: {
    label: '入門編',
    title: '入門編ルール',
    lead: '基本の固定配置で遊ぶための最小構成です。初期配置と手駒からの新を覚える導入に向いています。',
    sections: [
      {
        title: '進行',
        items: [
          '自分の手番では盤上の駒を動かすか、手駒から新を行います。',
          '固定配置の対局はすぐ戦闘フェーズから開始します。',
        ],
      },
      {
        title: '勝敗',
        items: [
          '相手の帥を取ると勝ちです。',
          '相手を詰みにした場合や、相手が投了した場合も勝ちになります。',
        ],
      },
    ],
  },
  beginner: {
    label: '初級編',
    title: '初級編ルール',
    lead: '固定初期配置から始まる基本ルールです。スタック上限は 2 段で、特殊駒は使いません。',
    sections: [
      {
        title: '開始時',
        items: [
          '画像ベースで調整した初級編の固定配置から対局を開始します。',
          '手駒には小・槍・馬・忍・兵を 1 枚ずつ残しています。',
        ],
      },
      {
        title: '基本ルール',
        items: [
          '盤上の駒を動かすか、手駒から新を行えます。',
          '帥は盤外に出せず、敵駒に取られる位置へ自分から動けません。',
          '移動先に複数の手がある場合は候補アクションから選択します。',
        ],
      },
      {
        title: '勝敗',
        items: [
          '相手の帥を取ると勝ちです。',
          '詰みにした場合も勝利になります。',
          '投了でも決着します。',
        ],
      },
    ],
  },
  intermediate: {
    label: '中級編',
    title: '中級編ルール',
    lead: '初級編から駒種や重ね方を広げる拡張段階です。現状の実装ではガイド表示のみ用意しています。',
    sections: [
      {
        title: '位置づけ',
        items: [
          '初級編と上級編の差分を整理するためのガイド用タブです。',
          '自由配置や特殊駒の運用を理解する前段階として参照できます。',
        ],
      },
      {
        title: '実装状況',
        items: [
          '現行のルールエンジンでは中級編専用 ruleset は未実装です。',
          'UI とルールエンジンは ruleset 差し替え前提の構造に整理しています。',
        ],
      },
    ],
  },
  advanced: {
    label: '上級編',
    title: '上級編ルール',
    lead: '自由初期配置、3 段スタック、特殊駒を含む上級ルールです。商品版の拡張差分を吸収できる構造で実装しています。',
    sections: [
      {
        title: '初期配置',
        items: [
          '各自 3 段までの自由配置で対局準備を行います。',
          '相手より先に準備完了しても、相手の「上がり」を待って対局開始します。',
          '後手の準備完了で戦闘フェーズへ移行します。',
        ],
      },
      {
        title: '特殊駒',
        items: [
          'スタック上限は 3 段です。',
          '弓・筒・謀などの特殊駒は ruleset と移動定義で切り替えます。',
          '謀は寝返りを扱えます。',
        ],
      },
      {
        title: '注意点',
        items: [
          '新は配置条件を満たしたマスにのみ行えます。',
          '高い段差へのツケや取りは制限されます。',
          '詰み、捕獲、投了で決着します。',
        ],
      },
    ],
  },
};

export function getDefaultRuleGuideId(rulesetId: RulesetId): RuleGuideId {
  return rulesetId === 'advanced' ? 'advanced' : 'beginner';
}

export function moveActionLabel(move: GameMove): string {
  if (move.type === 'capture') {
    return '取る';
  }
  if (move.type === 'stack') {
    return 'ツケ';
  }
  if (move.type === 'betray') {
    return '寝返り';
  }
  if (move.type === 'drop') {
    return '新';
  }
  if (move.type === 'deploy') {
    return '配置';
  }
  if (move.type === 'move') {
    return '移動';
  }
  if (move.type === 'ready') {
    return '上がり';
  }
  return '投了';
}

export function handSelectionText(kind: PieceKind, inSetup: boolean): string {
  return `${inSetup ? '配置候補' : '手駒候補'}: ${getPieceDefinition(kind).label}`;
}

export function boardSelectionText(kind: PieceKind): string {
  return `選択中: ${getPieceDefinition(kind).label}`;
}

export function playerLabel(player: Player, humanPlayer: Player = 'south'): string {
  if (player === humanPlayer) {
    return 'あなた';
  }
  return 'CPU';
}

export function victoryReasonText(reason: VictoryReason | null): string {
  if (reason === 'capture') {
    return '帥の捕獲';
  }
  if (reason === 'checkmate') {
    return '詰み';
  }
  if (reason === 'resign') {
    return '投了';
  }
  return '対局終了';
}
