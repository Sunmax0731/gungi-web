import { applyMove } from './engine';
import { createInitialGame } from './setup';
import { type GameState } from './types';

export interface ReplaySnapshot {
  ply: number;
  label: string;
  matchElapsedMs: number;
  state: GameState;
}

export function buildReplayTimeline(state: GameState): ReplaySnapshot[] {
  const initialState = createInitialGame(state.rulesetId, state.setupTemplateId ?? 'manual');
  let currentState: GameState = {
    ...initialState,
    createdAt: state.createdAt,
    updatedAt: state.createdAt,
  };
  let elapsedMs = 0;

  const snapshots: ReplaySnapshot[] = [
    {
      ply: 0,
      label: '開始局面',
      matchElapsedMs: 0,
      state: currentState,
    },
  ];

  for (const record of state.history) {
    elapsedMs += record.elapsedMs;
    const recordedAt = new Date(new Date(state.createdAt).getTime() + elapsedMs).toISOString();
    currentState = applyMove(currentState, record.move, { validate: false, recordedAt });
    snapshots.push({
      ply: record.ply,
      label: record.notation,
      matchElapsedMs: currentState.clock.matchElapsedMs,
      state: currentState,
    });
  }

  return snapshots;
}
