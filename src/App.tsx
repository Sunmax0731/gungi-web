import { Suspense, lazy, useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
  cpuLevelText,
  formatClockDuration,
  getDefaultRuleGuideId,
  moveActionLabel,
  type RuleGuideId,
} from './app/gameUi';
import { coordLabel } from './game/board';
import { HandTray, type TrayItemState } from './components/HandTray';
import { PieceInsightCard } from './components/PieceInsightCard';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { GameResultDialog } from './components/dialogs/GameResultDialog';
import { MatchLogDialog } from './components/dialogs/MatchLogDialog';
import { RuleGuideDialog } from './components/dialogs/RuleGuideDialog';
import { createCpuService } from './game/cpu-service';
import { createReadyMove, createResignMove, findMarshalCoord, generateLegalMoves, isMarshalThreatened } from './game/engine';
import { getPieceDefinition } from './game/pieces';
import { getRuleset } from './game/rulesets';
import { createInitialGame } from './game/setup';
import { loadSavedGame } from './game/storage';
import { type GameMove, type Player } from './game/types';
import { useCpuTurn } from './hooks/useCpuTurn';
import { type ConfirmActionId, useDialogState } from './hooks/useDialogState';
import { useFirstPlayGuide } from './hooks/useFirstPlayGuide';
import { useMatchSession } from './hooks/useMatchSession';
import { usePlayerHint } from './hooks/usePlayerHint';
import { useReplayState } from './hooks/useReplayState';
import { useSelectionState } from './hooks/useSelectionState';
import { SaveManagerDialog } from './components/dialogs/SaveManagerDialog';

const HUMAN_PLAYER: Player = 'south';
type BoardCameraMode = 'free' | 'fixed';
type BoardRenderQuality = 'quality' | 'lite';
const BoardScene = lazy(() =>
  import('./components/BoardScene').then((module) => ({ default: module.BoardScene })),
);

function formatThoughtDuration(elapsedMs: number): string {
  if (elapsedMs < 1_000) {
    return `${Math.round(elapsedMs)}ミリ秒`;
  }

  if (elapsedMs < 10_000) {
    return `${(elapsedMs / 1_000).toFixed(1)}秒`;
  }

  return `${Math.round(elapsedMs / 1_000)}秒`;
}

function getParticipantLabel(player: Player, matchMode: 'human-vs-cpu' | 'cpu-vs-cpu'): string {
  if (matchMode === 'cpu-vs-cpu') {
    return player === 'south' ? '先手CPU' : '後手CPU';
  }

  return player === HUMAN_PLAYER ? 'あなた' : 'CPU';
}

function getVictoryReasonLabel(reason: 'capture' | 'checkmate' | 'resign' | null): string {
  if (reason === 'capture') {
    return '帥の捕獲';
  }
  if (reason === 'checkmate') {
    return '詰み';
  }
  if (reason === 'resign') {
    return '投了';
  }
  return '対局終了';
}

function getMoveButtonLabel(move: GameMove): string {
  if (move.type === 'ready' || move.type === 'resign') {
    return moveActionLabel(move);
  }

  return `${getPieceDefinition(move.pieceKind).label} ${moveActionLabel(move)}`;
}

function getHintMoveLabel(move: GameMove | null): string {
  if (!move) {
    return '合法手がありません。';
  }

  if (move.type === 'ready' || move.type === 'resign') {
    return moveActionLabel(move);
  }

  const pieceLabel = getPieceDefinition(move.pieceKind).label;
  const to = coordLabel(move.to);

  if (move.type === 'drop' || move.type === 'deploy') {
    return `${pieceLabel} ${moveActionLabel(move)} ${to}`;
  }

  return `${pieceLabel} ${coordLabel(move.from)}→${to} ${moveActionLabel(move)}`;
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

function buildFirstPlaySteps(isAdvancedPending: boolean): string[] {
  const steps = [
    'まず「ルール」で駒の動きを確認します。',
    '盤上の自駒か持ち駒を選ぶと、光ったマスへ移動や配置ができます。',
    '操作に迷ったら「今できること」の案内を見ながら進めます。',
  ];

  if (isAdvancedPending) {
    steps.push('上級編は「開始時の配置補助」や「おすすめ配置を反映」を使うと始めやすくなります。');
  }

  return steps;
}

function buildActionHints(args: {
  canApplyRecommendedSetup: boolean;
  canReady: boolean;
  gamePhase: 'setup' | 'battle';
  gameWinner: Player | null;
  isReplaying: boolean;
  selectedPieceKind: string | null;
  thinking: boolean;
}) {
  const { canApplyRecommendedSetup, canReady, gamePhase, gameWinner, isReplaying, selectedPieceKind, thinking } = args;

  if (isReplaying) {
    return [
      'ログ内の手を選ぶと、その局面へ盤面が切り替わります。',
      '「最新」を押すと現在進行中の対局表示へ戻れます。',
    ];
  }

  if (gameWinner) {
    return [
      'ログから好きな手数を選び、終局図まで巻き戻して確認できます。',
      '新しい対局を始める前に、解析表示で気になる局面を確認してください。',
    ];
  }

  if (thinking) {
    return [
      'CPU 思考中は操作がロックされます。',
      '自動対局では盤面左上の思考ログから検討過程を確認できます。',
    ];
  }

  if (gamePhase === 'setup') {
    const hints = [
      selectedPieceKind
        ? '選択した駒を置きたいマスをクリックすると配置候補を確かめられます。'
        : '持ち駒を選ぶと、配置できるマスが盤上に表示されます。',
    ];

    if (canApplyRecommendedSetup) {
      hints.push('上級編の開始直後なら「おすすめ配置を反映」で南側の基本配置を用意できます。');
    }

    if (canReady) {
      hints.push('配置がまとまったら「配置完了」で戦闘フェーズへ進めます。');
    }

    return hints;
  }

  return [
    selectedPieceKind
      ? '選択した駒の移動先が光っています。候補先をクリックすると指せます。'
      : '盤上の自駒または持ち駒を選び、次の一手を確認してください。',
    'ログを開くと、各手の所要時間を見ながら局面を巻き戻せます。',
  ];
}

function App() {
  const initialGame = useMemo(() => loadSavedGame() ?? createInitialGame('beginner'), []);
  const [activeRuleGuideId, setActiveRuleGuideId] = useState<RuleGuideId>(() =>
    getDefaultRuleGuideId(initialGame.rulesetId),
  );
  const [boardCameraMode, setBoardCameraMode] = useState<BoardCameraMode>('free');
  const [boardRenderQuality, setBoardRenderQuality] = useState<BoardRenderQuality>('quality');
  const [hintEnabled, setHintEnabled] = useState(false);
  const [saveExportText, setSaveExportText] = useState('');
  const [saveImportText, setSaveImportText] = useState('');
  const [saveImportError, setSaveImportError] = useState<string | null>(null);
  const cpuService = useMemo(() => createCpuService(), []);

  const session = useMatchSession({ initialGame });
  const dialog = useDialogState({
    updatedAt: session.game.updatedAt,
    winner: session.game.winner,
    victoryReason: session.game.victoryReason,
  });

  const replay = useReplayState(session.game);
  const legalMoves = useMemo(() => generateLegalMoves(session.game), [session.game]);
  const canReady = useMemo(
    () => legalMoves.some((move) => move.type === 'ready' && move.player === HUMAN_PLAYER),
    [legalMoves],
  );
  const activeCpuLevel = session.autoMatch ? session.autoMatchCpuLevels[session.game.turn] : session.cpuLevel;

  const selection = useSelectionState({
    game: session.game,
    legalMoves,
    humanPlayer: HUMAN_PLAYER,
    interactionsLocked:
      replay.isReplaying ||
      session.autoMatch ||
      session.game.turn !== HUMAN_PLAYER ||
      !!session.game.winner,
    onExecuteMove: session.executeMove,
  });

  const cpu = useCpuTurn({
    activeCpuLevel,
    autoMatch: session.autoMatch,
    autoMatchPaused: session.autoMatchPaused,
    clearSelectionState: selection.clearSelectionState,
    cpuService,
    game: session.game,
    humanPlayer: HUMAN_PLAYER,
    onError: session.setErrorMessage,
    setGame: session.setGame,
  });
  const hintBlockedReason =
    replay.isReplaying
      ? 'リプレイ表示中はヒントを停止します。'
      : session.autoMatch
        ? '自動対局ではヒントを使用しません。'
        : session.game.winner
          ? '終局後はヒントを停止します。'
          : session.game.turn !== HUMAN_PLAYER
            ? 'CPU の手番ではヒントを表示しません。'
            : null;
  const hint = usePlayerHint({
    enabled: hintEnabled && !hintBlockedReason,
    game: session.game,
    level: session.cpuLevel,
  });
  const clearSelectionForReplay = useEffectEvent(() => {
    selection.clearSelectionState();
  });

  useEffect(() => {
    if (replay.isReplaying) {
      clearSelectionForReplay();
    }
  }, [replay.isReplaying]);

  const showFirstPlayGuide = useFirstPlayGuide(session.game.history.length > 0);
  const displayState = replay.activeSnapshot.state;
  const displayRuleset = getRuleset(displayState.rulesetId);
  const displayMoveCount = replay.isReplaying ? replay.selectedPly : session.game.history.length;
  const displayMatchElapsedLabel = formatClockDuration(
    replay.isReplaying ? replay.activeSnapshot.matchElapsedMs : session.matchElapsedMs,
  );
  const southLabel = getParticipantLabel('south', session.matchMode);
  const northLabel = getParticipantLabel('north', session.matchMode);
  const cpuThoughtTitle = `${getParticipantLabel(cpu.cpuThoughtPlayer ?? session.game.turn, session.matchMode)}の思考ログ`;
  const cpuSettingSummary = session.autoMatch
    ? `先手CPU: ${cpuLevelText(session.autoMatchCpuLevels.south)}\n後手CPU: ${cpuLevelText(
        session.autoMatchCpuLevels.north,
      )}`
    : cpuLevelText(session.cpuLevel);
  const cpuBackendLabel = cpuService.mode === 'worker' ? 'ワーカー' : 'メインスレッド';
  const southMarshal = useMemo(() => findMarshalCoord(displayState, 'south'), [displayState]);
  const northMarshal = useMemo(() => findMarshalCoord(displayState, 'north'), [displayState]);
  const southThreatened = useMemo(
    () => (displayState.phase === 'battle' ? isMarshalThreatened(displayState, 'south') : false),
    [displayState],
  );
  const northThreatened = useMemo(
    () => (displayState.phase === 'battle' ? isMarshalThreatened(displayState, 'north') : false),
    [displayState],
  );
  const canApplyRecommendedSetup =
    session.game.rulesetId === 'advanced' &&
    session.game.phase === 'setup' &&
    session.game.history.length === 0 &&
    session.game.turn === HUMAN_PLAYER &&
    !session.autoMatch;

  const statusBanner = useMemo(() => {
    if (replay.isReplaying) {
      return {
        tone: 'paused',
        title: 'リプレイ表示中',
        detail: `${replay.selectedPly} 手目を表示しています。最新に戻ると対局表示へ復帰します。`,
      };
    }

    if (displayState.winner) {
      return {
        tone: 'victory',
        title: `${getParticipantLabel(displayState.winner, session.matchMode)}の勝利`,
        detail: `勝因: ${getVictoryReasonLabel(displayState.victoryReason)}`,
      };
    }

    if (session.autoMatchPaused) {
      return {
        tone: 'paused',
        title: '自動対局を一時停止中',
        detail: `再開すると ${getParticipantLabel(session.game.turn, session.matchMode)} の思考から続行します。`,
      };
    }

    if (cpu.thinking) {
      return {
        tone: 'thinking',
        title: session.autoMatch ? '自動対局中' : 'CPU 思考中',
        detail: `${getParticipantLabel(session.game.turn, session.matchMode)} が次の手を検討しています。`,
      };
    }

    if (displayState.phase === 'setup') {
      return {
        tone: 'setup',
        title: displayState.turn === HUMAN_PLAYER ? '配置フェーズ' : `${getParticipantLabel(displayState.turn, session.matchMode)} が配置中`,
        detail: selection.selectionSummary,
      };
    }

    return {
      tone: 'active',
      title: `${getParticipantLabel(displayState.turn, session.matchMode)}の手番`,
      detail: selection.selectionSummary,
    };
  }, [
    cpu.thinking,
    displayState.phase,
    displayState.turn,
    displayState.victoryReason,
    displayState.winner,
    replay.isReplaying,
    replay.selectedPly,
    selection.selectionSummary,
    session.autoMatch,
    session.autoMatchPaused,
    session.game.turn,
    session.matchMode,
  ]);

  const actionHints = useMemo(
    () =>
      buildActionHints({
        canApplyRecommendedSetup,
        canReady,
        gamePhase: session.game.phase,
        gameWinner: session.game.winner,
        isReplaying: replay.isReplaying,
        selectedPieceKind: selection.selectedPieceKind,
        thinking: cpu.thinking,
      }),
    [canApplyRecommendedSetup, canReady, cpu.thinking, replay.isReplaying, selection.selectedPieceKind, session.game.phase, session.game.winner],
  );

  const firstPlaySteps = useMemo(
    () => buildFirstPlaySteps(session.pendingRulesetId === 'advanced'),
    [session.pendingRulesetId],
  );

  const trayState = replay.isReplaying ? displayState : session.game;

  const northTrayItems: TrayItemState[] = displayRuleset.availableKinds.map((kind) => ({
    kind,
    count: trayState.hands.north[kind],
    label: getPieceDefinition(kind).label,
    selected: false,
    disabled: trayState.hands.north[kind] <= 0,
    readOnly: true,
  }));

  const southTrayItems: TrayItemState[] = displayRuleset.availableKinds.map((kind) => {
    const count = trayState.hands.south[kind];
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
      selected: !replay.isReplaying && selection.selectedHandKind === kind,
      disabled:
        replay.isReplaying ||
        count <= 0 ||
        session.autoMatch ||
        session.game.turn !== HUMAN_PLAYER ||
        !!session.game.winner ||
        cpu.thinking ||
        !enabled,
      readOnly: replay.isReplaying || session.autoMatch,
      onClick: replay.isReplaying ? undefined : () => selection.handleHandClick(kind),
    };
  });

  const confirmDialogProps =
    dialog.dialogState?.type === 'confirm'
      ? {
          'new-game': {
            title: '新しい対局を開始しますか？',
            message: '現在の進行状況は保存されていますが、盤面は新しい対局へ切り替わります。',
            confirmLabel: '新しい対局を開始',
            tone: 'danger' as const,
          },
          'auto-match': {
            title: '自動対局を開始しますか？',
            message: '観戦モードに切り替えて、CPU 同士の対局を始めます。',
            confirmLabel: '自動対局を開始',
            tone: 'danger' as const,
          },
          'clear-save': {
            title: '保存データをすべて削除しますか？',
            message: '自動保存と保存スロットのデータをまとめて削除します。',
            confirmLabel: '保存データをすべて削除',
            tone: 'danger' as const,
          },
          ready: {
            title: '配置を完了しますか？',
            message: '配置完了後は戦闘フェーズに進みます。',
            confirmLabel: '配置完了',
            tone: 'default' as const,
          },
          resign: {
            title: '投了しますか？',
            message: '投了すると対局は終了します。',
            confirmLabel: '投了する',
            tone: 'danger' as const,
          },
        }[dialog.dialogState.action]
      : null;
  const confirmAction = dialog.dialogState?.type === 'confirm' ? dialog.dialogState.action : null;

  const openRuleGuide = () => {
    setActiveRuleGuideId(getDefaultRuleGuideId(session.game.rulesetId));
    dialog.openRuleDialog();
  };

  const openSaveManager = () => {
    setSaveImportError(null);
    setSaveImportText('');
    setSaveExportText(session.exportCurrentGameState());
    dialog.openSaveManagerDialog();
  };

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(saveExportText);
      session.setErrorMessage('エクスポート文字列をコピーしました。');
    } catch {
      session.setErrorMessage('エクスポート文字列をコピーできませんでした。');
    }
  };

  const handleLoadFromSlot = (slotId: string) => {
    replay.jumpToLatest();
    selection.clearSelectionState();
    cpu.resetThoughts();
    session.loadSelectedGame(slotId);
    dialog.closeDialog();
  };

  const handleImportSavedGame = () => {
    try {
      replay.jumpToLatest();
      selection.clearSelectionState();
      cpu.resetThoughts();
      session.importSavedGame(saveImportText);
      setSaveImportError(null);
      dialog.closeDialog();
    } catch (error) {
      setSaveImportError(error instanceof Error ? error.message : 'インポートに失敗しました。');
    }
  };

  const handleConfirmAction = (action: ConfirmActionId) => {
    dialog.closeDialog();
    replay.jumpToLatest();
    selection.clearSelectionState();

    if (action === 'new-game') {
      cpu.resetThoughts();
      session.startNewGame();
      return;
    }

    if (action === 'auto-match') {
      cpu.resetThoughts();
      session.startAutoMatch();
      return;
    }

    if (action === 'clear-save') {
      session.removeSavedGame();
      return;
    }

    if (action === 'ready') {
      session.executeMove(createReadyMove(HUMAN_PLAYER));
      return;
    }

    session.executeMove(createResignMove(HUMAN_PLAYER));
  };

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
                <dd>{displayRuleset.name}</dd>
              </div>
              <div>
                <dt>フェーズ</dt>
                <dd data-testid="match-phase">{displayState.phase === 'setup' ? '配置中' : '対局中'}</dd>
              </div>
              <div>
                <dt>対戦モード</dt>
                <dd>{session.autoMatch ? 'CPU対CPU' : 'あなた対CPU'}</dd>
              </div>
              <div>
                <dt>最大スタック</dt>
                <dd>{displayRuleset.maxStackHeight}</dd>
              </div>
              <div>
                <dt>CPU 難易度</dt>
                <dd className={session.autoMatch ? 'stats-grid-multiline' : undefined}>{cpuSettingSummary}</dd>
              </div>
              <div>
                <dt>思考バックエンド</dt>
                <dd>{cpuBackendLabel}</dd>
              </div>
            </dl>
            <p className="muted">{displayRuleset.description}</p>
            <p className="muted">{displayRuleset.setup.description}</p>
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>対局状況</h2>
              <div className="section-actions">
                <button type="button" className="rule-button" data-testid="open-rule-guide" onClick={openRuleGuide}>
                  ルール
                </button>
                <button
                  type="button"
                  className="rule-button"
                  data-testid="open-match-log"
                  onClick={dialog.openLogDialog}
                >
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
                <strong data-testid="move-count">{displayMoveCount}</strong>
              </div>
              <div className="status-meta-card">
                <span>対局時間</span>
                <strong data-testid="match-elapsed">{displayMatchElapsedLabel}</strong>
              </div>
            </div>

            <div className="threat-grid">
              <div className={southThreatened ? 'threat danger' : 'threat'}>
                <span>{southLabel}</span>
                <strong>{getMarshalStatus(!!southMarshal, southThreatened, displayState.phase === 'setup', displayState.setupReady.south)}</strong>
              </div>
              <div className={northThreatened ? 'threat danger' : 'threat'}>
                <span>{northLabel}</span>
                <strong>{getMarshalStatus(!!northMarshal, northThreatened, displayState.phase === 'setup', displayState.setupReady.north)}</strong>
              </div>
            </div>

            {session.errorMessage ? <p className="error-text">{session.errorMessage}</p> : null}
          </section>

          {showFirstPlayGuide.showGuide ? (
            <section className="card learning-card">
              <div className="section-heading">
                <h2>はじめかた</h2>
                <button type="button" className="rule-button" onClick={showFirstPlayGuide.dismissGuide}>
                  閉じる
                </button>
              </div>
              <ul className="modal-list compact-list">
                {firstPlaySteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card learning-card">
            <h2>今できること</h2>
            <ul className="modal-list compact-list">
              {actionHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </section>
        </aside>

        <main className="board-panel">
          <section className="board-frame board-frame-plain">
            <Suspense fallback={<div className="board-loading">3D盤面を読み込み中...</div>}>
              <BoardScene
                cameraMode={boardCameraMode}
                renderQuality={boardRenderQuality}
                state={displayState}
                selectedSquare={replay.isReplaying ? null : selection.selectedSquare}
                highlightedMoves={replay.isReplaying ? [] : selection.selectedMoves}
                onSquareClick={replay.isReplaying ? () => undefined : selection.handleSquareClick}
              />
            </Suspense>

            {selection.selectedPieceKind && !session.autoMatch ? (
              <div className="board-detail-overlay">
                <PieceInsightCard
                  emptyText="駒を選ぶと、ここに特徴と移動範囲が表示されます。"
                  kind={selection.selectedPieceKind}
                  rulesetId={session.game.rulesetId}
                  title="選択中の駒"
                />
              </div>
            ) : null}

            {session.autoMatch && !replay.isReplaying && (cpu.cpuThoughts.length > 0 || session.autoMatchPaused) ? (
              <div className="board-overlay">
                <div className="board-overlay-header">
                  <p className="board-overlay-kicker">{cpuThoughtTitle}</p>
                  <p className="board-overlay-meta">{formatThoughtDuration(cpu.cpuThoughtElapsedMs)}</p>
                </div>
                {session.autoMatchPaused ? <p className="board-overlay-state">一時停止中</p> : null}
                <div className="board-overlay-log">
                  {cpu.cpuThoughts.map((entry, index) => (
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
                    data-testid="pending-ruleset"
                    value={session.pendingRulesetId}
                    onChange={(event) => session.setPendingRulesetId(event.target.value as typeof session.pendingRulesetId)}
                  >
                    <option value="beginner">初級編</option>
                    <option value="advanced">上級編</option>
                  </select>
                </label>

                {session.pendingRulesetId === 'advanced' ? (
                  <label className="control-group settings-field">
                    <span>開始時の配置補助</span>
                    <select
                      value={session.setupTemplateId}
                      onChange={(event) => session.setSetupTemplateId(event.target.value as 'manual' | 'recommended')}
                    >
                      <option value="manual">手動配置</option>
                      <option value="recommended">おすすめ配置</option>
                    </select>
                  </label>
                ) : null}

                <label className="control-group settings-field">
                  <span>対人戦の CPU 難易度</span>
                  <select value={session.cpuLevel} onChange={(event) => session.setCpuLevel(event.target.value as typeof session.cpuLevel)}>
                    <option value="easy">初級</option>
                    <option value="normal">標準</option>
                    <option value="hard">上級</option>
                  </select>
                </label>

                <label className="control-group settings-field">
                  <span>3D カメラ</span>
                  <select
                    value={boardCameraMode}
                    onChange={(event) => setBoardCameraMode(event.target.value as BoardCameraMode)}
                  >
                    <option value="free">自由カメラ</option>
                    <option value="fixed">固定カメラ</option>
                  </select>
                </label>

                <label className="control-group settings-field">
                  <span>描画品質</span>
                  <select
                    value={boardRenderQuality}
                    onChange={(event) => setBoardRenderQuality(event.target.value as BoardRenderQuality)}
                  >
                    <option value="quality">高品質</option>
                    <option value="lite">軽量</option>
                  </select>
                </label>

                <label className="control-group settings-field">
                  <span>解析ヒント</span>
                  <select
                    data-testid="hint-mode"
                    value={hintEnabled ? 'on' : 'off'}
                    onChange={(event) => setHintEnabled(event.target.value === 'on')}
                  >
                    <option value="off">オフ</option>
                    <option value="on">オン</option>
                  </select>
                </label>

                <label className="control-group settings-field">
                  <span>自動対局 先手CPU</span>
                  <select
                    value={session.autoMatchCpuLevels.south}
                    onChange={(event) =>
                      session.setAutoMatchCpuLevels((current) => ({
                        ...current,
                        south: event.target.value as typeof current.south,
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
                    value={session.autoMatchCpuLevels.north}
                    onChange={(event) =>
                      session.setAutoMatchCpuLevels((current) => ({
                        ...current,
                        north: event.target.value as typeof current.north,
                      }))
                    }
                  >
                    <option value="easy">初級</option>
                    <option value="normal">標準</option>
                    <option value="hard">上級</option>
                  </select>
                </label>

                <button
                  type="button"
                  className="settings-button"
                  data-testid="start-auto-match"
                  onClick={() => dialog.openConfirmDialog('auto-match')}
                >
                  自動対局
                </button>
                <button
                  type="button"
                  className="settings-button pause-button"
                  data-testid="toggle-auto-match-paused"
                  disabled={!session.autoMatch || !!session.game.winner}
                  onClick={session.toggleAutoMatchPaused}
                >
                  {session.autoMatchPaused ? '再開' : '一時停止'}
                </button>
                {replay.isReplaying ? (
                  <div className="replay-controls" data-testid="replay-controls">
                    <button
                      type="button"
                      className="settings-button secondary replay-control-button"
                      data-testid="replay-jump-start"
                      onClick={replay.jumpToStart}
                    >
                      先頭
                    </button>
                    <button
                      type="button"
                      className="settings-button secondary replay-control-button"
                      data-testid="replay-step-backward"
                      onClick={replay.stepBackward}
                    >
                      前手
                    </button>
                    <button
                      type="button"
                      className="settings-button secondary replay-control-button"
                      data-testid="replay-step-forward"
                      onClick={replay.stepForward}
                    >
                      次手
                    </button>
                    <button
                      type="button"
                      className="settings-button secondary replay-control-button"
                      data-testid="replay-jump-latest"
                      onClick={replay.jumpToLatest}
                    >
                      最新
                    </button>
                  </div>
                ) : null}
                {session.game.phase === 'setup' ? (
                  <button
                    type="button"
                    className="settings-button commit-button"
                    disabled={!canReady || session.autoMatch || session.game.turn !== HUMAN_PLAYER || !!session.game.winner || cpu.thinking}
                    onClick={() => dialog.openConfirmDialog('ready')}
                  >
                    配置完了
                  </button>
                ) : null}
                {canApplyRecommendedSetup ? (
                  <button
                    type="button"
                    className="settings-button secondary"
                    onClick={session.applyRecommendedSetup}
                  >
                    おすすめ配置を反映
                  </button>
                ) : null}
              </div>

              <div className="settings-cluster settings-cluster-danger">
                <button
                  type="button"
                  className="settings-button"
                  data-testid="start-new-game"
                  onClick={() => dialog.openConfirmDialog('new-game')}
                >
                  新しい対局
                </button>
                <button
                  type="button"
                  className="settings-button secondary"
                  data-testid="open-save-manager"
                  onClick={openSaveManager}
                >
                  保存管理
                </button>
                {session.game.phase === 'battle' ? (
                  <button
                    type="button"
                    className="settings-button danger-button"
                    data-testid="resign-match"
                    disabled={session.autoMatch || session.game.turn !== HUMAN_PLAYER || !!session.game.winner || replay.isReplaying}
                    onClick={() => dialog.openConfirmDialog('resign')}
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

          <section className="card hint-card">
            <div className="section-heading">
              <h2>解析ヒント</h2>
              <button type="button" className="rule-button" data-testid="toggle-hint" onClick={() => setHintEnabled((current) => !current)}>
                {hintEnabled ? '停止' : '開始'}
              </button>
            </div>

            {!hintEnabled ? (
              <p className="muted">設定またはこのカードからヒントをオンにすると、おすすめの一手を表示します。</p>
            ) : hintBlockedReason ? (
              <p className="muted">{hintBlockedReason}</p>
            ) : hint.hintError ? (
              <p className="error-text">{hint.hintError}</p>
            ) : hint.hintLoading ? (
              <>
                <div className="status-banner thinking">
                  <strong>解析中</strong>
                  <span>{hint.hintThought?.message ?? '候補手を探索しています。'}</span>
                </div>
                <p className="section-note">
                  {hint.hintThought?.detail ?? 'CPU と同じロジックでおすすめの一手を計算しています。'} / {formatThoughtDuration(hint.hintElapsedMs)}
                </p>
              </>
            ) : (
              <>
                <div className="status-banner active">
                  <strong>おすすめの一手</strong>
                  <span data-testid="hint-text">{getHintMoveLabel(hint.hintMove)}</span>
                </div>
                <p className="section-note">
                  難易度 {cpuLevelText(session.cpuLevel)} 相当の読み筋です。対局中の判断材料として使えます。
                </p>
              </>
            )}
          </section>

          <section className="card action-card">
            <h2>選択可能な行動</h2>
            {replay.isReplaying ? (
              <p className="muted">リプレイ表示中は行動を実行できません。最新局面へ戻ると操作を再開できます。</p>
            ) : selection.pendingActions.length === 0 ? (
              <p className="muted">
                {session.game.phase === 'setup'
                  ? '持ち駒を選ぶと、ここに配置可能な行動が表示されます。'
                  : '盤上の駒か持ち駒を選ぶと、ここに実行可能な行動が表示されます。'}
              </p>
            ) : (
              <div className="action-list">
                {selection.pendingActions.map((move, index) => (
                  <button
                    type="button"
                    key={`action-${index}`}
                    onClick={() => {
                      session.executeMove(move);
                      selection.clearSelectionState();
                    }}
                  >
                    {getMoveButtonLabel(move)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <HandTray
            owner="south"
            title={session.game.phase === 'setup' ? `${southLabel}の配置用持ち駒` : `${southLabel}の持ち駒`}
            items={southTrayItems}
          />
        </aside>
      </div>

      {dialog.dialogState?.type === 'rules' ? (
        <RuleGuideDialog activeTab={activeRuleGuideId} onSelectTab={setActiveRuleGuideId} onClose={dialog.closeDialog} />
      ) : null}

      {dialog.dialogState?.type === 'log' ? (
        <MatchLogDialog
          currentPly={replay.isReplaying ? replay.selectedPly : session.game.history.length}
          records={session.game.history}
          replaying={replay.isReplaying}
          onClose={dialog.closeDialog}
          onSelectPly={(ply) => {
            replay.startReplayAt(ply);
            dialog.closeDialog();
          }}
        />
      ) : null}

      {dialog.dialogState?.type === 'save-manager' ? (
        <SaveManagerDialog
          autosaveSummary={session.autosaveSummary}
          exportText={saveExportText}
          importError={saveImportError}
          importText={saveImportText}
          onChangeImportText={(value) => setSaveImportText(value)}
          onClearAll={() => {
            dialog.closeDialog();
            dialog.openConfirmDialog('clear-save');
          }}
          onClose={dialog.closeDialog}
          onCopyExport={() => {
            void handleCopyExport();
          }}
          onDeleteSlot={session.deleteSelectedSave}
          onImport={handleImportSavedGame}
          onLoadSlot={handleLoadFromSlot}
          onRefreshExport={() => setSaveExportText(session.exportCurrentGameState())}
          onSaveSlot={(slotId) => session.saveCurrentGameToSlot(slotId)}
          slots={session.saveSlots}
        />
      ) : null}

      {confirmAction && confirmDialogProps ? (
        <ConfirmDialog
          title={confirmDialogProps.title}
          message={confirmDialogProps.message}
          confirmLabel={confirmDialogProps.confirmLabel}
          tone={confirmDialogProps.tone}
          onConfirm={() => handleConfirmAction(confirmAction)}
          onClose={dialog.closeDialog}
        />
      ) : null}

      {dialog.dialogState?.type === 'result' ? (
        <GameResultDialog
          winner={dialog.dialogState.winner}
          winnerLabel={getParticipantLabel(dialog.dialogState.winner, session.matchMode)}
          reason={dialog.dialogState.reason}
          elapsedLabel={formatClockDuration(session.matchElapsedMs)}
          onClose={dialog.closeDialog}
        />
      ) : null}
    </>
  );
}

export default App;
