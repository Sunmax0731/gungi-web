import { computeBestMove } from './ai';
import { type CpuThought, type CpuThoughtReporter } from './cpu-thought';
import { type CpuLevel, type GameMove, type GameState } from './types';

export type CpuBackend = 'worker' | 'main-thread';

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

type CpuWorkerResponse = CpuWorkerProgressResponse | CpuWorkerResultResponse;

interface PendingRequest {
  reject: (reason?: unknown) => void;
  resolve: (move: GameMove | null) => void;
  onProgress?: CpuThoughtReporter;
}

export class CpuService {
  private backend: CpuBackend;
  private nextRequestId = 0;
  private pending = new Map<number, PendingRequest>();
  private worker: Worker | null;

  constructor() {
    this.worker = this.createWorker();
    this.backend = this.worker ? 'worker' : 'main-thread';
  }

  get mode(): CpuBackend {
    return this.backend;
  }

  async computeMove(
    state: GameState,
    level: CpuLevel,
    onProgress?: CpuThoughtReporter,
  ): Promise<GameMove | null> {
    if (!this.worker) {
      return computeBestMove(state, level, { onProgress });
    }

    const request: CpuWorkerRequest = {
      id: ++this.nextRequestId,
      level,
      state,
    };

    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject, onProgress });
      this.worker?.postMessage(request);
    });
  }

  dispose(): void {
    this.pending.forEach(({ reject }) => reject(new Error('CPU service disposed')));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.backend = 'main-thread';
  }

  private createWorker(): Worker | null {
    if (typeof Worker === 'undefined') {
      return null;
    }

    try {
      const worker = new Worker(new URL('./cpu.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (event: MessageEvent<CpuWorkerResponse>) => {
        const pending = this.pending.get(event.data.id);
        if (!pending) {
          return;
        }

        if (event.data.type === 'progress') {
          pending.onProgress?.(event.data.thought);
          return;
        }

        this.pending.delete(event.data.id);
        pending.resolve(event.data.move);
      };

      worker.onerror = (event) => {
        this.pending.forEach(({ reject }) => reject(event.error ?? new Error('CPU worker failed')));
        this.pending.clear();
        worker.terminate();
        this.worker = null;
        this.backend = 'main-thread';
      };

      return worker;
    } catch {
      return null;
    }
  }
}

export function createCpuService(): CpuService {
  return new CpuService();
}
