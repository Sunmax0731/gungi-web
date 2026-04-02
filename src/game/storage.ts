import { createInitialGame } from './setup';
import { type GameState, type RulesetId } from './types';

const STORAGE_KEY = 'gungi-web-save-v2';
const LEGACY_STORAGE_KEY = 'gungi-web-save-v1';

function normalizeRulesetId(value: unknown): RulesetId {
  return value === 'advanced' ? 'advanced' : 'beginner';
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
  const fallback = createInitialGame(normalizedRulesetId);

  return {
    ...fallback,
    ...value,
    rulesetId: normalizedRulesetId,
    phase: value.phase ?? fallback.phase,
    startingPlayer: value.startingPlayer ?? fallback.startingPlayer,
    setupReady: value.setupReady ?? fallback.setupReady,
    createdAt: value.createdAt ?? fallback.createdAt,
    updatedAt: value.updatedAt ?? fallback.updatedAt,
  };
}

function readStorage(): string | null {
  return (
    window.localStorage.getItem(STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_STORAGE_KEY)
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
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
}
