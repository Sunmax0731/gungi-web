import { useMemo, useState } from 'react';
import { buildReplayTimeline } from '../game/replay';
import { type GameState } from '../game/types';

export function useReplayState(game: GameState) {
  const timeline = useMemo(() => buildReplayTimeline(game), [game]);
  const [replayPly, setReplayPly] = useState<number | null>(null);
  const normalizedReplayPly = replayPly === null ? null : Math.min(replayPly, timeline.length - 1);
  const activeSnapshot = normalizedReplayPly === null ? timeline.at(-1)! : timeline[normalizedReplayPly];
  const isReplaying = normalizedReplayPly !== null;

  return {
    activeSnapshot,
    timeline,
    isReplaying,
    replayPly: normalizedReplayPly,
    selectedPly: activeSnapshot.ply,
    startReplayAt: (ply: number) => setReplayPly(Math.max(0, Math.min(ply, timeline.length - 1))),
    stepBackward: () => setReplayPly((current) => Math.max(0, (current ?? timeline.length - 1) - 1)),
    stepForward: () =>
      setReplayPly((current) => (current === null ? null : Math.min(timeline.length - 1, current + 1))),
    jumpToStart: () => setReplayPly(0),
    jumpToLatest: () => setReplayPly(null),
  };
}
