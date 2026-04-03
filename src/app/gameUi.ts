import { getPieceDefinition } from '../game/pieces';
import { type CpuLevel, type GameMove, type PieceKind, type Player, type RulesetId, type VictoryReason } from '../game/types';

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

export type RuleGuideId = 'glossary' | 'introductory' | 'beginner' | 'intermediate' | 'advanced';

export interface RuleGuide {
  label: string;
  title: string;
  lead: string;
  sections: Array<{
    title: string;
    items: string[];
  }>;
}

export const RULE_GUIDE_ORDER: RuleGuideId[] = ['glossary', 'introductory', 'beginner', 'intermediate', 'advanced'];

export const RULE_GUIDES: Record<RuleGuideId, RuleGuide> = {
  glossary: {
    label: '用語集',
    title: '軍儀 用語集',
    lead: 'ルール画面で頻出する用語を簡潔にまとめています。対局中に迷ったときの参照用です。',
    sections: [
      {
        title: '基本用語',
        items: [
          '帥: 最重要の駒です。相手に取られると敗北になります。',
          '手駒: まだ盤上に出していない駒です。条件を満たせば盤上へ「新」できます。',
          '新: 手駒から盤上へ駒を出す行為です。',
          'ツケ: すでにある自軍の駒の上に重ねる行為です。ルールによって上限段数が異なります。',
          '寝返り: 特定の条件で相手の駒を自軍として取り込む上級編の特殊手です。',
        ],
      },
      {
        title: '勝敗に関わる用語',
        items: [
          '捕獲: 相手の帥を取ることです。',
          '詰み: 次の手で帥が守れない状態です。',
          '投了: 自分から敗北を認めて対局を終えることです。',
          '脅威あり: 次の相手手で帥が危険になる可能性が高い状態を示します。',
        ],
      },
      {
        title: '画面表示',
        items: [
          '候補アクション: 選択中の駒に対して実行できる手を表示します。',
          '思考系: CPU がワーカーとメインスレッドのどちらで動いているかを示します。',
          '自動対局: 先手CPUと後手CPUが続けて指す観戦モードです。',
        ],
      },
    ],
  },
  introductory: {
    label: '入門編',
    title: '入門編ルール',
    lead: '最小限のルールと駒で軍儀の流れを覚えるための段階です。',
    sections: [
      {
        title: '狙い',
        items: [
          '盤上の駒の動きと、帥を守りながら攻める感覚をつかみます。',
          '本作ではタブとして案内を用意し、初級編以降への理解につなげます。',
        ],
      },
      {
        title: '勝敗',
        items: [
          '相手の帥を取れば勝ちです。',
          '相手を詰ませた場合も勝ちです。',
        ],
      },
    ],
  },
  beginner: {
    label: '初級編',
    title: '初級編ルール',
    lead: '固定初期配置から始まり、最大2段までの重ね置きを扱う基本ルールです。',
    sections: [
      {
        title: '開始時',
        items: [
          '固定配置で対局を開始します。',
          '手駒からの「新」と盤上の移動を組み合わせて帥を攻防します。',
        ],
      },
      {
        title: '対局ルール',
        items: [
          '盤上の駒を移動するか、手駒から新します。',
          '自軍の駒にはツケが可能です。初級編では最大2段です。',
          '候補アクションに複数の手が出た場合は、その中から実行する手を選びます。',
        ],
      },
      {
        title: '勝敗',
        items: [
          '帥を捕獲すると勝利です。',
          '詰みに追い込んでも勝利です。',
          '投了すると敗北になります。',
        ],
      },
    ],
  },
  intermediate: {
    label: '中級編',
    title: '中級編ルール',
    lead: '初級編から上級編へ拡張するための整理タブです。実装差分の見通しを示します。',
    sections: [
      {
        title: '設計方針',
        items: [
          'ルール差分は ruleset で吸収し、applyMove() を唯一の状態更新経路にします。',
          'UI とルールエンジンを分離し、今後の駒追加やルール追加に備えます。',
        ],
      },
      {
        title: '拡張対象',
        items: [
          '自由配置、段数増加、特殊駒、特殊手を順次追加できる構造にします。',
          '表示とルールの両方を保ったまま、中級編相当の差分を収容します。',
        ],
      },
    ],
  },
  advanced: {
    label: '上級編',
    title: '上級編ルール',
    lead: '自由配置、3段スタック、特殊駒と特殊手を含む拡張ルールです。',
    sections: [
      {
        title: '配置フェーズ',
        items: [
          '対局前に自分の陣地3段までで自由に配置します。',
          '帥を配置した後に「配置確定」を押すと、戦闘フェーズへ移ります。',
        ],
      },
      {
        title: '拡張ルール',
        items: [
          'スタック上限は3段です。',
          '弓、筒、砲、謀などの特殊駒が追加されます。',
          '寝返りなど、上級編特有のアクションが候補アクションに現れます。',
        ],
      },
      {
        title: 'CPU と観戦',
        items: [
          '新しい対局だけでなく、自動対局でも上級編を選択できます。',
          'CPU 難度は 初級 / 標準 / 上級 / コムギ の4段階です。',
          '自動対局中は盤面上に CPU の思考ログをオーバーレイ表示します。',
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
    return '配置完了';
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

export function formatClockDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function cpuLevelText(level: CpuLevel): string {
  if (level === 'easy') {
    return '初級';
  }
  if (level === 'komugi') {
    return 'コムギ';
  }
  if (level === 'hard') {
    return '上級';
  }
  return '標準';
}
