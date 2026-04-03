import { getStack, listCoords } from './board';
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
import { type CpuLevel, type GameMove, type GameState, type Player, type SearchOptions } from './types';

const ALL_COORDS = listCoords();

interface SearchContext {
  evaluations: WeakMap<GameState, Map<Player, number>>;
  legalMoves: WeakMap<GameState, Map<Player, GameMove[]>>;
}

export interface ComputeBestMoveOptions {
  onProgress?: CpuThoughtReporter;
}

function createSearchContext(): SearchContext {
  return {
    evaluations: new WeakMap(),
    legalMoves: new WeakMap(),
  };
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
    return `${pieceLabel}で取る`;
  }
  if (move.type === 'stack') {
    return `${pieceLabel}でツケ`;
  }
  if (move.type === 'betray') {
    return `${pieceLabel}で寝返り`;
  }

  return `${pieceLabel}を移動`;
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
    return 180;
  }
  if (move.type === 'stack') {
    return 50;
  }
  if (move.type === 'betray') {
    return 165;
  }
  if (move.type === 'drop') {
    return 25;
  }
  if (move.type === 'deploy') {
    return 30;
  }
  if (move.type === 'ready') {
    return 5;
  }
  return 10;
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

  if (state.phase === 'setup') {
    const marshalCoord = findMarshalCoord(state, perspective);
    const reserve = Object.values(state.hands[perspective]).reduce((sum, count) => sum + count, 0);
    let score = marshalCoord ? 140 : -600;
    score += (25 - reserve) * 18;

    for (const coord of ALL_COORDS) {
      const stack = getStack(state.board, coord);
      const top = stack.at(-1);
      if (!top || top.owner !== perspective) {
        continue;
      }

      const centerDistance = Math.abs(coord.x - 4) + Math.abs(coord.y - (perspective === 'south' ? 8 : 0));
      score -= centerDistance * 12;
      score += (stack.length - 1) * 22;
    }

    return writeCache(context.evaluations, state, perspective, score);
  }

  const opponent = getOpponent(perspective);
  let score = getPlayerMaterial(state, perspective) - getPlayerMaterial(state, opponent);

  if (isMarshalThreatened(state, opponent)) {
    score += 260;
  }
  if (isMarshalThreatened(state, perspective)) {
    score -= 320;
  }

  const mobility =
    getLegalMovesCached(context, state, perspective).length - getLegalMovesCached(context, state, opponent).length;
  score += mobility * 7;

  for (const coord of ALL_COORDS) {
    const stack = getStack(state.board, coord);
    const top = stack.at(-1);
    if (!top) {
      continue;
    }

    const sign = top.owner === perspective ? 1 : -1;
    const advance = top.owner === 'south' ? 8 - coord.y : coord.y;
    score += sign * advance * 4;
    score += sign * (stack.length - 1) * 18;
  }

  return writeCache(context.evaluations, state, perspective, score);
}

function orderMoves(
  state: GameState,
  moves: GameMove[],
  player: Player,
  context: SearchContext,
): GameMove[] {
  return [...moves]
    .map((move) => {
      const nextState = applyMove(state, move, { validate: false });
      return {
        move,
        score: scoreMoveHint(move) + evaluateState(nextState, player, context),
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.move);
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
  if (depth === 0 || state.winner || state.phase === 'setup') {
    return evaluateState(state, maximizingPlayer, context);
  }

  const currentPlayer = state.turn;
  const legalMoves = getLegalMovesCached(context, state, currentPlayer);
  if (legalMoves.length === 0) {
    return evaluateState(state, maximizingPlayer, context);
  }

  const orderedMoves = orderMoves(state, legalMoves, currentPlayer, context).slice(0, options.beamWidth);

  if (currentPlayer === maximizingPlayer) {
    let best = Number.NEGATIVE_INFINITY;
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
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) {
        break;
      }
    }
    return best;
  }

  let best = Number.POSITIVE_INFINITY;
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
    best = Math.min(best, score);
    beta = Math.min(beta, best);
    if (beta <= alpha) {
      break;
    }
  }
  return best;
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
  const candidates = scored.filter((entry) => topScore - entry.score < 30);
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
    reportThought(onProgress, 'select', 'まず帥の配置を優先', '中央付近への配置を優先しています。');
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
    const stackBias = getStack(state.board, move.to).length > 0 ? 9 : 0;
    return (preferredIndex === -1 ? 0 : 200 - preferredIndex * 8) + centerBias * 6 + frontBias * 4 + stackBias;
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
    `${state.phase === 'setup' ? '配置フェーズ' : '対局フェーズ'} / 難度 ${cpuLevelLabel(level)}`,
  );

  if (state.phase === 'setup') {
    return pickSetupMove(state, level, context, onProgress);
  }

  const player = state.turn;
  const legalMoves = getLegalMovesCached(context, state, player);
  if (legalMoves.length === 0) {
    return null;
  }

  reportThought(onProgress, 'legal', '合法手を列挙', `${legalMoves.length} 手を確認`);

  if (level === 'easy') {
    const move = chooseRandomMove(legalMoves);
    if (move) {
      reportThought(onProgress, 'select', '上位候補からランダム選択', formatMoveSummary(move));
      reportThought(onProgress, 'done', `${formatMoveSummary(move)} を決定`);
    }
    return move;
  }

  if (level === 'normal') {
    reportThought(onProgress, 'evaluate', '各候補を一手読みで評価', `${legalMoves.length} 手をスコア化`);
    const move = chooseGreedyMove(state, player, legalMoves, context);
    if (move) {
      reportThought(onProgress, 'done', `${formatMoveSummary(move)} を決定`);
    }
    return move;
  }

  const optionsForSearch: SearchOptions = {
    depth: legalMoves.length > 24 ? 2 : 3,
    beamWidth: legalMoves.length > 30 ? 8 : 12,
  };

  reportThought(
    onProgress,
    'search',
    '候補手を探索中',
    `深さ ${optionsForSearch.depth} / ビーム幅 ${optionsForSearch.beamWidth}`,
    0,
  );

  const orderedMoves = orderMoves(state, legalMoves, player, context).slice(0, optionsForSearch.beamWidth);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestMove: GameMove | null = null;

  for (const [index, move] of orderedMoves.entries()) {
    reportThought(
      onProgress,
      'search',
      `候補 ${index + 1}/${orderedMoves.length} を探索`,
      formatMoveSummary(move),
      (index + 1) / orderedMoves.length,
    );

    const nextState = applyMove(state, move, { validate: false });
    const score = minimax(
      nextState,
      optionsForSearch.depth - 1,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      player,
      optionsForSearch,
      context,
    );

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      reportThought(onProgress, 'select', '暫定首位を更新', `${formatMoveSummary(move)} / 評価 ${Math.round(score)}`);
    }
  }

  const fallbackMove = bestMove ?? chooseGreedyMove(state, player, legalMoves, context);
  if (fallbackMove) {
    reportThought(onProgress, 'done', `${formatMoveSummary(fallbackMove)} を決定`);
  }

  return fallbackMove;
}
