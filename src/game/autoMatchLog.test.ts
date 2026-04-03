import { describe, expect, it } from 'vitest';
import { createAutoMatchLogPayload, getAutoMatchLogMatchId, getAutoMatchLogUploadKey } from './autoMatchLog';
import { createInitialGame } from './setup';
import { type GameState } from './types';

function createFinishedAutoMatch(): GameState {
  const state = createInitialGame('advanced');

  return {
    ...state,
    startingPlayer: 'north',
    winner: 'south',
    victoryReason: 'checkmate',
    updatedAt: '2026-04-03T09:00:00.000Z',
    history: [
      {
        ply: 1,
        notation: '王 5一 配置',
        captured: [],
        elapsedMs: 4_200,
        move: {
          type: 'deploy',
          player: 'south',
          pieceKind: 'marshal',
          to: { x: 4, y: 0 },
        },
      },
      {
        ply: 2,
        notation: '王 5九 配置',
        captured: [],
        elapsedMs: 5_800,
        move: {
          type: 'deploy',
          player: 'north',
          pieceKind: 'marshal',
          to: { x: 4, y: 8 },
        },
      },
    ],
    clock: {
      matchElapsedMs: 126_000,
      turnElapsedMs: 0,
      runningSince: null,
    },
  };
}

describe('auto-match log helpers', () => {
  it('builds a deterministic match id and upload key from the game state', () => {
    const game = createFinishedAutoMatch();

    expect(getAutoMatchLogMatchId(game)).toBe(game.createdAt);
    expect(getAutoMatchLogUploadKey(game)).toContain(game.createdAt);
    expect(getAutoMatchLogUploadKey(game)).toContain(game.updatedAt);
  });

  it('serializes a completed auto-match into a server payload', () => {
    const game = createFinishedAutoMatch();
    const payload = createAutoMatchLogPayload(
      game,
      {
        south: 'hard',
        north: 'normal',
      },
      '2026-04-03T09:01:00.000Z',
    );

    expect(payload.schemaVersion).toBe(1);
    expect(payload.savedAt).toBe('2026-04-03T09:01:00.000Z');
    expect(payload.summary.matchElapsedMs).toBe(126_000);
    expect(payload.summary.moveCount).toBe(2);
    expect(payload.summary.rulesetId).toBe('advanced');
    expect(payload.summary.startingPlayer).toBe('north');
    expect(payload.summary.winner).toBe('south');
    expect(payload.cpuLevels.south).toBe('hard');
    expect(payload.cpuLevels.north).toBe('normal');
    expect(payload.finalState.history[0]?.notation).toBe('王 5一 配置');
  });
});
