import { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { HAND_KIND_ORDER, cpuLevelText, formatClockDuration, getDefaultRuleGuideId, type RuleGuideId } from './app/gameUi';
import { HandTray, type TrayItemState } from './components/HandTray';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { GameResultDialog } from './components/dialogs/GameResultDialog';
import { MatchLogDialog } from './components/dialogs/MatchLogDialog';
import { RuleGuideDialog } from './components/dialogs/RuleGuideDialog';
import { compareCoords, getTopPiece } from './game/board';
import { getMatchElapsedMs, pauseGameClock, resumeGameClock } from './game/clock';
import { createCpuService } from './game/cpu-service';
import { type CpuThought } from './game/cpu-thought';
import {
  applyMove,
  createReadyMove,
  createResignMove,
  findMarshalCoord,
  generateLegalMoves,
  isMarshalThreatened,
} from './game/engine';
import { getPieceDefinition } from './game/pieces';
import { getRuleset } from './game/rulesets';
import { createInitialGame } from './game/setup';
import { clearSavedGame, loadSavedGame, saveGame } from './game/storage';
import {
  type Coord,
  type CpuLevel,
  type GameMove,
  type PieceKind,
  type Player,
  type RulesetId,
  type VictoryReason,
} from './game/types';

const HUMAN_PLAYER: Player = 'south';
const CPU_PLAYER: Player = 'north';
const DEFAULT_AUTO_CPU_LEVELS: Record<Player, CpuLevel> = {
  south: 'normal',
  north: 'normal',
};

const BoardScene = lazy(() =>
  import('./components/BoardScene').then((module) => ({ default: module.BoardScene })),
);

type MatchMode = 'human-vs-cpu' | 'cpu-vs-cpu';
type ConfirmActionId = 'new-game' | 'auto-match' | 'clear-save' | 'ready' | 'resign';

type DialogState =
  | { type: 'rules' }
  | { type: 'log' }
  | { type: 'confirm'; action: ConfirmActionId }
  | { type: 'result'; winner: Player; reason: VictoryReason | null }
  | null;

interface CpuThoughtEntry {
  thought: CpuThought;
  elapsedMs: number;
}

function isTargetMove(move: GameMove): move is Exclude<GameMove, { type: 'ready' } | { type: 'resign' }> {
  return 'to' in move;
}

function formatThoughtDuration(elapsedMs: number): string {
  if (elapsedMs < 1_000) {
    return `${Math.round(elapsedMs)}ミリ秒`;
  }

  if (elapsedMs < 10_000) {
    return `${(elapsedMs / 1_000).toFixed(1)}秒`;
  }

  return `${Math.round(elapsedMs / 1_000)}秒`;
}

function appendCpuThought(thoughts: CpuThoughtEntry[], thought: CpuThought, elapsedMs: number): CpuThoughtEntry[] {
  return [...thoughts, { thought, elapsedMs }].slice(-5);
}

function getParticipantLabel(player: Player, mode: MatchMode): string {
  if (mode === 'cpu-vs-cpu') {
    return player === 'south' ? '先手CPU' : '後手CPU';
  }

  return player === HUMAN_PLAYER ? 'あなた' : 'CPU';
}

function getVictoryReasonLabel(reason: VictoryReason | null): string {
  if (reason === 'capture') {
    return '帥の撃破';
  }
  if (reason === 'checkmate') {
    return '詰み';
  }
  if (reason === 'resign') {
    return '投了';
  }
  return '対局終了';
}

function getMoveTypeLabel(move: GameMove): string {
  if (move.type === 'capture') {
    return '捕獲';
  }
  if (move.type === 'stack') {
    return '重ねる';
  }
  if (move.type === 'betray') {
    return '裏切り';
  }
  if (move.type === 'drop') {
    return '新';
  }
  if (move.type === 'deploy') {
    return '配置';
  }
  if (move.type === 'ready') {
    return '配置完了';
  }
  if (move.type === 'resign') {
    return '投了';
  }
  return '移動';
}

function getMoveButtonLabel(move: GameMove): string {
  if (move.type === 'ready' || move.type === 'resign') {
    return getMoveTypeLabel(move);
  }

  return `${getPieceDefinition(move.pieceKind).label} ${getMoveTypeLabel(move)}`;
}

function getMarshalStatus(
  marshalExists: boolean,
  threatened: boolean,
  inSetup: boolean,
  ready: boolean,
): string {
  if (inSetup) {
    if (ready) {
      return '配置完了';
    }

    return marshalExists ? '帥を配置済み' : '帥が未配置';
  }

  if (!marshalExists) {
    return '帥を喪失';
  }

  return threatened ? '王手' : '安全';
}

function getSelectionSummary(
  game: ReturnType<typeof createInitialGame>,
  selectedSquare: Coord | null,
  selectedHandKind: PieceKind | null,
): string {
  if (selectedHandKind) {
    return `選択中の持ち駒: ${getPieceDefinition(selectedHandKind).label}`;
  }

  if (selectedSquare && game.phase === 'battle') {
    const piece = getTopPiece(game.board, selectedSquare);
      if (piece) {
      return `選択中の駒: ${getPieceDefinition(piece.kind).label}`;
      }
  }

  if (game.phase === 'setup') {
    return '持ち駒を選んで配置マスをクリックしてください。';
  }

  return '盤上の駒か持ち駒を選ぶと、実行できる行動を確認できます。';
}

function App() {
  const initialGame = useMemo(() => loadSavedGame() ?? createInitialGame('beginner'), []);
  const [game, setGame] = useState(initialGame);
  const [matchMode, setMatchMode] = useState<MatchMode>('human-vs-cpu');
  const [autoMatchPaused, setAutoMatchPaused] = useState(false);
  const [pendingRulesetId, setPendingRulesetId] = useState<RulesetId>(initialGame.rulesetId);
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('normal');
  const [autoMatchCpuLevels, setAutoMatchCpuLevels] = useState<Record<Player, CpuLevel>>(DEFAULT_AUTO_CPU_LEVELS);
  const [selectedSquare, setSelectedSquare] = useState<Coord | null>(null);
  const [selectedHandKind, setSelectedHandKind] = useState<PieceKind | null>(null);
  const [pendingActions, setPendingActions] = useState<GameMove[]>([]);
  const [cpuThoughts, setCpuThoughts] = useState<CpuThoughtEntry[]>([]);
  const [cpuThoughtPlayer, setCpuThoughtPlayer] = useState<Player | null>(null);
  const [cpuThoughtStartedAt, setCpuThoughtStartedAt] = useState<number | null>(null);
  const [cpuThoughtElapsedMs, setCpuThoughtElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [clockNow, setClockNow] = useState(() => new Date().toISOString());
  const [activeRuleGuideId, setActiveRuleGuideId] = useState<RuleGuideId>(() =>
    getDefaultRuleGuideId(initialGame.rulesetId),
  );
  const resultDialogKeyRef = useRef<string | null>(null);
  const cpuService = useMemo(() => createCpuService(), []);

  const autoMatch = matchMode === 'cpu-vs-cpu';
  const thinking = !game.winner && (autoMatch ? !autoMatchPaused : game.turn === CPU_PLAYER);
  const activeCpuLevel = autoMatch ? autoMatchCpuLevels[game.turn] : cpuLevel;
  const ruleset = getRuleset(game.rulesetId);
  const legalMoves = useMemo(() => generateLegalMoves(game), [game]);
  const latestMoves = useMemo(() => [...game.history].reverse(), [game.history]);
  const visibleHandKinds = useMemo(
    () => HAND_KIND_ORDER.filter((kind) => ruleset.inventory[kind] > 0),
    [ruleset],
  );
  const matchElapsedMs = useMemo(() => getMatchElapsedMs(game, clockNow), [clockNow, game]);
  const matchElapsedLabel = useMemo(() => formatClockDuration(matchElapsedMs), [matchElapsedMs]);
  const southMarshal = useMemo(() => findMarshalCoord(game, 'south'), [game]);
  const northMarshal = useMemo(() => findMarshalCoord(game, 'north'), [game]);
  const southThreatened = useMemo(
    () => (game.phase === 'battle' ? isMarshalThreatened(game, 'south') : false),
    [game],
  );
  const northThreatened = useMemo(
    () => (game.phase === 'battle' ? isMarshalThreatened(game, 'north') : false),
    [game],
  );
  const canReady = useMemo(
    () => legalMoves.some((move) => move.type === 'ready' && move.player === HUMAN_PLAYER),
    [legalMoves],
  );
  const southLabel = getParticipantLabel('south', matchMode);
  const northLabel = getParticipantLabel('north', matchMode);
  const cpuThoughtTitle = `${getParticipantLabel(cpuThoughtPlayer ?? game.turn, matchMode)}の思考ログ`;
  const cpuThoughtElapsedLabel = formatThoughtDuration(cpuThoughtElapsedMs);
  const cpuSettingSummary = autoMatch
    ? `${southLabel}: ${cpuLevelText(autoMatchCpuLevels.south)}\n${northLabel}: ${cpuLevelText(autoMatchCpuLevels.north)}`
    : cpuLevelText(cpuLevel);
  const cpuBackendLabel = cpuService.mode === 'worker' ? 'ワーカー' : 'メインスレッド';
  const selectionSummary = getSelectionSummary(game, selectedSquare, selectedHandKind);

  const selectedMoves = useMemo(() => {
    if (selectedSquare && game.phase === 'battle') {
      return legalMoves.filter((move) => {
        if (move.type === 'drop' || move.type === 'deploy' || move.type === 'ready' || move.type === 'resign') {
          return false;
        }

        return compareCoords(move.from, selectedSquare);
      });
    }

    if (selectedHandKind) {
      return legalMoves.filter(
        (move) =>
          (move.type === 'drop' || move.type === 'deploy') && move.pieceKind === selectedHandKind,
      );
    }

    return [];
  }, [game.phase, legalMoves, selectedHandKind, selectedSquare]);

  const statusBanner = useMemo(() => {
    if (game.winner) {
      return {
        tone: 'victory',
        title: `${getParticipantLabel(game.winner, matchMode)}の勝利`,
        detail: `勝因: ${getVictoryReasonLabel(game.victoryReason)}`,
      };
    }

    if (autoMatchPaused) {
      return {
        tone: 'paused',
        title: '自動対局を一時停止中',
        detail: `再開すると ${getParticipantLabel(game.turn, matchMode)} の手番から続行します。`,
      };
    }

    if (thinking) {
      return {
        tone: 'thinking',
        title: autoMatch ? '自動対局中' : 'CPU 思考中',
        detail: `${getParticipantLabel(game.turn, matchMode)} が着手を選んでいます。`,
      };
    }

    if (game.phase === 'setup') {
      return {
        tone: 'setup',
        title: game.turn === HUMAN_PLAYER ? '配置フェーズ' : `${getParticipantLabel(game.turn, matchMode)} が配置中`,
        detail: selectionSummary,
      };
    }

    return {
      tone: 'active',
      title: `${getParticipantLabel(game.turn, matchMode)}の手番`,
      detail: selectionSummary,
    };
  }, [autoMatch, autoMatchPaused, game.phase, game.turn, game.victoryReason, game.winner, matchMode, selectionSummary, thinking]);

  useEffect(() => {
    saveGame(game);
  }, [game]);

  useEffect(() => {
    if (!game.clock.runningSince) {
      return;
    }

    const timer = window.setInterval(() => {
      setClockNow(new Date().toISOString());
    }, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [game.clock.runningSince]);

  useEffect(() => {
    return () => {
      cpuService.dispose();
    };
  }, [cpuService]);

  useEffect(() => {
    if (!game.winner) {
      resultDialogKeyRef.current = null;
      return;
    }

    const resultKey = `${game.updatedAt}:${game.winner}:${game.victoryReason ?? 'unknown'}`;
    if (resultDialogKeyRef.current === resultKey) {
      return;
    }

    resultDialogKeyRef.current = resultKey;
    const frame = window.requestAnimationFrame(() => {
      setDialogState({ type: 'result', winner: game.winner!, reason: game.victoryReason });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [game.updatedAt, game.victoryReason, game.winner]);

  useEffect(() => {
    if (!thinking || cpuThoughtStartedAt === null) {
      return;
    }

    const timer = window.setInterval(() => {
      setCpuThoughtElapsedMs(performance.now() - cpuThoughtStartedAt);
    }, 100);

    return () => {
      window.clearInterval(timer);
    };
  }, [cpuThoughtStartedAt, thinking]);

  useEffect(() => {
    if (!thinking) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCpuThoughtPlayer(game.turn);
      setCpuThoughts([]);
      const startedAt = performance.now();
      setCpuThoughtStartedAt(startedAt);
      setCpuThoughtElapsedMs(0);

      void cpuService
        .computeMove(game, activeCpuLevel, (thought) => {
          if (cancelled) {
            return;
          }

          const elapsedMs = performance.now() - startedAt;
          setCpuThoughtElapsedMs(elapsedMs);
          setCpuThoughts((current) => appendCpuThought(current, thought, elapsedMs));
        })
        .then((move) => {
          if (cancelled) {
            return;
          }

          setCpuThoughtElapsedMs(performance.now() - startedAt);

          startTransition(() => {
            setGame((current) => {
              if (current.updatedAt !== game.updatedAt) {
                return current;
              }

              return applyMove(current, move ?? createResignMove(game.turn), {
                recordedAt: new Date().toISOString(),
              });
            });
          });

          setSelectedSquare(null);
          setSelectedHandKind(null);
          setPendingActions([]);
          setErrorMessage(null);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }

          setErrorMessage(error instanceof Error ? error.message : 'CPU の思考に失敗しました。');
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeCpuLevel, cpuService, game, thinking]);

  const clearSelectionState = () => {
    setSelectedSquare(null);
    setSelectedHandKind(null);
    setPendingActions([]);
  };

  const executeMove = (move: GameMove) => {
    try {
      startTransition(() => {
        setGame((current) => applyMove(current, move, { recordedAt: new Date().toISOString() }));
      });
      clearSelectionState();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '手を適用できませんでした。');
    }
  };

  const handleSquareClick = (coord: Coord) => {
    if (autoMatch || game.turn !== HUMAN_PLAYER || game.winner || thinking) {
      return;
    }

    if (selectedHandKind) {
      const matches = selectedMoves.filter(
        (move): move is Exclude<GameMove, { type: 'ready' } | { type: 'resign' }> =>
          isTargetMove(move) && compareCoords(move.to, coord),
      );

      if (matches.length === 1) {
        executeMove(matches[0]);
        return;
      }

      if (matches.length > 1) {
        setPendingActions(matches);
        return;
      }
    }

    if (game.phase === 'setup') {
      setPendingActions([]);
      return;
    }

    const topPiece = getTopPiece(game.board, coord);
    const isOwnTop = topPiece?.owner === HUMAN_PLAYER;

    if (selectedSquare) {
      if (compareCoords(selectedSquare, coord)) {
        setSelectedSquare(null);
        setPendingActions([]);
        return;
      }

      const matches = selectedMoves.filter(
        (move): move is Exclude<GameMove, { type: 'ready' } | { type: 'resign' }> =>
          isTargetMove(move) && compareCoords(move.to, coord),
      );

      if (matches.length === 1) {
        executeMove(matches[0]);
        return;
      }

      if (matches.length > 1) {
        setPendingActions(matches);
        return;
      }

      if (isOwnTop) {
        setSelectedSquare(coord);
        setSelectedHandKind(null);
        setPendingActions([]);
        return;
      }

      setSelectedSquare(null);
      setPendingActions([]);
      return;
    }

    if (isOwnTop) {
      setSelectedSquare(coord);
      setSelectedHandKind(null);
      setPendingActions([]);
    }
  };

  const handleHandClick = (kind: PieceKind) => {
    const hasMove = legalMoves.some(
      (move) =>
        (move.type === 'drop' || move.type === 'deploy') &&
        move.player === HUMAN_PLAYER &&
        move.pieceKind === kind,
    );

    if (
      autoMatch ||
      game.turn !== HUMAN_PLAYER ||
      game.winner ||
      thinking ||
      game.hands.south[kind] <= 0 ||
      !hasMove
    ) {
      return;
    }

    setSelectedSquare(null);
    setPendingActions([]);
    setSelectedHandKind((current) => (current === kind ? null : kind));
  };

  const startNewMatch = (mode: MatchMode) => {
    setDialogState(null);
    startTransition(() => {
      setMatchMode(mode);
      setGame(createInitialGame(pendingRulesetId));
    });
    setAutoMatchPaused(false);
    setCpuThoughts([]);
    setCpuThoughtPlayer(null);
    setCpuThoughtStartedAt(null);
    setCpuThoughtElapsedMs(0);
    clearSelectionState();
    setErrorMessage(null);
  };

  const startNewGame = () => {
    startNewMatch('human-vs-cpu');
  };

  const startAutoMatch = () => {
    startNewMatch('cpu-vs-cpu');
  };

  const removeSavedGame = () => {
    clearSavedGame();
    setErrorMessage('保存データをブラウザから削除しました。');
  };

  const toggleAutoMatchPaused = () => {
    if (!autoMatch || game.winner) {
      return;
    }

    const recordedAt = new Date().toISOString();
    setAutoMatchPaused((current) => !current);
    setGame((current) => (autoMatchPaused ? resumeGameClock(current, recordedAt) : pauseGameClock(current, recordedAt)));
  };

  const openRuleGuide = () => {
    setActiveRuleGuideId(getDefaultRuleGuideId(game.rulesetId));
    setDialogState({ type: 'rules' });
  };

  const closeDialog = () => {
    setDialogState(null);
  };

  const openConfirmDialog = (action: ConfirmActionId) => {
    setDialogState({ type: 'confirm', action });
  };

  const handleConfirmAction = (action: ConfirmActionId) => {
    setDialogState(null);

    if (action === 'new-game') {
      startNewGame();
      return;
    }

    if (action === 'auto-match') {
      startAutoMatch();
      return;
    }

    if (action === 'clear-save') {
      removeSavedGame();
      return;
    }

    if (action === 'ready') {
      executeMove(createReadyMove(HUMAN_PLAYER));
      return;
    }

    executeMove(createResignMove(HUMAN_PLAYER));
  };

  const confirmDialogProps =
    dialogState?.type === 'confirm'
      ? {
          'new-game': {
            title: '新しい対局を開始しますか？',
            message: '現在の盤面は破棄されます。保存データは削除するまで保持されます。',
            confirmLabel: '新しい対局を開始',
            tone: 'danger' as const,
          },
          'auto-match': {
            title: '自動対局を開始しますか？',
            message: '選択中のルールと CPU 難易度で、新しい自動対局を開始します。',
            confirmLabel: '自動対局を開始',
            tone: 'danger' as const,
          },
          'clear-save': {
            title: '保存データを削除しますか？',
            message: 'ブラウザに保存されている対局データを削除します。',
            confirmLabel: '保存データを削除',
            tone: 'danger' as const,
          },
          ready: {
            title: '配置を完了しますか？',
            message: '確定すると、あなた側の配置フェーズが終了します。',
            confirmLabel: '配置完了',
            tone: 'default' as const,
          },
          resign: {
            title: '投了しますか？',
            message: '相手の勝利として即座に対局が終了します。',
            confirmLabel: '投了する',
            tone: 'danger' as const,
          },
        }[dialogState.action]
      : null;

  const northTrayItems: TrayItemState[] = visibleHandKinds.map((kind) => ({
    kind,
    count: game.hands.north[kind],
    label: getPieceDefinition(kind).label,
    selected: false,
    disabled: game.hands.north[kind] <= 0,
    readOnly: true,
  }));

  const southTrayItems: TrayItemState[] = visibleHandKinds.map((kind) => {
    const count = game.hands.south[kind];
    const enabled = legalMoves.some(
      (move) =>
        (move.type === 'drop' || move.type === 'deploy') &&
        move.player === HUMAN_PLAYER &&
        move.pieceKind === kind,
    );

    return {
      kind,
      count,
      label: getPieceDefinition(kind).label,
      selected: selectedHandKind === kind,
      disabled: count <= 0 || autoMatch || game.turn !== HUMAN_PLAYER || !!game.winner || thinking || !enabled,
      readOnly: autoMatch,
      onClick: () => handleHandClick(kind),
    };
  });

  return (
    <>
      <div className="app-shell">
        <aside className="panel info-panel">
          <div className="panel-header">
            <p className="eyebrow">ブラウザゲーム</p>
            <h1>軍儀</h1>
          </div>

          <section className="card">
            <h2>対局情報</h2>
            <dl className="stats-grid">
              <div>
                <dt>ルール</dt>
                <dd>{ruleset.name}</dd>
              </div>
              <div>
                <dt>フェーズ</dt>
                <dd>{game.phase === 'setup' ? '配置中' : '対局中'}</dd>
              </div>
              <div>
                <dt>対戦モード</dt>
                <dd>{autoMatch ? 'CPU対CPU' : 'あなた対CPU'}</dd>
              </div>
              <div>
                <dt>最大スタック</dt>
                <dd>{ruleset.maxStackHeight}</dd>
              </div>
              <div>
                <dt>CPU 難易度</dt>
                <dd className={autoMatch ? 'stats-grid-multiline' : undefined}>{cpuSettingSummary}</dd>
              </div>
              <div>
                <dt>思考バックエンド</dt>
                <dd>{cpuBackendLabel}</dd>
              </div>
            </dl>
            <p className="muted">{ruleset.description}</p>
            <p className="muted">{ruleset.setup.description}</p>
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>対局状況</h2>
              <div className="section-actions">
                <button type="button" className="rule-button" onClick={openRuleGuide}>
                  ルール
                </button>
                <button type="button" className="rule-button" onClick={() => setDialogState({ type: 'log' })}>
                  ログ
                </button>
              </div>
            </div>

            <div className={`status-banner ${statusBanner.tone}`}>
              <strong>{statusBanner.title}</strong>
              <span>{statusBanner.detail}</span>
            </div>

            <div className="status-meta-grid">
              <div className="status-meta-card">
                <span>手数</span>
                <strong>{game.history.length}</strong>
              </div>
              <div className="status-meta-card">
                <span>対局時間</span>
                <strong>{matchElapsedLabel}</strong>
              </div>
            </div>

            <div className="threat-grid">
              <div className={southThreatened ? 'threat danger' : 'threat'}>
                <span>{southLabel}</span>
                <strong>
                  {getMarshalStatus(!!southMarshal, southThreatened, game.phase === 'setup', game.setupReady.south)}
                </strong>
              </div>
              <div className={northThreatened ? 'threat danger' : 'threat'}>
                <span>{northLabel}</span>
                <strong>
                  {getMarshalStatus(!!northMarshal, northThreatened, game.phase === 'setup', game.setupReady.north)}
                </strong>
              </div>
            </div>

            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </section>
        </aside>

        <main className="board-panel">
          <section className="board-frame board-frame-plain">
            <Suspense fallback={<div className="board-loading">3D盤面を読み込み中...</div>}>
              <BoardScene
                state={game}
                selectedSquare={selectedSquare}
                highlightedMoves={selectedMoves}
                onSquareClick={handleSquareClick}
              />
            </Suspense>

            {autoMatch && (cpuThoughts.length > 0 || autoMatchPaused) ? (
              <div className="board-overlay">
                <div className="board-overlay-header">
                  <p className="board-overlay-kicker">{cpuThoughtTitle}</p>
                  <p className="board-overlay-meta">{cpuThoughtElapsedLabel}</p>
                </div>
                {autoMatchPaused ? <p className="board-overlay-state">一時停止中</p> : null}
                <div className="board-overlay-log">
                  {cpuThoughts.map((entry, index) => (
                    <div key={`${entry.thought.stage}-${index}`} className="board-overlay-entry">
                      <div className="board-overlay-entry-header">
                        <strong>{entry.thought.message}</strong>
                        <span className="board-overlay-entry-meta">{formatThoughtDuration(entry.elapsedMs)}</span>
                      </div>
                      {entry.thought.detail ? <span>{entry.thought.detail}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className="card settings-panel">
              <div className="section-heading">
              <h2>設定</h2>
            </div>

            <div className="settings-toolbar">
              <div className="settings-cluster settings-cluster-primary">
                <label className="control-group settings-field">
                  <span>新規対局のルール</span>
                  <select
                    value={pendingRulesetId}
                    onChange={(event) => setPendingRulesetId(event.target.value as RulesetId)}
                  >
                    <option value="beginner">初級編</option>
                    <option value="advanced">上級編</option>
                  </select>
                </label>

                <label className="control-group settings-field">
                  <span>対人戦の CPU 難易度</span>
                  <select value={cpuLevel} onChange={(event) => setCpuLevel(event.target.value as CpuLevel)}>
                    <option value="easy">初級</option>
                    <option value="normal">標準</option>
                    <option value="hard">上級</option>
                  </select>
                </label>

                <label className="control-group settings-field">
                  <span>自動対局 先手CPU</span>
                  <select
                    value={autoMatchCpuLevels.south}
                    onChange={(event) =>
                      setAutoMatchCpuLevels((current) => ({
                        ...current,
                        south: event.target.value as CpuLevel,
                      }))
                    }
                  >
                    <option value="easy">初級</option>
                    <option value="normal">標準</option>
                    <option value="hard">上級</option>
                  </select>
                </label>

                <label className="control-group settings-field">
                  <span>自動対局 後手CPU</span>
                  <select
                    value={autoMatchCpuLevels.north}
                    onChange={(event) =>
                      setAutoMatchCpuLevels((current) => ({
                        ...current,
                        north: event.target.value as CpuLevel,
                      }))
                    }
                  >
                    <option value="easy">初級</option>
                    <option value="normal">標準</option>
                    <option value="hard">上級</option>
                  </select>
                </label>

                <button type="button" className="settings-button" onClick={() => openConfirmDialog('auto-match')}>
                  自動対局
                </button>
                <button
                  type="button"
                  className="settings-button pause-button"
                  disabled={!autoMatch || !!game.winner}
                  onClick={toggleAutoMatchPaused}
                >
                  {autoMatchPaused ? '再開' : '一時停止'}
                </button>
                {game.phase === 'setup' ? (
                  <button
                    type="button"
                    className="settings-button commit-button"
                    disabled={!canReady || autoMatch || game.turn !== HUMAN_PLAYER || !!game.winner || thinking}
                    onClick={() => openConfirmDialog('ready')}
                  >
                    配置完了
                  </button>
                ) : null}
              </div>

              <div className="settings-cluster settings-cluster-danger">
                <button type="button" className="settings-button" onClick={() => openConfirmDialog('new-game')}>
                  新しい対局
                </button>
                <button
                  type="button"
                  className="settings-button secondary"
                  onClick={() => openConfirmDialog('clear-save')}
                >
                  保存削除
                </button>
                {game.phase === 'battle' ? (
                  <button
                    type="button"
                    className="settings-button danger-button"
                    disabled={autoMatch || game.turn !== HUMAN_PLAYER || !!game.winner}
                    onClick={() => openConfirmDialog('resign')}
                  >
                    投了
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        </main>

        <aside className="panel side-panel">
          <HandTray owner="north" title={`${northLabel}の持ち駒`} items={northTrayItems} />

          <section className="card action-card">
            <h2>選択可能な行動</h2>
            {pendingActions.length === 0 ? (
              <p className="muted">
                {game.phase === 'setup'
                  ? '持ち駒を選んで配置マスをクリックしてください。'
                  : '盤上の駒か持ち駒を選ぶと、ここに実行可能な行動が表示されます。'}
              </p>
            ) : (
              <div className="action-list">
                {pendingActions.map((move, index) => (
                  <button type="button" key={`action-${index}`} onClick={() => executeMove(move)}>
                    {getMoveButtonLabel(move)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <HandTray
            owner="south"
            title={game.phase === 'setup' ? `${southLabel}の配置用持ち駒` : `${southLabel}の持ち駒`}
            items={southTrayItems}
          />
        </aside>
      </div>

      {dialogState?.type === 'rules' ? (
        <RuleGuideDialog
          activeTab={activeRuleGuideId}
          onSelectTab={setActiveRuleGuideId}
          onClose={closeDialog}
        />
      ) : null}

      {dialogState?.type === 'log' ? <MatchLogDialog records={latestMoves} onClose={closeDialog} /> : null}

      {dialogState?.type === 'confirm' && confirmDialogProps ? (
        <ConfirmDialog
          title={confirmDialogProps.title}
          message={confirmDialogProps.message}
          confirmLabel={confirmDialogProps.confirmLabel}
          tone={confirmDialogProps.tone}
          onConfirm={() => handleConfirmAction(dialogState.action)}
          onClose={closeDialog}
        />
      ) : null}

      {dialogState?.type === 'result' ? (
        <GameResultDialog
          winner={dialogState.winner}
          winnerLabel={getParticipantLabel(dialogState.winner, matchMode)}
          reason={dialogState.reason}
          elapsedLabel={matchElapsedLabel}
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}

export default App;
