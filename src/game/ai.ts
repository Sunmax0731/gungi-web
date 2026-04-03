import { getStack, isInsideBoard, listCoords } from './board';
import { type CpuThoughtReporter } from './cpu-thought';
import {
  applyMove,
  createReadyMove,
  findMarshalCoord,
  generateLegalMoves,
  getOpponent,
  getPlayerMaterial,
  isMarshalThreatened,
} from './engine';
import { getPieceDefinition } from './pieces';
import { getRuleset } from './rulesets';
import { type CpuLevel, type GameMove, type GameState, type PieceKind, type Player, type SearchOptions } from './types';

const ALL_COORDS = listCoords();
const PIECE_KIND_ORDER: PieceKind[] = [
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

interface SearchContext {
  evaluations: WeakMap<GameState, Map<Player, number>>;
  legalMoves: WeakMap<GameState, Map<Player, GameMove[]>>;
  transposition: Map<string, TranspositionEntry>;
  nodes: number;
  deadlineMs: number;
}

interface TranspositionEntry {
  depth: number;
  flag: 'exact' | 'lower' | 'upper';
  score: number;
  bestMove: GameMove | null;
}

interface SearchRootResult {
  completed: boolean;
  move: GameMove | null;
  score: number;
}

export interface ComputeBestMoveOptions {
  onProgress?: CpuThoughtReporter;
}

class SearchTimeoutError extends Error {
  constructor() {
    super('Search timed out');
  }
}

function createSearchContext(timeBudgetMs = Number.POSITIVE_INFINITY): SearchContext {
  return {
    evaluations: new WeakMap(),
    legalMoves: new WeakMap(),
    transposition: new Map(),
    nodes: 0,
    deadlineMs: nowMs() + timeBudgetMs,
  };
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }

  return Date.now();
}

function reportThought(
  onProgress: CpuThoughtReporter | undefined,
  stage: Parameters<CpuThoughtReporter>[0]['stage'],
  message: string,
  detail?: string,
  progress?: number,
) {
  onProgress?.({ stage, message, detail, progress });
}

function cpuLevelLabel(level: CpuLevel): string {
  if (level === 'easy') {
    return '初級';
  }
  if (level === 'hard') {
    return '上級';
  }
  return '標準';
}

function formatMoveSummary(move: GameMove): string {
  if (move.type === 'resign') {
    return '投了';
  }
  if (move.type === 'ready') {
    return '配置完了';
  }

  const pieceLabel = getPieceDefinition(move.pieceKind).label;

  if (move.type === 'drop') {
    return `${pieceLabel}を新`;
  }
  if (move.type === 'deploy') {
    return `${pieceLabel}を配置`;
  }
  if (move.type === 'capture') {
    return `${pieceLabel}で捕獲`;
  }
  if (move.type === 'stack') {
    return `${pieceLabel}でツケ`;
  }
  if (move.type === 'betray') {
    return `${pieceLabel}で寝返り`;
  }

  return `${pieceLabel}を移動`;
}

function moveKey(move: GameMove): string {
  return JSON.stringify(move);
}

function readCache<T>(cache: WeakMap<GameState, Map<Player, T>>, state: GameState, player: Player): T | null {
  return cache.get(state)?.get(player) ?? null;
}

function writeCache<T>(cache: WeakMap<GameState, Map<Player, T>>, state: GameState, player: Player, value: T): T {
  const existing = cache.get(state);
  if (existing) {
    existing.set(player, value);
    return value;
  }

  cache.set(state, new Map([[player, value]]));
  return value;
}

function getLegalMovesCached(context: SearchContext, state: GameState, player: Player): GameMove[] {
  const cached = readCache(context.legalMoves, state, player);
  if (cached) {
    return cached;
  }

  return writeCache(context.legalMoves, state, player, generateLegalMoves(state, player));
}

function scoreMoveHint(move: GameMove): number {
  if (move.type === 'resign') {
    return -999_999;
  }
  if (move.type === 'capture') {
    return 220;
  }
  if (move.type === 'betray') {
    return 190;
  }
  if (move.type === 'stack') {
    return 70;
  }
  if (move.type === 'drop') {
    return 32;
  }
  if (move.type === 'deploy') {
    return 36;
  }
  if (move.type === 'ready') {
    return 8;
  }
  return 14;
}

function serializeState(state: GameState): string {
  const boardKey = state.board
    .map((stack) => stack.map((piece) => `${piece.owner[0]}:${piece.kind}`).join(','))
    .join('|');
  const handsKey = (player: Player) => PIECE_KIND_ORDER.map((kind) => state.hands[player][kind]).join(',');
  return [
    state.rulesetId,
    state.phase,
    state.turn,
    `${Number(state.setupReady.south)}${Number(state.setupReady.north)}`,
    state.winner ?? '-',
    handsKey('south'),
    handsKey('north'),
    boardKey,
  ].join('/');
}

function scoreCentrality(x: number, y: number): number {
  const distance = Math.abs(x - 4) + Math.abs(y - 4);
  return 8 - distance;
}

function evaluateMarshalSafety(state: GameState, player: Player): number {
  const marshalCoord = findMarshalCoord(state, player);
  if (!marshalCoord) {
    return -5_000;
  }

  let score = 0;
  const homeRow = player === 'south' ? 8 : 0;
  score -= Math.abs(marshalCoord.y - homeRow) * 6;

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const coord = { x: marshalCoord.x + dx, y: marshalCoord.y + dy };
      if (!isInsideBoard(coord)) {
        continue;
      }

      const top = getStack(state.board, coord).at(-1);
      if (!top) {
        continue;
      }

      score += top.owner === player ? 28 : -34;
    }
  }

  return score;
}

function evaluateBattleState(state: GameState, perspective: Player, context: SearchContext): number {
  const opponent = getOpponent(perspective);
  let score = getPlayerMaterial(state, perspective) - getPlayerMaterial(state, opponent);

  if (state.turn === perspective) {
    score += 12;
  } else {
    score -= 8;
  }

  if (isMarshalThreatened(state, opponent)) {
    score += 280;
  }
  if (isMarshalThreatened(state, perspective)) {
    score -= 360;
  }

  score += evaluateMarshalSafety(state, perspective);
  score -= evaluateMarshalSafety(state, opponent);

  const mobility =
    getLegalMovesCached(context, state, perspective).length - getLegalMovesCached(context, state, opponent).length;
  score += mobility * 7;

  for (const coord of ALL_COORDS) {
    const stack = getStack(state.board, coord);
    if (stack.length === 0) {
      continue;
    }

    for (const [index, piece] of stack.entries()) {
      const sign = piece.owner === perspective ? 1 : -1;
      const advance = piece.owner === 'south' ? 8 - coord.y : coord.y;
      const pieceValue = getPieceDefinition(piece.kind).value;
      const supportBonus = index * 18;
      const topBonus = index === stack.length - 1 ? 12 : 4;
      score += sign * (pieceValue * 0.14 + advance * 4 + scoreCentrality(coord.x, coord.y) * 6 + supportBonus + topBonus);
    }
  }

  return score;
}

function evaluateSetupState(state: GameState, perspective: Player): number {
  const marshalCoord = findMarshalCoord(state, perspective);
  const reserve = Object.values(state.hands[perspective]).reduce((sum, count) => sum + count, 0);
  let score = marshalCoord ? 180 : -700;
  score += (25 - reserve) * 18;

  for (const coord of ALL_COORDS) {
    const stack = getStack(state.board, coord);
    const top = stack.at(-1);
    if (!top || top.owner !== perspective) {
      continue;
    }

    const homeDistance = Math.abs(coord.x - 4) + Math.abs(coord.y - (perspective === 'south' ? 8 : 0));
    score -= homeDistance * 10;
    score += scoreCentrality(coord.x, coord.y) * 7;
    score += (stack.length - 1) * 28;
  }

  return score;
}

function evaluateState(state: GameState, perspective: Player, context: SearchContext): number {
  const cached = readCache(context.evaluations, state, perspective);
  if (cached !== null) {
    return cached;
  }

  if (state.winner) {
    const terminalScore =
      state.winner === perspective
        ? 1_000_000 - state.history.length * 10
        : -1_000_000 + state.history.length * 10;
    return writeCache(context.evaluations, state, perspective, terminalScore);
  }

  const score =
    state.phase === 'setup'
      ? evaluateSetupState(state, perspective)
      : evaluateBattleState(state, perspective, context);

  return writeCache(context.evaluations, state, perspective, score);
}

function moveMatches(left: GameMove | null, right: GameMove | null): boolean {
  if (!left || !right) {
    return false;
  }

  return moveKey(left) === moveKey(right);
}

function getOrderedMoveScore(
  state: GameState,
  move: GameMove,
  player: Player,
  context: SearchContext,
  preferredMove: GameMove | null,
): number {
  const nextState = applyMove(state, move, { validate: false });
  const evaluationScore = evaluateState(nextState, player, context);
  let score = scoreMoveHint(move) + evaluationScore;

  if (moveMatches(move, preferredMove)) {
    score += 500_000;
  }

  if (move.type === 'capture' || move.type === 'betray') {
    score += 120;
  }

  return score;
}

function orderMoves(
  state: GameState,
  moves: GameMove[],
  player: Player,
  context: SearchContext,
  preferredMove: GameMove | null = null,
): GameMove[] {
  return [...moves]
    .map((move) => ({
      move,
      score: getOrderedMoveScore(state, move, player, context, preferredMove),
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.move);
}

function ensureWithinDeadline(context: SearchContext): void {
  context.nodes += 1;
  if (context.nodes % 256 !== 0) {
    return;
  }

  if (nowMs() >= context.deadlineMs) {
    throw new SearchTimeoutError();
  }
}

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: Player,
  options: SearchOptions,
  context: SearchContext,
): number {
  ensureWithinDeadline(context);

  if (depth === 0 || state.winner || state.phase === 'setup') {
    return evaluateState(state, maximizingPlayer, context);
  }

  const currentPlayer = state.turn;
  const legalMoves = getLegalMovesCached(context, state, currentPlayer);
  if (legalMoves.length === 0) {
    return evaluateState(state, maximizingPlayer, context);
  }

  const key = serializeState(state);
  const cached = context.transposition.get(key);
  const originalAlpha = alpha;
  const originalBeta = beta;
  if (cached && cached.depth >= depth) {
    if (cached.flag === 'exact') {
      return cached.score;
    }
    if (cached.flag === 'lower') {
      alpha = Math.max(alpha, cached.score);
    } else {
      beta = Math.min(beta, cached.score);
    }
    if (beta <= alpha) {
      return cached.score;
    }
  }

  const orderedMoves = orderMoves(state, legalMoves, currentPlayer, context, cached?.bestMove ?? null).slice(0, options.beamWidth);

  let bestMove: GameMove | null = null;
  let bestScore =
    currentPlayer === maximizingPlayer ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;

  if (currentPlayer === maximizingPlayer) {
    for (const move of orderedMoves) {
      const score = minimax(
        applyMove(state, move, { validate: false }),
        depth - 1,
        alpha,
        beta,
        maximizingPlayer,
        options,
        context,
      );

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
      if (beta <= alpha) {
        break;
      }
    }
  } else {
    for (const move of orderedMoves) {
      const score = minimax(
        applyMove(state, move, { validate: false }),
        depth - 1,
        alpha,
        beta,
        maximizingPlayer,
        options,
        context,
      );

      if (score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
      beta = Math.min(beta, bestScore);
      if (beta <= alpha) {
        break;
      }
    }
  }

  const flag =
    bestScore <= originalAlpha ? 'upper' : bestScore >= originalBeta ? 'lower' : 'exact';

  context.transposition.set(key, {
    depth,
    flag,
    score: bestScore,
    bestMove,
  });

  return bestScore;
}

function chooseRandomMove(moves: GameMove[]): GameMove | null {
  if (moves.length === 0) {
    return null;
  }

  const weighted = [...moves].sort((left, right) => scoreMoveHint(right) - scoreMoveHint(left));
  const sampleSize = Math.max(1, Math.min(6, weighted.length));
  return weighted[Math.floor(Math.random() * sampleSize)] ?? null;
}

function chooseGreedyMove(
  state: GameState,
  player: Player,
  moves: GameMove[],
  context: SearchContext,
): GameMove | null {
  if (moves.length === 0) {
    return null;
  }

  const scored = moves.map((move) => {
    const nextState = applyMove(state, move, { validate: false });
    return {
      move,
      score: evaluateState(nextState, player, context) + scoreMoveHint(move),
    };
  });

  scored.sort((left, right) => right.score - left.score);
  const topScore = scored[0]?.score ?? 0;
  const candidates = scored.filter((entry) => topScore - entry.score < 24);
  return candidates[Math.floor(Math.random() * candidates.length)]?.move ?? null;
}

function countPlacedPieces(state: GameState, player: Player): number {
  return state.board.flat().filter((piece) => piece.owner === player).length;
}

function pickSetupMove(
  state: GameState,
  level: CpuLevel,
  context: SearchContext,
  onProgress?: CpuThoughtReporter,
): GameMove | null {
  const player = state.turn;
  const ruleset = getRuleset(state.rulesetId);
  const legalMoves = getLegalMovesCached(context, state, player);
  if (legalMoves.length === 0) {
    return null;
  }

  reportThought(onProgress, 'setup', '配置候補を整理中', `候補 ${legalMoves.length} 手`);

  const placedPieces = countPlacedPieces(state, player);
  const targetCount = level === 'easy' ? 10 : level === 'normal' ? 13 : 16;
  const preferred = ruleset.setup.kind === 'free' ? ruleset.setup.preferredPlacements : [];
  const deployMoves = legalMoves.filter((move): move is Extract<GameMove, { type: 'deploy' }> => move.type === 'deploy');

  if (!findMarshalCoord(state, player)) {
    reportThought(onProgress, 'select', 'まず帥の配置を優先', '中央寄りの位置へ配置します。');
    const marshalMove = deployMoves.find(
      (move) =>
        move.pieceKind === 'marshal' &&
        move.to.x === 4 &&
        move.to.y === (player === 'south' ? 8 : 0),
    );
    return marshalMove ?? chooseGreedyMove(state, player, deployMoves, context);
  }

  if (placedPieces >= targetCount && legalMoves.some((move) => move.type === 'ready')) {
    reportThought(onProgress, 'done', '配置が整ったため確定', `配置済み ${placedPieces} 枚`);
    return createReadyMove(player);
  }

  const preferredScore = (move: Extract<GameMove, { type: 'deploy' }>): number => {
    const preferredIndex = preferred.findIndex(
      (placement) =>
        placement.pieces.at(-1) === move.pieceKind &&
        placement.coord.x === move.to.x &&
        (player === 'south' ? placement.coord.y : 8 - placement.coord.y) === move.to.y,
    );
    const centerBias = 8 - Math.abs(move.to.x - 4);
    const frontBias = player === 'south' ? 8 - move.to.y : move.to.y;
    const stackBias = getStack(state.board, move.to).length > 0 ? 10 : 0;
    return (preferredIndex === -1 ? 0 : 220 - preferredIndex * 10) + centerBias * 7 + frontBias * 4 + stackBias;
  };

  const ordered = [...deployMoves].sort((left, right) => preferredScore(right) - preferredScore(left));
  const chosen =
    level === 'easy'
      ? ordered[Math.floor(Math.random() * Math.min(4, ordered.length))] ?? ordered[0] ?? null
      : ordered[0] ?? chooseGreedyMove(state, player, legalMoves, context);

  if (chosen) {
    reportThought(onProgress, 'done', `${formatMoveSummary(chosen)} を選択`, `配置済み ${placedPieces} / 目安 ${targetCount}`);
  }

  return chosen;
}

function buildHardSearchOptions(state: GameState, legalMoves: GameMove[]): SearchOptions & { timeBudgetMs: number } {
  const pieceCount = state.board.flat().length;

  if (legalMoves.length > 30) {
    return { depth: 3, beamWidth: 8, timeBudgetMs: 520 };
  }
  if (legalMoves.length > 22) {
    return { depth: 4, beamWidth: 9, timeBudgetMs: 650 };
  }
  if (pieceCount <= 14) {
    return { depth: 4, beamWidth: 12, timeBudgetMs: 860 };
  }

  return { depth: 4, beamWidth: 10, timeBudgetMs: 760 };
}

function searchRootDepth(
  state: GameState,
  player: Player,
  legalMoves: GameMove[],
  depth: number,
  options: SearchOptions,
  context: SearchContext,
  onProgress?: CpuThoughtReporter,
): SearchRootResult {
  const preferredMove = context.transposition.get(serializeState(state))?.bestMove ?? null;
  const orderedMoves = orderMoves(state, legalMoves, player, context, preferredMove).slice(0, options.beamWidth);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestMove: GameMove | null = null;

  for (const [index, move] of orderedMoves.entries()) {
    reportThought(
      onProgress,
      'search',
      `候補 ${index + 1}/${orderedMoves.length} を検討`,
      `${formatMoveSummary(move)} / 深さ ${depth}`,
      (index + 1) / orderedMoves.length,
    );

    const nextState = applyMove(state, move, { validate: false });
    const score =
      depth === 1
        ? evaluateState(nextState, player, context)
        : minimax(
            nextState,
            depth - 1,
            Number.NEGATIVE_INFINITY,
            Number.POSITIVE_INFINITY,
            player,
            options,
            context,
          );

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return {
    completed: true,
    move: bestMove,
    score: bestScore,
  };
}

function pickHardMove(
  state: GameState,
  context: SearchContext,
  onProgress?: CpuThoughtReporter,
): GameMove | null {
  const player = state.turn;
  const legalMoves = getLegalMovesCached(context, state, player);
  if (legalMoves.length === 0) {
    return null;
  }

  const hardOptions = buildHardSearchOptions(state, legalMoves);
  reportThought(onProgress, 'legal', '合法手を収集中', `${legalMoves.length} 手を確認`);
  reportThought(
    onProgress,
    'order',
    '候補手を優先度順に並び替え',
    `深さ上限 ${hardOptions.depth} / ビーム幅 ${hardOptions.beamWidth} / 制限 ${hardOptions.timeBudgetMs}ms`,
  );

  const searchContext = createSearchContext(hardOptions.timeBudgetMs);
  searchContext.evaluations = context.evaluations;
  searchContext.legalMoves = context.legalMoves;
  searchContext.transposition = context.transposition;

  let bestMove = chooseGreedyMove(state, player, legalMoves, context);
  let bestScore = bestMove ? evaluateState(applyMove(state, bestMove, { validate: false }), player, context) : 0;
  let completedDepth = 0;

  for (let depth = 1; depth <= hardOptions.depth; depth += 1) {
    reportThought(
      onProgress,
      'depth',
      `深さ ${depth} の探索を開始`,
      `現在の優先候補 ${bestMove ? formatMoveSummary(bestMove) : '未確定'}`,
      depth / hardOptions.depth,
    );

    try {
      const result = searchRootDepth(state, player, legalMoves, depth, hardOptions, searchContext, onProgress);
      if (result.move) {
        bestMove = result.move;
        bestScore = result.score;
        completedDepth = depth;
        reportThought(onProgress, 'select', '最善手を更新', `${formatMoveSummary(result.move)} / 評価 ${Math.round(result.score)}`);
      }
    } catch (error) {
      if (!(error instanceof SearchTimeoutError)) {
        throw error;
      }

      reportThought(
        onProgress,
        'search',
        '時間制限で探索を打ち切り',
        `深さ ${depth} の途中で停止。直前までの最善手を採用します。`,
      );
      break;
    }
  }

  context.nodes = searchContext.nodes;
  context.transposition = searchContext.transposition;

  if (bestMove) {
    reportThought(
      onProgress,
      'done',
      `${formatMoveSummary(bestMove)} を選択`,
      `探索深さ ${Math.max(1, completedDepth)} / ${context.nodes} 局面 / 評価 ${Math.round(bestScore)}`,
    );
  }

  return bestMove;
}

export function computeBestMove(
  state: GameState,
  level: CpuLevel,
  options: ComputeBestMoveOptions = {},
): GameMove | null {
  const context = createSearchContext();
  const onProgress = options.onProgress;

  reportThought(
    onProgress,
    'start',
    `${state.turn === 'south' ? '先手CPU' : '後手CPU'} が思考開始`,
    `${state.phase === 'setup' ? '配置フェーズ' : '対局フェーズ'} / 難易度 ${cpuLevelLabel(level)}`,
  );

  if (state.phase === 'setup') {
    return pickSetupMove(state, level, context, onProgress);
  }

  const player = state.turn;
  const legalMoves = getLegalMovesCached(context, state, player);
  if (legalMoves.length === 0) {
    return null;
  }

  if (level === 'easy') {
    reportThought(onProgress, 'legal', '合法手を確認', `${legalMoves.length} 手`);
    const move = chooseRandomMove(legalMoves);
    if (move) {
      reportThought(onProgress, 'select', '軽く候補を見て選択', formatMoveSummary(move));
      reportThought(onProgress, 'done', `${formatMoveSummary(move)} を選択`);
    }
    return move;
  }

  if (level === 'normal') {
    reportThought(onProgress, 'legal', '合法手を確認', `${legalMoves.length} 手`);
    reportThought(onProgress, 'evaluate', '各候補を1手先まで評価', `${legalMoves.length} 手をスコア化`);
    const move = chooseGreedyMove(state, player, legalMoves, context);
    if (move) {
      reportThought(onProgress, 'done', `${formatMoveSummary(move)} を選択`);
    }
    return move;
  }

  return pickHardMove(state, context, onProgress);
}
