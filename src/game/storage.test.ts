import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialGame } from './setup';
import {
  clearSavedGame,
  exportGameState,
  getAutosaveSummary,
  importGameState,
  listSaveSlots,
  loadGameFromSlot,
  saveGame,
  saveGameToSlot,
} from './storage';

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    get length() {
      return store.size;
    },
  };
}

describe('storage helpers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: createLocalStorageMock(),
      },
    });
    clearSavedGame();
  });

  it('persists autosave and manual slots separately', () => {
    const autosave = createInitialGame('beginner');
    const slotSave = createInitialGame('advanced');

    saveGame(autosave);
    saveGameToSlot('slot-2', slotSave);

    expect(getAutosaveSummary()?.rulesetId).toBe('beginner');
    expect(listSaveSlots().find((slot) => slot.id === 'slot-2')?.rulesetId).toBe('advanced');
    expect(loadGameFromSlot('slot-2')?.rulesetId).toBe('advanced');
  });

  it('exports and imports a game state with versioned payload', () => {
    const state = createInitialGame('advanced', 'recommended');
    const exported = exportGameState(state);
    const imported = importGameState(exported);

    expect(imported.rulesetId).toBe('advanced');
    expect(imported.setupTemplateId).toBe('recommended');
    expect(imported.board.flat()).toHaveLength(state.board.flat().length);
  });
});
