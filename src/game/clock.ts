import { type GameClock, type GameState } from './types';

function toMillis(value: string): number {
  return new Date(value).getTime();
}

function getElapsedBetween(startedAt: string | null, endedAt: string): number {
  if (!startedAt) {
    return 0;
  }

  return Math.max(0, toMillis(endedAt) - toMillis(startedAt));
}

export function createInitialClock(startedAt: string): GameClock {
  return {
    matchElapsedMs: 0,
    turnElapsedMs: 0,
    runningSince: startedAt,
  };
}

export function getClockSnapshot(clock: GameClock, at: string): Pick<GameClock, 'matchElapsedMs' | 'turnElapsedMs'> {
  const elapsedSinceResume = getElapsedBetween(clock.runningSince, at);

  return {
    matchElapsedMs: clock.matchElapsedMs + elapsedSinceResume,
    turnElapsedMs: clock.turnElapsedMs + elapsedSinceResume,
  };
}

export function getMatchElapsedMs(state: GameState, at: string = new Date().toISOString()): number {
  return getClockSnapshot(state.clock, at).matchElapsedMs;
}

export function advanceClock(clock: GameClock, at: string, running: boolean): GameClock {
  const snapshot = getClockSnapshot(clock, at);

  return {
    matchElapsedMs: snapshot.matchElapsedMs,
    turnElapsedMs: 0,
    runningSince: running ? at : null,
  };
}

export function pauseGameClock(state: GameState, at: string = new Date().toISOString()): GameState {
  if (state.winner || !state.clock.runningSince) {
    return state;
  }

  const snapshot = getClockSnapshot(state.clock, at);

  return {
    ...state,
    clock: {
      matchElapsedMs: snapshot.matchElapsedMs,
      turnElapsedMs: snapshot.turnElapsedMs,
      runningSince: null,
    },
    updatedAt: at,
  };
}

export function resumeGameClock(state: GameState, at: string = new Date().toISOString()): GameState {
  if (state.winner || state.clock.runningSince) {
    return state;
  }

  return {
    ...state,
    clock: {
      ...state.clock,
      runningSince: at,
    },
    updatedAt: at,
  };
}
