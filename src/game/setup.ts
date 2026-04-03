import { createEmptyBoard, getStack, mirrorCoord } from './board';
import { createInitialClock } from './clock';
import { getRuleset } from './rulesets';
import {
  type Board,
  type GameState,
  type HandState,
  type PieceKind,
  type Player,
  type Ruleset,
  type RulesetId,
  type SetupPlacement,
  type SetupTemplateId,
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

function createIdFactory() {
  const counters = new Map<string, number>();

  return (owner: Player, kind: PieceKind): string => {
    const key = `${owner}:${kind}`;
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    return `${owner}-${kind}-${count}`;
  };
}

function placePlacements(
  board: Board,
  hands: HandState,
  placements: readonly SetupPlacement[],
  owner: Player,
  nextId: (owner: Player, kind: PieceKind) => string,
) {
  for (const placement of placements) {
    const coord = owner === 'south' ? placement.coord : mirrorCoord(placement.coord);
    const stack = getStack(board, coord);

    for (const kind of placement.pieces) {
      stack.push({ id: nextId(owner, kind), kind, owner });
      consumeHandPiece(hands, owner, kind);
    }
  }
}

function placeFixedSetup(board: Board, hands: HandState, ruleset: Ruleset) {
  if (ruleset.setup.kind !== 'fixed') {
    return;
  }

  const nextId = createIdFactory();
  placePlacements(board, hands, ruleset.setup.southPlacements, 'south', nextId);
  placePlacements(board, hands, ruleset.setup.southPlacements, 'north', nextId);
}

function placeRecommendedSetup(board: Board, hands: HandState, ruleset: Ruleset) {
  if (ruleset.setup.kind !== 'free') {
    return;
  }

  const nextId = createIdFactory();
  placePlacements(board, hands, ruleset.setup.preferredPlacements, 'south', nextId);
}

export function createInitialGame(
  rulesetId: RulesetId = 'beginner',
  setupTemplateId: SetupTemplateId = 'manual',
): GameState {
  const ruleset = getRuleset(rulesetId);
  const board = createEmptyBoard();
  const hands = createEmptyHands(ruleset);
  const timestamp = new Date().toISOString();

  if (ruleset.setup.kind === 'fixed') {
    placeFixedSetup(board, hands, ruleset);
  } else if (setupTemplateId === 'recommended') {
    placeRecommendedSetup(board, hands, ruleset);
  }

  return {
    rulesetId,
    setupTemplateId: ruleset.setup.kind === 'free' ? setupTemplateId : null,
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
    clock: createInitialClock(timestamp),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function applySetupTemplate(
  state: GameState,
  setupTemplateId: SetupTemplateId = 'manual',
): GameState {
  if (state.phase !== 'setup') {
    return state;
  }

  const templateState = createInitialGame(state.rulesetId, setupTemplateId);
  return {
    ...templateState,
    clock: state.clock,
    createdAt: state.createdAt,
    updatedAt: new Date().toISOString(),
  };
}
