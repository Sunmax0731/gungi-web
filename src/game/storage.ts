import { createInitialGame } from './setup';
import { type GameState, type RulesetId, type SetupTemplateId } from './types';

const STORAGE_KEY = 'gungi-web-save-v3';
const LEGACY_STORAGE_KEYS = ['gungi-web-save-v2', 'gungi-web-save-v1'] as const;

function normalizeRulesetId(value: unknown): RulesetId {
  return value === 'advanced' ? 'advanced' : 'beginner';
}

function normalizeSetupTemplateId(value: unknown): SetupTemplateId {
  return value === 'recommended' ? 'recommended' : 'manual';
}

function isGameState(value: unknown): value is Partial<GameState> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<GameState>;
  return Array.isArray(candidate.board) && typeof candidate.turn === 'string' && Array.isArray(candidate.history);
}

function normalizeGameState(value: Partial<GameState>): GameState {
  const normalizedRulesetId = normalizeRulesetId(value.rulesetId);
  const normalizedSetupTemplateId = normalizeSetupTemplateId(value.setupTemplateId);
  const fallback = createInitialGame(normalizedRulesetId, normalizedSetupTemplateId);
  const now = new Date().toISOString();
  const createdAt = value.createdAt ?? fallback.createdAt;
  const updatedAt = value.updatedAt ?? fallback.updatedAt;
  const legacyElapsedMs = Math.max(0, new Date(updatedAt).getTime() - new Date(createdAt).getTime());
  const fallbackClock = value.winner
    ? { matchElapsedMs: legacyElapsedMs, turnElapsedMs: 0, runningSince: null }
    : { matchElapsedMs: legacyElapsedMs, turnElapsedMs: 0, runningSince: now };
  const history = Array.isArray(value.history)
    ? value.history.map((record) => ({
        ...record,
        elapsedMs: typeof record.elapsedMs === 'number' ? record.elapsedMs : 0,
      }))
    : fallback.history;
  const normalizedClock = value.clock ?? fallbackClock;

  return {
    ...fallback,
    ...value,
    rulesetId: normalizedRulesetId,
    setupTemplateId: normalizedRulesetId === 'advanced' ? normalizedSetupTemplateId : null,
    phase: value.phase ?? fallback.phase,
    startingPlayer: value.startingPlayer ?? fallback.startingPlayer,
    setupReady: value.setupReady ?? fallback.setupReady,
    history,
    clock: value.winner
      ? {
          matchElapsedMs: normalizedClock.matchElapsedMs,
          turnElapsedMs: normalizedClock.turnElapsedMs,
          runningSince: null,
        }
      : normalizedClock,
    createdAt,
    updatedAt,
  };
}

function readStorage(): string | null {
  return (
    window.localStorage.getItem(STORAGE_KEY) ??
    LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean) ??
    null
  );
}

export function loadSavedGame(): GameState | null {
  try {
    const raw = readStorage();
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    return isGameState(parsed) ? normalizeGameState(parsed) : null;
  } catch {
    return null;
  }
}

export function saveGame(state: GameState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetSavedGame(): GameState {
  const fresh = createInitialGame('beginner');
  saveGame(fresh);
  return fresh;
}

export function clearSavedGame(): void {
  window.localStorage.removeItem(STORAGE_KEY);
  LEGACY_STORAGE_KEYS.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}
