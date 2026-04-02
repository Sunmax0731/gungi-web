import { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  HAND_KIND_ORDER,
  boardSelectionText,
  getDefaultRuleGuideId,
  handSelectionText,
  moveActionLabel,
  playerLabel,
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
import { type Coord, type CpuLevel, type GameMove, type GamePhase, type PieceKind, type Player, type RulesetId, type VictoryReason } from './game/types';

const HUMAN_PLAYER: Player = 'south';
const CPU_PLAYER: Player = 'north';

const BoardScene = lazy(() =>
  import('./components/BoardScene').then((module) => ({ default: module.BoardScene })),
);

type ConfirmActionId = 'new-game' | 'clear-save' | 'ready' | 'resign';

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
) {
  if (phase === 'setup') {
    if (ready) {
      return '上がり';
    }
    return marshalExists ? '帥配置済み' : '帥未配置';
  }

  if (!marshalExists) {
    return '帥喪失';
  }

  return threatened ? '王手' : '安全';
}

function App() {
  const initialGame = useMemo(() => loadSavedGame() ?? createInitialGame('beginner'), []);
  const [game, setGame] = useState(initialGame);
  const [pendingRulesetId, setPendingRulesetId] = useState<RulesetId>(initialGame.rulesetId);
  const [cpuLevel, setCpuLevel] = useState<CpuLevel>('normal');
  const [selectedSquare, setSelectedSquare] = useState<Coord | null>(null);
  const [selectedHandKind, setSelectedHandKind] = useState<PieceKind | null>(null);
  const [pendingActions, setPendingActions] = useState<GameMove[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [activeRuleGuideId, setActiveRuleGuideId] = useState<RuleGuideId>(() =>
    getDefaultRuleGuideId(initialGame.rulesetId),
  );
  const resultDialogKeyRef = useRef<string | null>(null);
  const cpuService = useMemo(() => createCpuService(), []);

  const thinking = game.turn === CPU_PLAYER && !game.winner;
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
      return '帥を含めて 3 段以内に配置してください。上がりは確認ダイアログ付きです。';
    }

    return '盤上の自駒か手駒を選ぶと、指せるマスや候補アクションを表示します。';
  }, [game.board, game.phase, selectedHandKind, selectedSquare]);

  const statusBanner = useMemo(() => {
    if (game.winner) {
      return {
        tone: 'victory',
        title: `${playerLabel(game.winner)} の勝ち`,
        detail: `決着理由: ${victoryReasonText(game.victoryReason)}`,
      };
    }

    if (thinking) {
      return {
        tone: 'thinking',
        title: 'CPU 思考中',
        detail: '合法手を探索しています。',
      };
    }

    if (game.phase === 'setup') {
      return {
        tone: 'setup',
        title: game.turn === HUMAN_PLAYER ? '配置フェーズ' : 'CPU が配置中',
        detail: selectionSummary,
      };
    }

    return {
      tone: 'active',
      title: game.turn === HUMAN_PLAYER ? 'あなたの手番' : 'CPU の手番',
      detail: selectionSummary,
    };
  }, [game.phase, game.turn, game.victoryReason, game.winner, selectionSummary, thinking]);

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
      void cpuService
        .computeMove(game, cpuLevel)
        .then((move) => {
          if (cancelled) {
            return;
          }

          startTransition(() => {
            setGame((current) => {
              if (current.updatedAt !== game.updatedAt) {
                return current;
              }

              return applyMove(current, move ?? createResignMove(CPU_PLAYER));
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

          setErrorMessage(error instanceof Error ? error.message : 'CPU の思考処理に失敗しました。');
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
      setErrorMessage(error instanceof Error ? error.message : '手の適用に失敗しました。');
    }
  };

  const handleSquareClick = (coord: Coord) => {
    if (game.turn !== HUMAN_PLAYER || game.winner || thinking) {
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

    if (game.turn !== HUMAN_PLAYER || game.winner || thinking || game.hands.south[kind] <= 0 || !hasMove) {
      return;
    }

    setSelectedSquare(null);
    setPendingActions([]);
    setSelectedHandKind((current) => (current === kind ? null : kind));
  };

  const startNewGame = () => {
    startTransition(() => {
      setGame(createInitialGame(pendingRulesetId));
    });
    clearSelectionState();
    setErrorMessage(null);
  };

  const removeSavedGame = () => {
    clearSavedGame();
    setErrorMessage('保存データを削除しました。');
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
            title: '新しい対局を開始しますか',
            message: '現在の盤面と自動保存内容を上書きします。進行中の対局には戻れません。',
            confirmLabel: '開始する',
            tone: 'danger' as const,
          },
          'clear-save': {
            title: '保存データを削除しますか',
            message: 'ローカルストレージ上の保存データを削除します。進行中の盤面はそのままですが、再読み込み後には復元できません。',
            confirmLabel: '削除する',
            tone: 'danger' as const,
          },
          ready: {
            title: '配置を確定しますか',
            message: '上がりを宣言すると、配置フェーズには戻れません。',
            confirmLabel: '確定する',
            tone: 'default' as const,
          },
          resign: {
            title: '投了しますか',
            message: '投了すると即座に対局が終了します。',
            confirmLabel: '投了する',
            tone: 'danger' as const,
          },
        }[dialogState.action]
      : null;

  const southHandTitle = game.phase === 'setup' ? 'あなたの配置駒' : 'あなたの手駒';

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
      disabled: count <= 0 || game.turn !== HUMAN_PLAYER || !!game.winner || thinking || !enabled,
      readOnly: false,
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
                <dt>スタック上限</dt>
                <dd>{ruleset.maxStackHeight}</dd>
              </div>
              <div>
                <dt>CPU</dt>
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
                <span>あなた</span>
                <strong>
                  {getMarshalStatus(!!southMarshal, southThreatened, game.phase, game.setupReady.south)}
                </strong>
              </div>
              <div className={northThreatened ? 'threat danger' : 'threat'}>
                <span>CPU</span>
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
            <Suspense fallback={<div className="board-loading">3D 盤面を読み込み中...</div>}>
              <BoardScene
                state={game}
                selectedSquare={selectedSquare}
                highlightedMoves={selectedMoves}
                onSquareClick={handleSquareClick}
              />
            </Suspense>
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
                {game.phase === 'setup' ? (
                  <button
                    type="button"
                    className="settings-button commit-button"
                    disabled={!canReady || game.turn !== HUMAN_PLAYER || !!game.winner || thinking}
                    onClick={() => openConfirmDialog('ready')}
                  >
                    配置を確定
                  </button>
                ) : null}
              </div>

              <div className="settings-cluster settings-cluster-danger">
                <button type="button" className="settings-button" onClick={() => openConfirmDialog('new-game')}>
                  新しい対局を開始
                </button>
                <button type="button" className="settings-button secondary" onClick={() => openConfirmDialog('clear-save')}>
                  保存を削除
                </button>
                {game.phase === 'battle' ? (
                  <button
                    type="button"
                    className="settings-button danger-button"
                    disabled={game.turn !== HUMAN_PLAYER || !!game.winner}
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
          <HandTray owner="north" title="CPU の手駒" items={northTrayItems} />

          <section className="card action-card">
            <h2>候補アクション</h2>
            {pendingActions.length === 0 ? (
              <p className="muted">
                {game.phase === 'setup'
                  ? '手駒を選んで配置先をクリックすると、ここに候補アクションが表示されます。'
                  : '移動先に「取る」「ツケ」「寝返り」が重なると、ここから選択します。'}
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
        <GameResultDialog winner={dialogState.winner} reason={dialogState.reason} onClose={closeDialog} />
      ) : null}
    </>
  );
}

export default App;
