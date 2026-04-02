import { createEmptyBoard, getStack, mirrorCoord } from './board';
import { getRuleset } from './rulesets';
import {
  type Board,
  type GameState,
  type HandState,
  type PieceKind,
  type Player,
  type Ruleset,
  type RulesetId,
} from './types';

function createEmptyHands(ruleset: Ruleset): HandState {
  const createSide = (): Record<PieceKind, number> => ({
    marshal: ruleset.inventory.marshal,
    general: ruleset.inventory.general,
    lieutenant: ruleset.inventory.lieutenant,
    minor: ruleset.inventory.minor,
    samurai: ruleset.inventory.samurai,
    spear: ruleset.inventory.spear,
    horse: ruleset.inventory.horse,
    shinobi: ruleset.inventory.shinobi,
    fortress: ruleset.inventory.fortress,
    soldier: ruleset.inventory.soldier,
    bow: ruleset.inventory.bow,
    cylinder: ruleset.inventory.cylinder,
    cannon: ruleset.inventory.cannon,
    tactician: ruleset.inventory.tactician,
  });

  return {
    south: createSide(),
    north: createSide(),
  };
}

function consumeHandPiece(hands: HandState, owner: Player, kind: PieceKind) {
  hands[owner][kind] -= 1;
}

function placeFixedSetup(board: Board, hands: HandState, ruleset: Ruleset) {
  if (ruleset.setup.kind !== 'fixed') {
    return;
  }

  const counters = new Map<string, number>();

  const nextId = (owner: Player, kind: PieceKind): string => {
    const key = `${owner}:${kind}`;
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    return `${owner}-${kind}-${count}`;
  };

  for (const placement of ruleset.setup.southPlacements) {
    const southStack = getStack(board, placement.coord);
    for (const kind of placement.pieces) {
      southStack.push({ id: nextId('south', kind), kind, owner: 'south' });
      consumeHandPiece(hands, 'south', kind);
    }

    const mirrored = mirrorCoord(placement.coord);
    const northStack = getStack(board, mirrored);
    for (const kind of placement.pieces) {
      northStack.push({ id: nextId('north', kind), kind, owner: 'north' });
      consumeHandPiece(hands, 'north', kind);
    }
  }
}

export function createInitialGame(rulesetId: RulesetId = 'beginner'): GameState {
  const ruleset = getRuleset(rulesetId);
  const board = createEmptyBoard();
  const hands = createEmptyHands(ruleset);
  const timestamp = new Date().toISOString();

  if (ruleset.setup.kind === 'fixed') {
    placeFixedSetup(board, hands, ruleset);
  }

  return {
    rulesetId,
    phase: ruleset.setup.kind === 'fixed' ? 'battle' : 'setup',
    board,
    hands,
    turn: 'south',
    startingPlayer: 'south',
    setupReady: {
      south: ruleset.setup.kind === 'fixed',
      north: ruleset.setup.kind === 'fixed',
    },
    winner: null,
    victoryReason: null,
    moveNumber: 1,
    history: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
