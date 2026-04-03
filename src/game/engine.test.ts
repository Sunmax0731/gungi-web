import { describe, expect, it } from 'vitest';
import { computeBestMove } from './ai';
import { createEmptyBoard, getStack } from './board';
import { createInitialClock } from './clock';
import { applyMove, createReadyMove, createResignMove, generateLegalMoves } from './engine';
import { createInitialGame } from './setup';
import { type Coord, type GameMove, type GameState, type PieceKind, type Player, type RulesetId } from './types';

function createEmptyHands(): GameState['hands'] {
  return {
    south: {
      marshal: 0,
      general: 0,
      lieutenant: 0,
      minor: 0,
      samurai: 0,
      spear: 0,
      horse: 0,
      shinobi: 0,
      fortress: 0,
      soldier: 0,
      bow: 0,
      cylinder: 0,
      cannon: 0,
      tactician: 0,
    },
    north: {
      marshal: 0,
      general: 0,
      lieutenant: 0,
      minor: 0,
      samurai: 0,
      spear: 0,
      horse: 0,
      shinobi: 0,
      fortress: 0,
      soldier: 0,
      bow: 0,
      cylinder: 0,
      cannon: 0,
      tactician: 0,
    },
  };
}

function createCustomGame(rulesetId: RulesetId = 'beginner', turn: Player = 'south'): GameState {
  return {
    rulesetId,
    setupTemplateId: null,
    phase: 'battle',
    board: createEmptyBoard(),
    hands: createEmptyHands(),
    turn,
    startingPlayer: 'south',
    setupReady: {
      south: true,
      north: true,
    },
    winner: null,
    victoryReason: null,
    moveNumber: 1,
    history: [],
    clock: createInitialClock('2026-04-02T00:00:00.000Z'),
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
  };
}

function placePiece(
  state: GameState,
  owner: Player,
  kind: PieceKind,
  coord: Coord,
  suffix: string,
): void {
  getStack(state.board, coord).push({
    id: `${owner}-${kind}-${suffix}`,
    kind,
    owner,
  });
}

describe('gungi engine', () => {
  it('creates a beginner position with reserve pieces', () => {
    const state = createInitialGame('beginner');

    expect(state.phase).toBe('battle');
    expect(state.board.flat()).toHaveLength(30);
    expect(getStack(state.board, { x: 4, y: 8 }).at(-1)?.kind).toBe('marshal');
    expect(getStack(state.board, { x: 4, y: 7 }).at(-1)?.kind).toBe('minor');
    expect(getStack(state.board, { x: 0, y: 6 }).at(-1)?.kind).toBe('soldier');
    expect(state.hands.south.soldier).toBe(1);
    expect(state.hands.south.spear).toBe(1);
    expect(state.hands.south.horse).toBe(1);
    expect(state.hands.south.shinobi).toBe(1);
    expect(state.hands.south.minor).toBe(1);
    expect(state.hands.north.soldier).toBe(1);
    expect(state.hands.north.spear).toBe(1);
    expect(state.hands.north.horse).toBe(1);
    expect(state.hands.north.shinobi).toBe(1);
    expect(state.hands.north.minor).toBe(1);
  });

  it('creates an advanced position in setup phase', () => {
    const state = createInitialGame('advanced');
    const legalMoves = generateLegalMoves(state);

    expect(state.phase).toBe('setup');
    expect(state.board.flat()).toHaveLength(0);
    expect(legalMoves.every((move) => move.type === 'deploy')).toBe(true);
    expect(legalMoves.every((move) => move.type !== 'deploy' || move.pieceKind === 'marshal')).toBe(true);
  });

  it('creates an advanced recommended setup with south placements prefilled', () => {
    const state = createInitialGame('advanced', 'recommended');

    expect(state.phase).toBe('setup');
    expect(state.setupTemplateId).toBe('recommended');
    expect(state.turn).toBe('south');
    expect(getStack(state.board, { x: 4, y: 8 }).at(-1)?.kind).toBe('marshal');
    expect(getStack(state.board, { x: 3, y: 7 }).at(-1)?.kind).toBe('minor');
    expect(state.hands.south.marshal).toBe(0);
    expect(state.hands.south.general).toBe(0);
    expect(state.hands.north.marshal).toBe(1);
  });

  it('generates legal drops for the beginner opening player', () => {
    const state = createInitialGame('beginner');
    const legalMoves = generateLegalMoves(state);

    expect(legalMoves.length).toBeGreaterThan(0);
    expect(legalMoves.some((move) => move.type === 'drop')).toBe(true);
  });

  it('applies a legal drop through applyMove', () => {
    const state = createInitialGame('beginner');
    const drop = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'drop' }> => move.type === 'drop' && move.player === 'south',
    );

    expect(drop).toBeTruthy();
    if (!drop) {
      return;
    }

    const nextState = applyMove(state, drop);
    expect(nextState.turn).toBe('north');
    expect(nextState.hands.south[drop.pieceKind]).toBe(state.hands.south[drop.pieceKind] - 1);
  });

  it('supports advanced setup deployment and ready flow', () => {
    let state = createInitialGame('advanced');

    const southMarshal = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'deploy' }> =>
        move.type === 'deploy' && move.player === 'south' && move.to.x === 4 && move.to.y === 8,
    );
    expect(southMarshal).toBeTruthy();
    if (!southMarshal) {
      return;
    }
    state = applyMove(state, southMarshal);

    const northMarshal = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'deploy' }> =>
        move.type === 'deploy' && move.player === 'north' && move.to.x === 4 && move.to.y === 0,
    );
    expect(northMarshal).toBeTruthy();
    if (!northMarshal) {
      return;
    }
    state = applyMove(state, northMarshal);

    const southSoldier = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'deploy' }> =>
        move.type === 'deploy' && move.player === 'south' && move.pieceKind === 'soldier' && move.to.x === 4 && move.to.y === 7,
    );
    expect(southSoldier).toBeTruthy();
    if (!southSoldier) {
      return;
    }
    state = applyMove(state, southSoldier);

    state = applyMove(state, createReadyMove('north'));
    expect(state.phase).toBe('battle');
    expect(state.turn).toBe('south');
    expect(state.setupReady.north).toBe(true);
    expect(state.setupReady.south).toBe(false);
  });

  it('disallows stacking onto a taller stack', () => {
    const state = createCustomGame('advanced');
    placePiece(state, 'south', 'marshal', { x: 0, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 8, y: 0 }, 'n0');
    placePiece(state, 'south', 'soldier', { x: 4, y: 4 }, 's1');
    placePiece(state, 'south', 'minor', { x: 4, y: 5 }, 's2');
    placePiece(state, 'south', 'soldier', { x: 4, y: 5 }, 's3');

    const illegalStack = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'stack' }> =>
        move.type === 'stack' &&
        move.from.x === 4 &&
        move.from.y === 4 &&
        move.to.x === 4 &&
        move.to.y === 5,
    );

    expect(illegalStack).toBeUndefined();
  });

  it('disallows capturing a taller enemy stack', () => {
    const state = createCustomGame('advanced');
    placePiece(state, 'south', 'marshal', { x: 0, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 8, y: 0 }, 'n0');
    placePiece(state, 'south', 'soldier', { x: 4, y: 4 }, 's1');
    placePiece(state, 'north', 'soldier', { x: 4, y: 3 }, 'n1');
    placePiece(state, 'north', 'minor', { x: 4, y: 3 }, 'n2');

    const illegalCapture = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'capture' }> =>
        move.type === 'capture' &&
        move.from.x === 4 &&
        move.from.y === 4 &&
        move.to.x === 4 &&
        move.to.y === 3,
    );

    expect(illegalCapture).toBeUndefined();
  });

  it('allows bow to jump over the front square into its forward lanes', () => {
    const state = createCustomGame('advanced');
    placePiece(state, 'south', 'marshal', { x: 0, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 8, y: 0 }, 'n0');
    placePiece(state, 'south', 'bow', { x: 4, y: 4 }, 's1');
    placePiece(state, 'south', 'soldier', { x: 4, y: 3 }, 's2');

    const jumpTargets = generateLegalMoves(state).flatMap((move) =>
      move.type === 'move' && move.from.x === 4 && move.from.y === 4
        ? [`${move.to.x},${move.to.y}`]
        : [],
    );

    expect(jumpTargets).toContain('3,2');
    expect(jumpTargets).toContain('4,2');
    expect(jumpTargets).toContain('5,2');
  });

  it('supports tactician betrayal even when the top piece is friendly', () => {
    const state = createCustomGame('advanced');
    state.hands.south.soldier = 1;
    placePiece(state, 'south', 'marshal', { x: 0, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 8, y: 0 }, 'n0');
    placePiece(state, 'south', 'soldier', { x: 4, y: 4 }, 's1');
    placePiece(state, 'south', 'tactician', { x: 4, y: 4 }, 's2');
    placePiece(state, 'north', 'soldier', { x: 5, y: 3 }, 'n1');
    placePiece(state, 'south', 'minor', { x: 5, y: 3 }, 's3');

    const betrayMove = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'betray' }> =>
        move.type === 'betray' &&
        move.from.x === 4 &&
        move.from.y === 4 &&
        move.to.x === 5 &&
        move.to.y === 3,
    );

    expect(betrayMove).toBeTruthy();
    if (!betrayMove) {
      return;
    }

    const nextState = applyMove(state, betrayMove);
    expect(nextState.hands.south.soldier).toBe(0);
    expect(getStack(nextState.board, { x: 5, y: 3 }).every((piece) => piece.owner === 'south')).toBe(true);
    expect(getStack(nextState.board, { x: 5, y: 3 }).at(-1)?.kind).toBe('tactician');
    expect(nextState.history.at(-1)?.captured).toHaveLength(1);
  });

  it('supports stack moves through applyMove', () => {
    const state = createCustomGame();
    placePiece(state, 'south', 'marshal', { x: 0, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 8, y: 0 }, 'n0');
    placePiece(state, 'south', 'soldier', { x: 4, y: 4 }, 's1');
    placePiece(state, 'south', 'minor', { x: 4, y: 5 }, 's2');

    const stackMove = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'stack' }> =>
        move.type === 'stack' &&
        move.from.x === 4 &&
        move.from.y === 4 &&
        move.to.x === 4 &&
        move.to.y === 5,
    );

    expect(stackMove).toBeTruthy();
    if (!stackMove) {
      return;
    }

    const nextState = applyMove(state, stackMove);
    expect(getStack(nextState.board, { x: 4, y: 4 })).toHaveLength(0);
    expect(getStack(nextState.board, { x: 4, y: 5 })).toHaveLength(2);
    expect(getStack(nextState.board, { x: 4, y: 5 }).at(-1)?.kind).toBe('soldier');
  });

  it('supports captures and removes the target stack', () => {
    const state = createCustomGame();
    placePiece(state, 'south', 'marshal', { x: 0, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 8, y: 0 }, 'n0');
    placePiece(state, 'south', 'general', { x: 4, y: 4 }, 's1');
    placePiece(state, 'north', 'soldier', { x: 4, y: 6 }, 'n1');

    const captureMove = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'capture' }> =>
        move.type === 'capture' &&
        move.from.x === 4 &&
        move.from.y === 4 &&
        move.to.x === 4 &&
        move.to.y === 6,
    );

    expect(captureMove).toBeTruthy();
    if (!captureMove) {
      return;
    }

    const nextState = applyMove(state, captureMove);
    expect(getStack(nextState.board, { x: 4, y: 6 })).toHaveLength(1);
    expect(getStack(nextState.board, { x: 4, y: 6 }).at(-1)?.owner).toBe('south');
    expect(nextState.history.at(-1)?.captured).toHaveLength(1);
  });

  it('filters out moves that expose the marshal', () => {
    const state = createCustomGame();
    placePiece(state, 'south', 'marshal', { x: 4, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 8, y: 0 }, 'n0');
    placePiece(state, 'south', 'minor', { x: 4, y: 7 }, 's1');
    placePiece(state, 'north', 'general', { x: 4, y: 4 }, 'n1');

    const illegalEscape = generateLegalMoves(state).find(
      (move): move is Extract<GameMove, { type: 'move' | 'stack' | 'capture' }> =>
        (move.type === 'move' || move.type === 'stack' || move.type === 'capture') &&
        move.from.x === 4 &&
        move.from.y === 7 &&
        move.to.x === 3 &&
        move.to.y === 6,
    );

    expect(illegalEscape).toBeUndefined();
  });

  it('returns a legal move from the CPU evaluator during battle', () => {
    const state = createCustomGame();
    placePiece(state, 'south', 'marshal', { x: 4, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 4, y: 0 }, 'n0');
    placePiece(state, 'south', 'general', { x: 4, y: 6 }, 's1');
    placePiece(state, 'north', 'minor', { x: 3, y: 2 }, 'n1');
    const legalMoves = generateLegalMoves(state).map((move) => JSON.stringify(move));
    const cpuMove = computeBestMove(state, 'normal');

    expect(cpuMove).not.toBeNull();
    expect(legalMoves).toContain(JSON.stringify(cpuMove));
  });

  it('returns a legal move from the CPU evaluator during setup', () => {
    const state = createInitialGame('advanced');
    const legalMoves = generateLegalMoves(state).map((move) => JSON.stringify(move));
    const cpuMove = computeBestMove(state, 'normal');

    expect(cpuMove).not.toBeNull();
    expect(legalMoves).toContain(JSON.stringify(cpuMove));
  });

  it('returns a legal move from the hard CPU evaluator during battle', () => {
    const state = createCustomGame('advanced');
    placePiece(state, 'south', 'marshal', { x: 4, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 4, y: 0 }, 'n0');
    placePiece(state, 'south', 'general', { x: 4, y: 6 }, 's1');
    placePiece(state, 'south', 'soldier', { x: 3, y: 6 }, 's2');
    placePiece(state, 'north', 'minor', { x: 3, y: 2 }, 'n1');
    placePiece(state, 'north', 'soldier', { x: 4, y: 2 }, 'n2');

    const legalMoves = generateLegalMoves(state).map((move) => JSON.stringify(move));
    const cpuMove = computeBestMove(state, 'hard');

    expect(cpuMove).not.toBeNull();
    expect(legalMoves).toContain(JSON.stringify(cpuMove));
  });

  it('supports resignation as a terminal move', () => {
    const state = createInitialGame('beginner');
    const nextState = applyMove(state, createResignMove('south'));

    expect(nextState.winner).toBe('north');
    expect(nextState.victoryReason).toBe('resign');
  });

  it('records move elapsed time and total match time', () => {
    const state = createCustomGame();
    placePiece(state, 'south', 'marshal', { x: 4, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 4, y: 0 }, 'n0');
    placePiece(state, 'south', 'soldier', { x: 4, y: 4 }, 's1');

    const move = generateLegalMoves(state).find(
      (candidate): candidate is Extract<GameMove, { type: 'move' }> =>
        candidate.type === 'move' &&
        candidate.from.x === 4 &&
        candidate.from.y === 4 &&
        candidate.to.x === 4 &&
        candidate.to.y === 3,
    );

    expect(move).toBeTruthy();
    if (!move) {
      return;
    }

    const nextState = applyMove(state, move, {
      recordedAt: '2026-04-02T00:00:05.000Z',
    });

    expect(nextState.history.at(-1)?.elapsedMs).toBe(5_000);
    expect(nextState.clock.matchElapsedMs).toBe(5_000);
    expect(nextState.clock.runningSince).toBe('2026-04-02T00:00:05.000Z');
  });

  it('stops the match clock when checkmate ends the game', () => {
    const state = createCustomGame();
    placePiece(state, 'south', 'marshal', { x: 0, y: 8 }, 's0');
    placePiece(state, 'north', 'marshal', { x: 4, y: 0 }, 'n0');
    placePiece(state, 'south', 'general', { x: 4, y: 2 }, 's1');
    placePiece(state, 'south', 'lieutenant', { x: 2, y: 1 }, 's2');
    placePiece(state, 'south', 'lieutenant', { x: 6, y: 1 }, 's3');
    placePiece(state, 'south', 'minor', { x: 3, y: 2 }, 's4');
    placePiece(state, 'south', 'minor', { x: 5, y: 2 }, 's5');

    const mateMove = generateLegalMoves(state).find(
      (candidate): candidate is Extract<GameMove, { type: 'move' }> =>
        candidate.type === 'move' &&
        candidate.from.x === 4 &&
        candidate.from.y === 2 &&
        candidate.to.x === 4 &&
        candidate.to.y === 1,
    );

    expect(mateMove).toBeTruthy();
    if (!mateMove) {
      return;
    }

    const nextState = applyMove(state, mateMove, {
      recordedAt: '2026-04-02T00:00:05.000Z',
    });

    expect(nextState.winner).toBe('south');
    expect(nextState.victoryReason).toBe('checkmate');
    expect(nextState.clock.matchElapsedMs).toBe(5_000);
    expect(nextState.clock.runningSince).toBeNull();
  });
});
