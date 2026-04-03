import { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  HAND_KIND_ORDER,
  boardSelectionText,
  getDefaultRuleGuideId,
  handSelectionText,
  moveActionLabel,
  type RuleGuideId,
  victoryReasonText,
} from './app/gameUi';
import { HandTray, type TrayItemState } from './components/HandTray';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { GameResultDialog } from './components/dialogs/GameResultDialog';
import { MatchLogDialog } from './components/dialogs/MatchLogDialog';
import { RuleGuideDialog } from './components/dialogs/RuleGuideDialog';
import { compareCoords, getTopPiece } from './game/board';
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
  type GamePhase,
  type PieceKind,
  type Player,
  type RulesetId,
  type VictoryReason,
} from './game/types';

const HUMAN_PLAYER: Player = 'south';
const CPU_PLAYER: Player = 'north';

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

function isTargetMove(move: GameMove): move is Exclude<GameMove, { type: 'ready' } | { type: 'resign' }> {
  return 'to' in move;
}

function getMarshalStatus(
  marshalExists: boolean,
  threatened: boolean,
  phase: GamePhase,
  ready: boolean,
): string {
  if (phase === 'setup') {
    if (ready) {
      return '配置済み';
    }

    return marshalExists ? '帥を配置済み' : '帥を未配置';
  }

  if (!marshalExists) {
    return '帥を喪失';
  }

  return threatened ? '脅威あり' : '安定';
}

function getParticipantLabel(player: Player, mode: MatchMode): string {
  if (mode === 'cpu-vs-cpu') {
    return player === 'south' ? '先手CPU' : '後手CPU';
  }

  return player === HUMAN_PLAYER ? 'あなた' : 'CPU';
}

function appendCpuThought(thoughts: CpuThought[], thought: CpuThought): CpuThought[] {
  const nextThoughts = [...thoughts, thought];
  return nextThoughts.slice(-5);
}

function App() {
  const initialGame = useMemo(() => loadSavedGame() ?? createInitialGame('beginner'), []);
  const [game, setGame] = useState(initialGame);
  const [matchMode, setMatchMode] = useState<MatchMode>('human-vs-cpu');
  const [autoMatchPaused, setAutoMatchPaused] = useState(false);
  const [pendingRulesetId, setPendingRulesetId] = useState<RulesetId>(initialGame.rulesetId);
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('normal');
  const [selectedSquare, setSelectedSquare] = useState<Coord | null>(null);
  const [selectedHandKind, setSelectedHandKind] = useState<PieceKind | null>(null);
  const [pendingActions, setPendingActions] = useState<GameMove[]>([]);
  const [cpuThoughts, setCpuThoughts] = useState<CpuThought[]>([]);
  const [cpuThoughtPlayer, setCpuThoughtPlayer] = useState<Player | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [activeRuleGuideId, setActiveRuleGuideId] = useState<RuleGuideId>(() =>
    getDefaultRuleGuideId(initialGame.rulesetId),
  );
  const resultDialogKeyRef = useRef<string | null>(null);
  const cpuService = useMemo(() => createCpuService(), []);

  const autoMatch = matchMode === 'cpu-vs-cpu';
  const thinking = !game.winner && (autoMatch ? !autoMatchPaused : game.turn === CPU_PLAYER);
  const ruleset = getRuleset(game.rulesetId);
  const legalMoves = useMemo(() => generateLegalMoves(game), [game]);
  const latestMoves = useMemo(() => [...game.history].reverse(), [game.history]);
  const visibleHandKinds = useMemo(
    () => HAND_KIND_ORDER.filter((kind) => ruleset.inventory[kind] > 0),
    [ruleset],
  );
  const southMarshal = useMemo(() => findMarshalCoord(game, HUMAN_PLAYER), [game]);
  const northMarshal = useMemo(() => findMarshalCoord(game, CPU_PLAYER), [game]);
  const southThreatened = useMemo(
    () => (game.phase === 'battle' ? isMarshalThreatened(game, HUMAN_PLAYER) : false),
    [game],
  );
  const northThreatened = useMemo(
    () => (game.phase === 'battle' ? isMarshalThreatened(game, CPU_PLAYER) : false),
    [game],
  );
  const canReady = useMemo(
    () => legalMoves.some((move) => move.type === 'ready' && move.player === HUMAN_PLAYER),
    [legalMoves],
  );
  const southLabel = getParticipantLabel(HUMAN_PLAYER, matchMode);
  const northLabel = getParticipantLabel(CPU_PLAYER, matchMode);
  const cpuThoughtTitle = `${getParticipantLabel(cpuThoughtPlayer ?? game.turn, matchMode)}の思考ログ`;
  const pauseButtonLabel = autoMatchPaused ? '再開' : '一時停止';
  const pauseButtonDisabled = !autoMatch || !!game.winner;

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

  const selectionSummary = useMemo(() => {
    if (selectedHandKind) {
      return handSelectionText(selectedHandKind, game.phase === 'setup');
    }

    if (selectedSquare && game.phase === 'battle') {
      const piece = getTopPiece(game.board, selectedSquare);
      if (piece) {
        return boardSelectionText(piece.kind);
      }
    }

    if (game.phase === 'setup') {
      return '手駒を選んで帥を含む配置を進めてください。配置が整ったら「配置確定」で対局が始まります。';
    }

    return '盤上の駒か手駒を選ぶと、実行できる移動やアクションが候補アクションに表示されます。';
  }, [game.board, game.phase, selectedHandKind, selectedSquare]);

  const statusBanner = useMemo(() => {
    if (game.winner) {
      return {
        tone: 'victory',
        title: `${getParticipantLabel(game.winner, matchMode)}の勝ち`,
        detail: `勝因: ${victoryReasonText(game.victoryReason)}`,
      };
    }

    if (autoMatchPaused) {
      return {
        tone: 'paused',
        title: '自動対局を一時停止中',
        detail: `再開すると ${getParticipantLabel(game.turn, matchMode)} の思考を続行します。`,
      };
    }

    if (thinking) {
      return {
        tone: 'thinking',
        title: autoMatch ? '自動対局中' : 'CPU 思考中',
        detail: `${getParticipantLabel(game.turn, matchMode)} が次の一手を検討しています。`,
      };
    }

    if (game.phase === 'setup') {
      return {
        tone: 'setup',
        title:
          game.turn === HUMAN_PLAYER
            ? '配置フェーズ'
            : `${getParticipantLabel(game.turn, matchMode)} が配置中`,
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
    if (!thinking) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCpuThoughtPlayer(game.turn);
      setCpuThoughts([]);

      void cpuService
        .computeMove(game, cpuLevel, (thought) => {
          if (cancelled) {
            return;
          }

          setCpuThoughts((current) => appendCpuThought(current, thought));
        })
        .then((move) => {
          if (cancelled) {
            return;
          }

          startTransition(() => {
            setGame((current) => {
              if (current.updatedAt !== game.updatedAt) {
                return current;
              }

              return applyMove(current, move ?? createResignMove(game.turn));
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

          setErrorMessage(error instanceof Error ? error.message : 'CPU の思考処理でエラーが発生しました。');
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cpuLevel, cpuService, game, thinking]);

  const clearSelectionState = () => {
    setSelectedSquare(null);
    setSelectedHandKind(null);
    setPendingActions([]);
  };

  const executeMove = (move: GameMove) => {
    try {
      startTransition(() => {
        setGame((current) => applyMove(current, move));
      });
      clearSelectionState();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '手の適用中にエラーが発生しました。');
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
    setErrorMessage('ローカル保存データを削除しました。');
  };

  const toggleAutoMatchPaused = () => {
    if (!autoMatch || game.winner) {
      return;
    }

    setAutoMatchPaused((current) => !current);
  };

  const openRuleGuide = () => {
    setActiveRuleGuideId(getDefaultRuleGuideId(game.rulesetId));
    setDialogState({ type: 'rules' });
  };

  const openConfirmDialog = (action: ConfirmActionId) => {
    setDialogState({ type: 'confirm', action });
  };

  const closeDialog = () => {
    setDialogState(null);
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
            message: '現在の盤面と選択状態は失われます。途中の対局に戻るには保存データが必要です。',
            confirmLabel: '開始する',
            tone: 'danger' as const,
          },
          'auto-match': {
            title: '自動対局を開始しますか？',
            message: '選択中のルールと難度で、CPU 同士の新しい対局を開始します。',
            confirmLabel: '自動対局を開始',
            tone: 'danger' as const,
          },
          'clear-save': {
            title: '保存データを削除しますか？',
            message: 'ローカルストレージに保存された途中データを削除します。現在の盤面はそのままですが、次回復元はできなくなります。',
            confirmLabel: '削除する',
            tone: 'danger' as const,
          },
          ready: {
            title: '配置を確定しますか？',
            message: '配置完了を送ると、現在の配置から対局が始まります。',
            confirmLabel: '確定する',
            tone: 'default' as const,
          },
          resign: {
            title: '投了しますか？',
            message: '投了すると、即座に対局終了になります。',
            confirmLabel: '投了する',
            tone: 'danger' as const,
          },
        }[dialogState.action]
      : null;

  const southHandTitle = game.phase === 'setup' ? `${southLabel}の配置駒` : `${southLabel}の手駒`;

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
            <p className="eyebrow">Browser Gungi</p>
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
                <dt>対戦</dt>
                <dd>{autoMatch ? 'CPU vs CPU' : 'あなた vs CPU'}</dd>
              </div>
              <div>
                <dt>スタック上限</dt>
                <dd>{ruleset.maxStackHeight}</dd>
              </div>
              <div>
                <dt>CPU 難度</dt>
                <dd>{cpuLevel}</dd>
              </div>
              <div>
                <dt>手数</dt>
                <dd>{game.history.length}</dd>
              </div>
              <div>
                <dt>思考系</dt>
                <dd>{cpuService.mode}</dd>
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
            <div className="threat-grid">
              <div className={southThreatened ? 'threat danger' : 'threat'}>
                <span>{southLabel}</span>
                <strong>
                  {getMarshalStatus(!!southMarshal, southThreatened, game.phase, game.setupReady.south)}
                </strong>
              </div>
              <div className={northThreatened ? 'threat danger' : 'threat'}>
                <span>{northLabel}</span>
                <strong>
                  {getMarshalStatus(!!northMarshal, northThreatened, game.phase, game.setupReady.north)}
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
                <p className="board-overlay-kicker">{cpuThoughtTitle}</p>
                {autoMatchPaused ? <p className="board-overlay-state">一時停止中</p> : null}
                <div className="board-overlay-log">
                  {cpuThoughts.map((thought, index) => (
                    <div key={`${thought.stage}-${index}`} className="board-overlay-entry">
                      <strong>{thought.message}</strong>
                      {thought.detail ? <span>{thought.detail}</span> : null}
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
                  <span>新しい対局のルール</span>
                  <select
                    value={pendingRulesetId}
                    onChange={(event) => setPendingRulesetId(event.target.value as RulesetId)}
                  >
                    <option value="beginner">初級編</option>
                    <option value="advanced">上級編</option>
                  </select>
                </label>
                <label className="control-group settings-field">
                  <span>CPU 難度</span>
                  <select value={cpuLevel} onChange={(event) => setCpuLevel(event.target.value as CpuLevel)}>
                    <option value="easy">Easy</option>
                    <option value="normal">Normal</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <button type="button" className="settings-button" onClick={() => openConfirmDialog('auto-match')}>
                  自動対局
                </button>
                <button
                  type="button"
                  className="settings-button pause-button"
                  disabled={pauseButtonDisabled}
                  onClick={toggleAutoMatchPaused}
                >
                  {pauseButtonLabel}
                </button>
                {game.phase === 'setup' ? (
                  <button
                    type="button"
                    className="settings-button commit-button"
                    disabled={!canReady || autoMatch || game.turn !== HUMAN_PLAYER || !!game.winner || thinking}
                    onClick={() => openConfirmDialog('ready')}
                  >
                    配置確定
                  </button>
                ) : null}
              </div>

              <div className="settings-cluster settings-cluster-danger">
                <button type="button" className="settings-button" onClick={() => openConfirmDialog('new-game')}>
                  対局開始
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
          <HandTray owner="north" title={`${northLabel}の手駒`} items={northTrayItems} />

          <section className="card action-card">
            <h2>候補アクション</h2>
            {pendingActions.length === 0 ? (
              <p className="muted">
                {game.phase === 'setup'
                  ? '手駒を選ぶと、配置先や重ね置きの候補がここに表示されます。'
                  : '盤上の駒か手駒を選ぶと、実行できるアクションがここに表示されます。'}
              </p>
            ) : (
              <div className="action-list">
                {pendingActions.map((move, index) => (
                  <button type="button" key={`action-${index}`} onClick={() => executeMove(move)}>
                    {move.type === 'ready' || move.type === 'resign'
                      ? moveActionLabel(move)
                      : `${getPieceDefinition(move.pieceKind).label} ${moveActionLabel(move)}`}
                  </button>
                ))}
              </div>
            )}
          </section>

          <HandTray owner="south" title={southHandTitle} items={southTrayItems} />
        </aside>
      </div>

      {dialogState?.type === 'rules' ? (
        <RuleGuideDialog
          activeTab={activeRuleGuideId}
          onSelectTab={setActiveRuleGuideId}
          onClose={closeDialog}
        />
      ) : null}

      {dialogState?.type === 'log' ? (
        <MatchLogDialog records={latestMoves} onClose={closeDialog} />
      ) : null}

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
          onClose={closeDialog}
        />
      ) : null}
    </>
  );
}

export default App;
