import { getPieceDefinition } from '../game/pieces';
import { getRuleset } from '../game/rulesets';
import { type PieceKind, type RulesetId } from '../game/types';

interface PieceGuideMeta {
  summary: string;
  tips: string[];
  specialNotes: string[];
}

const PIECE_GUIDES: Record<PieceKind, PieceGuideMeta> = {
  marshal: {
    summary: '全方向へ動ける要の駒です。失うと敗北なので、常に守りと退路を意識します。',
    tips: ['序盤は前に出しすぎず、周囲の駒で受けを作ると安定します。'],
    specialNotes: ['段が上がると全方向の到達距離が伸びます。'],
  },
  general: {
    summary: '縦横に長く利く主力です。横の圧力で盤面を制圧します。',
    tips: ['前衛の後ろから射線を通し、中央の制圧に使うと強力です。'],
    specialNotes: ['斜めは短く、縦横は遠くまで届きます。'],
  },
  lieutenant: {
    summary: '斜めに長く利く主力です。大将と役割を分けると攻守が締まります。',
    tips: ['角筋を通しやすい配置にすると相手の退路を削れます。'],
    specialNotes: ['斜めは遠距離、縦横は短距離です。'],
  },
  minor: {
    summary: '前進と横移動に強い支援駒です。帥の前後を固める役に向きます。',
    tips: ['前線の隙間を埋めながら、帥の近くも支えやすい駒です。'],
    specialNotes: ['後ろ斜め以外を広く支えます。'],
  },
  samurai: {
    summary: '前方への圧力が高い前衛駒です。押し込みと壁役を両立します。',
    tips: ['中央付近に置くと前進ラインを作りやすくなります。'],
    specialNotes: ['前3方向と後ろ1方向へ動きます。'],
  },
  spear: {
    summary: '前方突破向けの駒です。段が上がるほど正面突破力が伸びます。',
    tips: ['縦の射程を活かして、通路を開けてから使うと強いです。'],
    specialNotes: ['正面だけ 2〜4 マスまで伸びます。'],
  },
  horse: {
    summary: '縦方向に長い機動力を持つ駒です。列の入れ替えに向きます。',
    tips: ['端より中央寄りに置くと往復しやすくなります。'],
    specialNotes: ['前後に長く、左右は短く動きます。'],
  },
  shinobi: {
    summary: '斜め方向の機動に優れた駒です。すり抜けるような攻め筋を作ります。',
    tips: ['敵陣の角を狙い、守りの薄いラインを突くのが有効です。'],
    specialNotes: ['4方向の斜めへ 2〜4 マス動けます。'],
  },
  fortress: {
    summary: '守りを固めやすい支援駒です。帥の周囲の受けに向いています。',
    tips: ['帥の横や後方斜めに置くと守備網が崩れにくくなります。'],
    specialNotes: ['前・横・後ろ斜めを支えます。'],
  },
  soldier: {
    summary: '最も基本的な駒です。前線の厚みを作り、段差の起点にもなります。',
    tips: ['序盤は前進よりも、守備や積み上げの土台として使うと安定します。'],
    specialNotes: ['前後に素直に動きます。'],
  },
  bow: {
    summary: '前方1マス先を基点に射線を伸ばす特殊駒です。形を作ると強いです。',
    tips: ['正面に味方がいる配置で真価を発揮します。'],
    specialNotes: ['正面1マス先を飛び越えて斜め前・前へ利きます。'],
  },
  cylinder: {
    summary: '近距離を飛び越えて進む特殊駒です。段が上がると到達距離も伸びます。',
    tips: ['前に味方がいても飛び越えられるため、縦の奇襲に使えます。'],
    specialNotes: ['前へ 2〜4 マスの跳躍移動です。'],
  },
  cannon: {
    summary: '筒よりさらに遠くへ跳ぶ長射程駒です。通した時の圧力が高いです。',
    tips: ['縦筋を整理しておくと、相手に常時プレッシャーをかけられます。'],
    specialNotes: ['前へ 3〜5 マスの跳躍移動です。'],
  },
  tactician: {
    summary: '上級編の特殊駒です。寝返りで相手駒を取り込む軸になります。',
    tips: ['必要な持ち駒があるときに、味方を重ねた敵スタックを狙うと有効です。'],
    specialNotes: ['寝返りは必要枚数の同種持ち駒がある時だけ使えます。'],
  },
};

export function getPieceGuide(kind: PieceKind): PieceGuideMeta {
  return PIECE_GUIDES[kind];
}

export function getRulesetPieceKinds(rulesetId: RulesetId): PieceKind[] {
  return [...getRuleset(rulesetId).availableKinds];
}

export function getPieceGuideHeading(kind: PieceKind): string {
  const definition = getPieceDefinition(kind);
  return `${definition.label} ${definition.kind}`;
}
