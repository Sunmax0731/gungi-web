/// <reference lib="webworker" />

import { computeBestMove } from './ai';
import { type CpuThought } from './cpu-thought';
import { type CpuLevel, type GameMove, type GameState } from './types';

interface CpuWorkerRequest {
  id: number;
  level: CpuLevel;
  state: GameState;
}

interface CpuWorkerProgressResponse {
  id: number;
  type: 'progress';
  thought: CpuThought;
}

interface CpuWorkerResultResponse {
  id: number;
  type: 'result';
  move: GameMove | null;
}

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<CpuWorkerRequest>) => {
  const move = computeBestMove(event.data.state, event.data.level, {
    onProgress: (thought) => {
      const progressResponse: CpuWorkerProgressResponse = {
        id: event.data.id,
        type: 'progress',
        thought,
      };

      workerScope.postMessage(progressResponse);
    },
  });

  const resultResponse: CpuWorkerResultResponse = {
    id: event.data.id,
    type: 'result',
    move,
  };

  workerScope.postMessage(resultResponse);
};

export {};
