import { advanceClock, getClockSnapshot } from './clock';
import {
  cloneBoard,
  compareCoords,
  coordLabel,
  forwardFactor,
  getStack,
  getTopPiece,
  isInsideBoard,
  listCoords,
  setStack,
} from './board';
import { getPieceDefinition } from './pieces';
import { getRuleset } from './rulesets';
import {
  BOARD_SIZE,
  type ApplyMoveOptions,
  type BoardMove,
  type Coord,
  type DeployMove,
  type DropMove,
  type GameMove,
  type GameState,
  type MoveRecord,
  type PieceInstance,
  type PieceKind,
  type Player,
  type ReadyMove,
  type ResignMove,
  type Ruleset,
} from './types';

function cloneHands(state: GameState): GameState['hands'] {
  return {
    south: { ...state.hands.south },
    north: { ...state.hands.north },
  };
}

function cloneSetupReady(state: GameState): GameState['setupReady'] {
  return {
    south: state.setupReady.south,
    north: state.setupReady.north,
  };
}

export function getOpponent(player: Player): Player {
  return player === 'south' ? 'north' : 'south';
}

function orientVector(player: Player, dx: number, dy: number): Coord {
  const factor = forwardFactor(player);
  return {
    x: dx * factor,
    y: dy * factor,
  };
}

function getTierIndex(height: number): 0 | 1 | 2 {
  if (height >= 3) {
    return 2;
  }
  if (height === 2) {
    return 1;
  }
  return 0;
}

function stringifyMove(move: GameMove): string {
  return JSON.stringify(move);
}

function resolveRecordedAt(state: GameState, options: ApplyMoveOptions): string {
  if (options.recordedAt) {
    return options.recordedAt;
  }

  if (options.validate === false) {
    return state.updatedAt;
  }

  return new Date().toISOString();
}

function createPieceId(
  state: GameState,
  owner: Player,
  kind: PieceKind,
  suffix: string,
  extraOffset = 0,
): string {
  const count =
    state.board.flat().filter((piece) => piece.owner === owner && piece.kind === kind).length +
    state.history.length +
    extraOffset +
    1;

  return `${owner}-${kind}-${suffix}-${count}`;
}

function hasMarshalPlaced(state: GameState, player: Player): boolean {
  return state.board.flat().some((piece) => piece.owner === player && piece.kind === 'marshal');
}

function getSetupRows(state: GameState, player: Player): number[] {
  const ruleset = getRuleset(state.rulesetId);
  if (ruleset.setup.kind !== 'free') {
    return [];
  }

  if (player === 'south') {
    return Array.from({ length: ruleset.setup.deploymentRows }, (_, index) => BOARD_SIZE - 1 - index);
  }

  return Array.from({ length: ruleset.setup.deploymentRows }, (_, index) => index);
}

function isInSetupZone(state: GameState, player: Player, coord: Coord): boolean {
  return getSetupRows(state, player).includes(coord.y);
}

function isStackableTarget(
  ruleset: Ruleset,
  movingKind: PieceKind,
  targetStack: PieceInstance[],
  movingHeight?: number,
): boolean {
  const top = targetStack.at(-1);
  if (!top) {
    return false;
  }

  if (movingHeight !== undefined && movingHeight < targetStack.length) {
    return false;
  }

  if (targetStack.length >= ruleset.maxStackHeight) {
    return false;
  }

  if (top.kind === 'marshal') {
    return false;
  }

  if (movingKind === 'marshal' && !ruleset.allowMarshalStacking) {
    return false;
  }

  return true;
}

function getCaptureOutcome(
  ruleset: Ruleset,
  movingKind: PieceKind,
  player: Player,
  targetStack: PieceInstance[],
  movingHeight?: number,
) {
  const top = targetStack.at(-1);
  if (!top || top.owner === player) {
    return null;
  }

  if (movingHeight !== undefined && movingHeight < targetStack.length) {
    return null;
  }

  const survivors = targetStack.filter((piece) => piece.owner === player);
  if (movingKind === 'marshal' && !ruleset.allowMarshalStacking && survivors.length > 0) {
    return null;
  }

  if (survivors.length + 1 > ruleset.maxStackHeight) {
    return null;
  }

  const captured = targetStack.filter((piece) => piece.owner !== player);
  return {
    survivors,
    captured,
  };
}

function hasRequiredHandMatches(state: GameState, player: Player, targetStack: PieceInstance[]): boolean {
  const required = new Map<PieceKind, number>();

  for (const piece of targetStack) {
    if (piece.owner === player) {
      continue;
    }

    required.set(piece.kind, (required.get(piece.kind) ?? 0) + 1);
  }

  if (required.size === 0) {
    return false;
  }

  return [...required.entries()].every(([kind, count]) => state.hands[player][kind] >= count);
}

function getDropFrontline(state: GameState, player: Player): number {
  const rows = listCoords()
    .map((coord) => ({ coord, piece: getTopPiece(state.board, coord) }))
    .filter((entry) => entry.piece?.owner === player)
    .map((entry) => entry.coord.y);

  if (rows.length === 0) {
    return player === 'south' ? BOARD_SIZE - 1 : 0;
  }

  return player === 'south' ? Math.min(...rows) : Math.max(...rows);
}

function isDropRowAllowed(player: Player, frontline: number, row: number): boolean {
  return player === 'south' ? row >= frontline : row <= frontline;
}

function generateSetupMoves(state: GameState, player: Player): GameMove[] {
  const ruleset = getRuleset(state.rulesetId);
  if (ruleset.setup.kind !== 'free' || state.phase !== 'setup' || state.setupReady[player]) {
    return [];
  }

  const marshalPlaced = hasMarshalPlaced(state, player);
  const legalKinds = marshalPlaced ? ruleset.availableKinds : (['marshal'] as const);
  const moves: GameMove[] = [];

  for (const coord of listCoords()) {
    if (!isInSetupZone(state, player, coord)) {
      continue;
    }

    const targetStack = getStack(state.board, coord);
    for (const kind of legalKinds) {
      if (state.hands[player][kind] <= 0) {
        continue;
      }

      if (targetStack.length === 0) {
        moves.push({
          type: 'deploy',
          player,
          pieceKind: kind,
          to: coord,
        });
        continue;
      }

      if (
        ruleset.setup.allowStacking &&
        targetStack.at(-1)?.owner === player &&
        isStackableTarget(ruleset, kind, targetStack)
      ) {
        moves.push({
          type: 'deploy',
          player,
          pieceKind: kind,
          to: coord,
        });
      }
    }
  }

  if (marshalPlaced) {
    moves.push(createReadyMove(player));
  }

  return moves;
}

function generateBoardMoves(state: GameState, player: Player): BoardMove[] {
  const ruleset = getRuleset(state.rulesetId);
  const moves: BoardMove[] = [];

  for (const from of listCoords()) {
    const fromStack = getStack(state.board, from);
    const piece = fromStack.at(-1);

    if (!piece || piece.owner !== player) {
      continue;
    }

    const tierIndex = getTierIndex(fromStack.length);
    const definition = getPieceDefinition(piece.kind);
    const movingHeight = fromStack.length;

    for (const vector of definition.movement) {
      const direction = orientVector(player, vector.dx, vector.dy);
      const originShift = vector.originShift
        ? orientVector(player, vector.originShift.dx, vector.originShift.dy)
        : { x: 0, y: 0 };
      const shiftedOrigin = {
        x: from.x + originShift.x,
        y: from.y + originShift.y,
      };

      if (vector.originShift) {
        if (!isInsideBoard(shiftedOrigin)) {
          continue;
        }

        const shiftedStack = getStack(state.board, shiftedOrigin);
        if (vector.jumpOverOrigin) {
          if (shiftedStack.length > movingHeight) {
            continue;
          }
        } else if (shiftedStack.length > 0) {
          continue;
        }
      }

      const minStep = vector.minByTier?.[tierIndex] ?? 1;
      const maxStep = vector.maxByTier[tierIndex];

      for (let step = minStep; step <= maxStep; step += 1) {
        const to = {
          x: shiftedOrigin.x + direction.x * step,
          y: shiftedOrigin.y + direction.y * step,
        };

        if (!isInsideBoard(to)) {
          break;
        }

        if (vector.leap) {
          let blocked = false;
          for (let jumpStep = 1; jumpStep < step; jumpStep += 1) {
            const jumped = {
              x: shiftedOrigin.x + direction.x * jumpStep,
              y: shiftedOrigin.y + direction.y * jumpStep,
            };
            if (getStack(state.board, jumped).length > movingHeight) {
              blocked = true;
              break;
            }
          }
          if (blocked) {
            continue;
          }
        } else {
          let blocked = false;
          for (let pathStep = 1; pathStep < step; pathStep += 1) {
            const intermediate = {
              x: shiftedOrigin.x + direction.x * pathStep,
              y: shiftedOrigin.y + direction.y * pathStep,
            };
            if (getStack(state.board, intermediate).length > 0) {
              blocked = true;
              break;
            }
          }
          if (blocked) {
            break;
          }
        }

        const targetStack = getStack(state.board, to);
        const targetTop = targetStack.at(-1);

        if (!targetTop) {
          moves.push({
            type: 'move',
            player,
            from,
            to,
            pieceId: piece.id,
            pieceKind: piece.kind,
          });
          continue;
        }

        if (targetTop.owner === player) {
          if (isStackableTarget(ruleset, piece.kind, targetStack, movingHeight)) {
            moves.push({
              type: 'stack',
              player,
              from,
              to,
              pieceId: piece.id,
              pieceKind: piece.kind,
            });

            if (piece.kind === 'tactician' && hasRequiredHandMatches(state, player, targetStack)) {
              moves.push({
                type: 'betray',
                player,
                from,
                to,
                pieceId: piece.id,
                pieceKind: piece.kind,
              });
            }
          }
          break;
        }

        const capture = getCaptureOutcome(ruleset, piece.kind, player, targetStack, movingHeight);
        if (capture) {
          moves.push({
            type: 'capture',
            player,
            from,
            to,
            pieceId: piece.id,
            pieceKind: piece.kind,
          });
        }

        if (isStackableTarget(ruleset, piece.kind, targetStack, movingHeight)) {
          moves.push({
            type: 'stack',
            player,
            from,
            to,
            pieceId: piece.id,
            pieceKind: piece.kind,
          });

          if (piece.kind === 'tactician' && hasRequiredHandMatches(state, player, targetStack)) {
            moves.push({
              type: 'betray',
              player,
              from,
              to,
              pieceId: piece.id,
              pieceKind: piece.kind,
            });
          }
        }
        break;
      }
    }
  }

  return moves;
}

function generateDropMoves(state: GameState, player: Player): DropMove[] {
  const ruleset = getRuleset(state.rulesetId);
  const moves: DropMove[] = [];
  const frontline = getDropFrontline(state, player);

  for (const coord of listCoords()) {
    if (!isDropRowAllowed(player, frontline, coord.y)) {
      continue;
    }

    const targetStack = getStack(state.board, coord);
    for (const kind of ruleset.availableKinds) {
      if (state.hands[player][kind] <= 0) {
        continue;
      }

      if (targetStack.length === 0) {
        moves.push({
          type: 'drop',
          player,
          pieceKind: kind,
          to: coord,
        });
        continue;
      }

      if (
        ruleset.allowDropStacking &&
        targetStack.at(-1)?.owner === player &&
        isStackableTarget(ruleset, kind, targetStack)
      ) {
        moves.push({
          type: 'drop',
          player,
          pieceKind: kind,
          to: coord,
        });
      }
    }
  }

  return moves;
}

export function findMarshalCoord(state: GameState, player: Player): Coord | null {
  for (const coord of listCoords()) {
    const piece = getTopPiece(state.board, coord);
    if (piece?.owner === player && piece.kind === 'marshal') {
      return coord;
    }
  }
  return null;
}

export function isMarshalThreatened(state: GameState, player: Player): boolean {
  const marshalCoord = findMarshalCoord(state, player);
  if (!marshalCoord) {
    return true;
  }

  const opponent = getOpponent(player);
  const threats = generateBoardMoves(state, opponent);

  return threats.some((move) => move.type === 'capture' && compareCoords(move.to, marshalCoord));
}

export function generateLegalMoves(state: GameState, player: Player = state.turn): GameMove[] {
  if (state.winner) {
    return [];
  }

  if (state.phase === 'setup') {
    return generateSetupMoves(state, player);
  }

  const pseudoMoves = [...generateBoardMoves(state, player), ...generateDropMoves(state, player)];

  return pseudoMoves.filter((move) => {
    const nextState = applyMove(state, move, { validate: false, evaluateEndgame: false });
    return !isMarshalThreatened(nextState, player);
  });
}

export function recordNotation(move: GameMove, captured: PieceInstance[]): string {
  if (move.type === 'resign') {
    return `${move.player === 'south' ? '南' : '北'} 投了`;
  }

  if (move.type === 'ready') {
    return `${move.player === 'south' ? '南' : '北'} 済み`;
  }

  const side = move.player === 'south' ? '南' : '北';
  const pieceLabel = getPieceDefinition(move.pieceKind).label;
  const to = coordLabel(move.to);

  if (move.type === 'deploy') {
    return `${side} ${pieceLabel} 配置 ${to}`;
  }

  if (move.type === 'drop') {
    return `${side} ${pieceLabel} 新 ${to}`;
  }

  const action = move.type === 'capture' ? `x${captured.length}` : move.type === 'stack' ? 'ツケ' : '移動';
  return `${side} ${pieceLabel} ${coordLabel(move.from)}→${to} ${action}`;
}

function buildHistoryRecord(
  state: GameState,
  move: GameMove,
  captured: PieceInstance[],
  elapsedMs: number,
): MoveRecord {
  return {
    ply: state.history.length + 1,
    move,
    notation: formatNotation(move, captured),
    captured,
    elapsedMs,
  };
}

function formatNotation(move: GameMove, captured: PieceInstance[]): string {
  if (move.type === 'resign') {
    return `${move.player === 'south' ? '先手' : '後手'} 投了`;
  }

  if (move.type === 'ready') {
    return `${move.player === 'south' ? '先手' : '後手'} 済み`;
  }

  const side = move.player === 'south' ? '先手' : '後手';
  const pieceLabel = getPieceDefinition(move.pieceKind).label;
  const to = coordLabel(move.to);

  if (move.type === 'deploy') {
    return `${side} ${pieceLabel} 配置 ${to}`;
  }

  if (move.type === 'drop') {
    return `${side} ${pieceLabel} 新 ${to}`;
  }

  const action =
    move.type === 'capture'
      ? `x${captured.length}`
      : move.type === 'stack'
        ? 'ツケ'
        : move.type === 'betray'
          ? '寝返り'
          : '移動';
  return `${side} ${pieceLabel} ${coordLabel(move.from)}→${to} ${action}`;
}

function applySetupMove(
  state: GameState,
  move: DeployMove | ReadyMove,
  validate: boolean,
  recordedAt: string,
): GameState {
  const legalMoves = validate ? generateSetupMoves(state, move.player) : [];
  if (validate && !legalMoves.some((candidate) => stringifyMove(candidate) === stringifyMove(move))) {
    throw new Error('Illegal move');
  }

  const board = cloneBoard(state.board);
  const hands = cloneHands(state);
  const setupReady = cloneSetupReady(state);

  if (move.type === 'deploy') {
    const piece: PieceInstance = {
      id: createPieceId(state, move.player, move.pieceKind, 'setup'),
      kind: move.pieceKind,
      owner: move.player,
    };

    hands[move.player][move.pieceKind] -= 1;
    const destination = [...getStack(board, move.to), piece];
    setStack(board, move.to, destination);
  } else {
    setupReady[move.player] = true;
  }

  const opponent = getOpponent(move.player);
  const secondPlayer = getOpponent(state.startingPlayer);
  const setupComplete = setupReady[secondPlayer];
  const nextTurn = setupComplete
    ? state.startingPlayer
    : setupReady[opponent]
      ? move.player
      : opponent;
  const snapshot = getClockSnapshot(state.clock, recordedAt);

  return {
    ...state,
    board,
    hands,
    phase: setupComplete ? 'battle' : 'setup',
    turn: nextTurn,
    setupReady,
    clock: advanceClock(state.clock, recordedAt, true),
    updatedAt: recordedAt,
    history: [...state.history, buildHistoryRecord(state, move, [], snapshot.turnElapsedMs)],
  };
}

export function applyMove(
  state: GameState,
  move: GameMove,
  options: ApplyMoveOptions = {},
): GameState {
  const validate = options.validate ?? true;
  const evaluateEndgame = options.evaluateEndgame ?? true;
  const recordedAt = resolveRecordedAt(state, options);
  const snapshot = getClockSnapshot(state.clock, recordedAt);

  if (move.type === 'resign') {
    return {
      ...state,
      winner: getOpponent(move.player),
      victoryReason: 'resign',
      history: [...state.history, buildHistoryRecord(state, move, [], snapshot.turnElapsedMs)],
      clock: advanceClock(state.clock, recordedAt, false),
      updatedAt: recordedAt,
    };
  }

  if (state.phase === 'setup') {
    if (move.type !== 'deploy' && move.type !== 'ready') {
      throw new Error('Illegal move');
    }

    return applySetupMove(state, move, validate, recordedAt);
  }

  if (move.type === 'deploy' || move.type === 'ready') {
    throw new Error('Illegal move');
  }

  const legalMoves = validate ? generateLegalMoves(state, move.player) : [];
  if (validate && !legalMoves.some((candidate) => stringifyMove(candidate) === stringifyMove(move))) {
    throw new Error('Illegal move');
  }

  const board = cloneBoard(state.board);
  const hands = cloneHands(state);
  const captured: PieceInstance[] = [];
  let movingPiece: PieceInstance;

  if (move.type === 'drop') {
    movingPiece = {
      id: createPieceId(state, move.player, move.pieceKind, 'drop'),
      kind: move.pieceKind,
      owner: move.player,
    };
    hands[move.player][move.pieceKind] -= 1;
  } else {
    const fromStack = [...getStack(board, move.from)];
    movingPiece = fromStack.pop() as PieceInstance;
    setStack(board, move.from, fromStack);
  }

  const destination = [...getStack(board, move.to)];

  if (move.type === 'capture') {
    for (const piece of destination) {
      if (piece.owner !== move.player) {
        captured.push(piece);
      }
    }
    const survivors = destination.filter((piece) => piece.owner === move.player);
    survivors.push(movingPiece);
    setStack(board, move.to, survivors);
  } else if (move.type === 'betray') {
    const converted = destination.map((piece, index) => {
      if (piece.owner === move.player) {
        return piece;
      }

      captured.push(piece);
      hands[move.player][piece.kind] -= 1;

      return {
        id: createPieceId(state, move.player, piece.kind, 'betray', index),
        kind: piece.kind,
        owner: move.player,
      };
    });

    converted.push(movingPiece);
    setStack(board, move.to, converted);
  } else {
    destination.push(movingPiece);
    setStack(board, move.to, destination);
  }

  let winner: Player | null = state.winner;
  let victoryReason: GameState['victoryReason'] = state.victoryReason;

  if (captured.some((piece) => piece.kind === 'marshal')) {
    winner = move.player;
    victoryReason = 'capture';
  }

  const provisionalState: GameState = {
    ...state,
    board,
    hands,
    turn: getOpponent(move.player),
    winner,
    victoryReason,
    moveNumber: state.moveNumber + (move.player === 'north' ? 1 : 0),
    updatedAt: recordedAt,
    clock: advanceClock(state.clock, recordedAt, !winner),
    history: [...state.history, buildHistoryRecord(state, move, captured, snapshot.turnElapsedMs)],
  };

  if (winner || !evaluateEndgame) {
    return provisionalState;
  }

  const opponent = provisionalState.turn;
  const opponentMoves = generateLegalMoves(provisionalState, opponent);
  if (opponentMoves.length === 0 && isMarshalThreatened(provisionalState, opponent)) {
    return {
      ...provisionalState,
      winner: move.player,
      victoryReason: 'checkmate',
      clock: advanceClock(state.clock, recordedAt, false),
    };
  }

  return provisionalState;
}

export function createResignMove(player: Player): ResignMove {
  return { type: 'resign', player };
}

export function createReadyMove(player: Player): ReadyMove {
  return { type: 'ready', player };
}

export function getPlayerMaterial(state: GameState, player: Player): number {
  const boardValue = state.board
    .flat()
    .filter((piece) => piece.owner === player)
    .reduce((sum, piece) => sum + getPieceDefinition(piece.kind).value, 0);

  const handValue = Object.entries(state.hands[player]).reduce((sum, [kind, count]) => {
    return sum + getPieceDefinition(kind as PieceKind).value * count * 0.8;
  }, 0);

  return boardValue + handValue;
}
