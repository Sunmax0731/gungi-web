import { getMatchElapsedMs } from './clock';
import { createInitialGame } from './setup';
import { type GamePhase, type GameState, type Player, type RulesetId, type SetupTemplateId, type VictoryReason } from './types';

const STORAGE_KEY = 'gungi-web-saves-v4';
const LEGACY_STORAGE_KEYS = ['gungi-web-save-v3', 'gungi-web-save-v2', 'gungi-web-save-v1'] as const;
const SAVE_SLOT_DEFINITIONS = [
  { id: 'slot-1', label: 'スロット1' },
  { id: 'slot-2', label: 'スロット2' },
  { id: 'slot-3', label: 'スロット3' },
  { id: 'slot-4', label: 'スロット4' },
] as const;
const storageListeners = new Set<() => void>();
let cachedBrowserSnapshot: SaveBrowserSnapshot = {
  autosaveSummary: null,
  saveSlots: SAVE_SLOT_DEFINITIONS.map((slot) => ({
    id: slot.id,
    label: slot.label,
    updatedAt: null,
    matchElapsedMs: null,
    moveCount: null,
    phase: null,
    rulesetId: null,
    victoryReason: null,
    winner: null,
  })),
};
let cachedBrowserSnapshotKey = JSON.stringify(cachedBrowserSnapshot);

interface StoredSaveEnvelope {
  version: 1;
  autosave: unknown | null;
  slots: Array<{
    id: string;
    label: string;
    state: unknown | null;
  }>;
}

export interface SaveSlotSummary {
  id: string;
  label: string;
  updatedAt: string | null;
  matchElapsedMs: number | null;
  moveCount: number | null;
  phase: GamePhase | null;
  rulesetId: RulesetId | null;
  victoryReason: VictoryReason | null;
  winner: Player | null;
}

interface ExportEnvelope {
  version: 1;
  exportedAt: string;
  state: GameState;
}

export interface SaveBrowserSnapshot {
  autosaveSummary: SaveSlotSummary | null;
  saveSlots: SaveSlotSummary[];
}

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

function normalizeStateCandidate(value: unknown): GameState | null {
  return isGameState(value) ? normalizeGameState(value) : null;
}

function createDefaultEnvelope(): StoredSaveEnvelope {
  return {
    version: 1,
    autosave: null,
    slots: SAVE_SLOT_DEFINITIONS.map((slot) => ({
      id: slot.id,
      label: slot.label,
      state: null,
    })),
  };
}

function tryParseEnvelope(raw: string | null): StoredSaveEnvelope | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const candidate = parsed as Partial<StoredSaveEnvelope>;
    if (candidate.version !== 1 || !Array.isArray(candidate.slots)) {
      return null;
    }

    const slotMap = new Map(
      candidate.slots.map((slot) => [
        slot.id,
        {
          id: slot.id,
          label: typeof slot.label === 'string' ? slot.label : SAVE_SLOT_DEFINITIONS.find((entry) => entry.id === slot.id)?.label ?? slot.id,
          state: slot.state ?? null,
        },
      ]),
    );

    return {
      version: 1,
      autosave: candidate.autosave ?? null,
      slots: SAVE_SLOT_DEFINITIONS.map((slot) => slotMap.get(slot.id) ?? { id: slot.id, label: slot.label, state: null }),
    };
  } catch {
    return null;
  }
}

function readEnvelope(): StoredSaveEnvelope {
  const current = tryParseEnvelope(window.localStorage.getItem(STORAGE_KEY));
  if (current) {
    return current;
  }

  for (const key of LEGACY_STORAGE_KEYS) {
    const legacyRaw = window.localStorage.getItem(key);
    if (!legacyRaw) {
      continue;
    }

    try {
      const parsed = JSON.parse(legacyRaw) as unknown;
      if (isGameState(parsed)) {
        return {
          ...createDefaultEnvelope(),
          autosave: parsed,
        };
      }
    } catch {
      return createDefaultEnvelope();
    }
  }

  return createDefaultEnvelope();
}

function writeEnvelope(envelope: StoredSaveEnvelope): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  storageListeners.forEach((listener) => listener());
}

function buildSummary(id: string, label: string, state: GameState | null): SaveSlotSummary {
  return {
    id,
    label,
    updatedAt: state?.updatedAt ?? null,
    matchElapsedMs: state ? getMatchElapsedMs(state, state.updatedAt) : null,
    moveCount: state?.history.length ?? null,
    phase: state?.phase ?? null,
    rulesetId: state?.rulesetId ?? null,
    victoryReason: state?.victoryReason ?? null,
    winner: state?.winner ?? null,
  };
}

function updateSlotState(envelope: StoredSaveEnvelope, slotId: string, state: GameState | null): StoredSaveEnvelope {
  return {
    ...envelope,
    slots: envelope.slots.map((slot) => (slot.id === slotId ? { ...slot, state } : slot)),
  };
}

export function loadSavedGame(): GameState | null {
  const envelope = readEnvelope();
  const autosaveState = normalizeStateCandidate(envelope.autosave);
  if (autosaveState) {
    return autosaveState;
  }

  const latestManual = envelope.slots
    .map((slot) => normalizeStateCandidate(slot.state))
    .filter((state): state is GameState => !!state)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0];

  return latestManual ?? null;
}

export function saveGame(state: GameState): void {
  const envelope = readEnvelope();
  writeEnvelope({
    ...envelope,
    autosave: state,
  });
}

export function listSaveSlots(): SaveSlotSummary[] {
  const envelope = readEnvelope();
  return envelope.slots.map((slot) => buildSummary(slot.id, slot.label, normalizeStateCandidate(slot.state)));
}

export function getAutosaveSummary(): SaveSlotSummary | null {
  const envelope = readEnvelope();
  const state = normalizeStateCandidate(envelope.autosave);
  return state ? buildSummary('autosave', '自動保存', state) : null;
}

export function getSaveBrowserSnapshot(): SaveBrowserSnapshot {
  const nextSnapshot = {
    autosaveSummary: getAutosaveSummary(),
    saveSlots: listSaveSlots(),
  };
  const nextKey = JSON.stringify(nextSnapshot);

  if (nextKey === cachedBrowserSnapshotKey) {
    return cachedBrowserSnapshot;
  }

  cachedBrowserSnapshot = nextSnapshot;
  cachedBrowserSnapshotKey = nextKey;
  return nextSnapshot;
}

export function subscribeStorage(listener: () => void): () => void {
  storageListeners.add(listener);
  return () => {
    storageListeners.delete(listener);
  };
}

export function saveGameToSlot(slotId: string, state: GameState): SaveSlotSummary {
  const envelope = readEnvelope();
  const nextEnvelope = updateSlotState(envelope, slotId, state);
  writeEnvelope(nextEnvelope);
  const slot = nextEnvelope.slots.find((entry) => entry.id === slotId);
  return buildSummary(
    slot?.id ?? slotId,
    slot?.label ?? slotId,
    normalizeStateCandidate(slot?.state ?? state),
  );
}

export function loadGameFromSlot(slotId: string): GameState | null {
  const envelope = readEnvelope();
  const slot = envelope.slots.find((entry) => entry.id === slotId);
  return normalizeStateCandidate(slot?.state ?? null);
}

export function deleteGameFromSlot(slotId: string): void {
  const envelope = readEnvelope();
  writeEnvelope(updateSlotState(envelope, slotId, null));
}

export function exportGameState(state: GameState): string {
  const payload: ExportEnvelope = {
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  };

  return JSON.stringify(payload, null, 2);
}

export function importGameState(raw: string): GameState {
  const parsed = JSON.parse(raw) as unknown;
  if (isGameState(parsed)) {
    return normalizeGameState(parsed);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('インポート形式が不正です。');
  }

  const envelope = parsed as Partial<ExportEnvelope>;
  const importedState = normalizeStateCandidate(envelope.state);
  if (!importedState) {
    throw new Error('対局データを読み込めませんでした。');
  }

  return importedState;
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
  storageListeners.forEach((listener) => listener());
}
