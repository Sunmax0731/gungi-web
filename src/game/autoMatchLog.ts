import { getMatchElapsedMs } from './clock';
import { type CpuLevel, type GameState, type Player, type RulesetId, type VictoryReason } from './types';

export interface AutoMatchLogSummary {
  createdAt: string;
  matchElapsedMs: number;
  moveCount: number;
  rulesetId: RulesetId;
  startingPlayer: Player;
  updatedAt: string;
  victoryReason: VictoryReason | null;
  winner: Player | null;
}

export interface AutoMatchLogPayload {
  schemaVersion: 1;
  savedAt: string;
  matchId: string;
  source: 'gungi-web';
  summary: AutoMatchLogSummary;
  cpuLevels: Record<Player, CpuLevel>;
  finalState: GameState;
}

export function getAutoMatchLogMatchId(game: GameState): string {
  return game.createdAt;
}

export function getAutoMatchLogUploadKey(game: GameState): string {
  return `${getAutoMatchLogMatchId(game)}:${game.updatedAt}:${game.history.length}:${game.winner ?? 'pending'}`;
}

export function createAutoMatchLogPayload(
  game: GameState,
  cpuLevels: Record<Player, CpuLevel>,
  savedAt: string = new Date().toISOString(),
): AutoMatchLogPayload {
  return {
    schemaVersion: 1,
    savedAt,
    matchId: getAutoMatchLogMatchId(game),
    source: 'gungi-web',
    summary: {
      createdAt: game.createdAt,
      matchElapsedMs: getMatchElapsedMs(game, game.updatedAt),
      moveCount: game.history.length,
      rulesetId: game.rulesetId,
      startingPlayer: game.startingPlayer,
      updatedAt: game.updatedAt,
      victoryReason: game.victoryReason,
      winner: game.winner,
    },
    cpuLevels,
    finalState: game,
  };
}
