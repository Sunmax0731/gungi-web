export const BOARD_SIZE = 9 as const;

export type Player = 'south' | 'north';

export type RulesetId = 'beginner' | 'advanced';

export type VictoryReason = 'capture' | 'checkmate' | 'resign';

export type CpuLevel = 'easy' | 'normal' | 'hard';

export type GamePhase = 'setup' | 'battle';

export type PieceKind =
  | 'marshal'
  | 'general'
  | 'lieutenant'
  | 'minor'
  | 'samurai'
  | 'spear'
  | 'horse'
  | 'shinobi'
  | 'fortress'
  | 'soldier'
  | 'bow'
  | 'cylinder'
  | 'cannon'
  | 'tactician';

export interface Coord {
  x: number;
  y: number;
}

export interface PieceInstance {
  id: string;
  kind: PieceKind;
  owner: Player;
}

export type BoardStack = PieceInstance[];

export type Board = BoardStack[];

export type HandState = Record<Player, Record<PieceKind, number>>;

export interface MoveVector {
  dx: number;
  dy: number;
  maxByTier: readonly [number, number, number];
  minByTier?: readonly [number, number, number];
  leap?: boolean;
  originShift?: {
    dx: number;
    dy: number;
  };
  jumpOverOrigin?: boolean;
}

export interface PieceDefinition {
  kind: PieceKind;
  label: string;
  shortLabel: string;
  value: number;
  tags: readonly string[];
  movement: readonly MoveVector[];
}

export interface SetupPlacement {
  coord: Coord;
  pieces: readonly PieceKind[];
}

export interface FixedSetupPreset {
  kind: 'fixed';
  id: string;
  name: string;
  description: string;
  southPlacements: readonly SetupPlacement[];
}

export interface FreeSetupPreset {
  kind: 'free';
  id: string;
  name: string;
  description: string;
  deploymentRows: number;
  allowStacking: boolean;
  preferredPlacements: readonly SetupPlacement[];
}

export type SetupPreset = FixedSetupPreset | FreeSetupPreset;

export interface Ruleset {
  id: RulesetId;
  name: string;
  description: string;
  maxStackHeight: 2 | 3;
  allowMarshalStacking: boolean;
  allowDropStacking: boolean;
  availableKinds: readonly PieceKind[];
  inventory: Record<PieceKind, number>;
  setup: SetupPreset;
}

export interface BoardMove {
  type: 'move' | 'stack' | 'capture' | 'betray';
  player: Player;
  from: Coord;
  to: Coord;
  pieceId: string;
  pieceKind: PieceKind;
}

export interface DropMove {
  type: 'drop';
  player: Player;
  pieceKind: PieceKind;
  to: Coord;
}

export interface DeployMove {
  type: 'deploy';
  player: Player;
  pieceKind: PieceKind;
  to: Coord;
}

export interface ReadyMove {
  type: 'ready';
  player: Player;
}

export interface ResignMove {
  type: 'resign';
  player: Player;
}

export type GameMove = BoardMove | DropMove | DeployMove | ReadyMove | ResignMove;

export interface MoveRecord {
  ply: number;
  move: GameMove;
  notation: string;
  captured: PieceInstance[];
  elapsedMs: number;
}

export interface GameClock {
  matchElapsedMs: number;
  turnElapsedMs: number;
  runningSince: string | null;
}

export interface GameState {
  rulesetId: RulesetId;
  phase: GamePhase;
  board: Board;
  hands: HandState;
  turn: Player;
  startingPlayer: Player;
  setupReady: Record<Player, boolean>;
  winner: Player | null;
  victoryReason: VictoryReason | null;
  moveNumber: number;
  history: MoveRecord[];
  clock: GameClock;
  createdAt: string;
  updatedAt: string;
}

export interface ApplyMoveOptions {
  validate?: boolean;
  evaluateEndgame?: boolean;
  recordedAt?: string;
}

export interface SearchOptions {
  depth: number;
  beamWidth: number;
}
