# Architecture

## Frontend structure

- `src/App.tsx` composes the application shell, top-level dialogs, 3D board scene, and status panels.
- `src/hooks/useMatchSession.ts` owns the persisted match state, clock updates, save slots, and mode switching.
- `src/hooks/useCpuTurn.ts` drives CPU turns with the worker-backed search service.
- `src/hooks/useReplayState.ts` and `src/hooks/useSelectionState.ts` isolate replay and interaction state from the main match session.
- `src/game/*` contains the deterministic engine, AI, persistence helpers, and replay serialization.

## Match flow

1. `createInitialGame()` seeds the board, hands, clock, and metadata.
2. UI interactions and CPU results are applied through `applyMove()`.
3. Every state transition updates autosave data in `localStorage`.
4. Replay views are derived from `history`, not from imperative UI state.

## CPU and hinting

- CPU turns run through `CpuService`, which prefers a Web Worker and falls back to the main thread.
- The hint panel reuses the same search logic as the CPU, but only during human turns.
- Auto-match mode can assign separate difficulty levels to south and north CPU players.

## Persistence

- Browser persistence lives in `src/game/storage.ts`.
- Save data includes autosave, manual slots, export/import text, and replay-compatible history.
- Remote auto-match logging is configured separately through `VITE_AUTOMATCH_LOG_ENDPOINT`.

## Deployment

- This repository remains the source of truth for application code.
- Build with `npm run build`.
- Mirror `dist` into `D:\\Claude\\docs\\gungi`.
- Commit and push `D:\\Claude\\docs` to update `https://sunmax0731.github.io/gungi/`.
