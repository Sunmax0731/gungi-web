/// <reference lib="webworker" />

import { computeBestMove } from './ai';
import { type CpuLevel, type GameMove, type GameState } from './types';

interface CpuWorkerRequest {
  id: number;
  level: CpuLevel;
  state: GameState;
}

interface CpuWorkerResponse {
  id: number;
  move: GameMove | null;
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<CpuWorkerRequest>) => {
  const response: CpuWorkerResponse = {
    id: event.data.id,
    move: computeBestMove(event.data.state, event.data.level),
  };

  workerScope.postMessage(response);
};

export {};
