import { useMemo, useState } from 'react';
import { compareCoords, getTopPiece } from '../game/board';
import { getPieceDefinition } from '../game/pieces';
import { type Coord, type GameMove, type GameState, type PieceKind, type Player } from '../game/types';

function isTargetMove(move: GameMove): move is Exclude<GameMove, { type: 'ready' } | { type: 'resign' }> {
  return 'to' in move;
}

interface UseSelectionStateOptions {
  game: GameState;
  legalMoves: GameMove[];
  humanPlayer: Player;
  interactionsLocked: boolean;
  onExecuteMove: (move: GameMove) => void;
}

export function useSelectionState({
  game,
  legalMoves,
  humanPlayer,
  interactionsLocked,
  onExecuteMove,
}: UseSelectionStateOptions) {
  const [selectedSquare, setSelectedSquare] = useState<Coord | null>(null);
  const [selectedHandKind, setSelectedHandKind] = useState<PieceKind | null>(null);
  const [pendingActions, setPendingActions] = useState<GameMove[]>([]);

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
        (move) => (move.type === 'drop' || move.type === 'deploy') && move.pieceKind === selectedHandKind,
      );
    }

    return [];
  }, [game.phase, legalMoves, selectedHandKind, selectedSquare]);

  const selectedPieceKind = useMemo(() => {
    if (selectedHandKind) {
      return selectedHandKind;
    }

    if (!selectedSquare) {
      return null;
    }

    return getTopPiece(game.board, selectedSquare)?.kind ?? null;
  }, [game.board, selectedHandKind, selectedSquare]);

  const clearSelectionState = () => {
    setSelectedSquare(null);
    setSelectedHandKind(null);
    setPendingActions([]);
  };

  const handleSquareClick = (coord: Coord) => {
    if (interactionsLocked) {
      return;
    }

    if (selectedHandKind) {
      const matches = selectedMoves.filter(
        (move): move is Exclude<GameMove, { type: 'ready' } | { type: 'resign' }> =>
          isTargetMove(move) && compareCoords(move.to, coord),
      );

      if (matches.length === 1) {
        onExecuteMove(matches[0]);
        clearSelectionState();
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
    const isOwnTop = topPiece?.owner === humanPlayer;

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
        onExecuteMove(matches[0]);
        clearSelectionState();
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
        (move.type === 'drop' || move.type === 'deploy') && move.player === humanPlayer && move.pieceKind === kind,
    );

    if (interactionsLocked || game.hands[humanPlayer][kind] <= 0 || !hasMove) {
      return;
    }

    setSelectedSquare(null);
    setPendingActions([]);
    setSelectedHandKind((current) => (current === kind ? null : kind));
  };

  const selectionSummary = selectedHandKind
    ? `${game.phase === 'setup' ? '配置用の持ち駒' : '持ち駒'}: ${getPieceDefinition(selectedHandKind).label}`
    : selectedPieceKind
      ? `選択中: ${getPieceDefinition(selectedPieceKind).label}`
      : game.phase === 'setup'
        ? '持ち駒を選んで配置したいマスをクリックしてください。'
        : '盤上の駒か持ち駒を選ぶと、実行できる行動を確認できます。';

  return {
    clearSelectionState,
    handleHandClick,
    handleSquareClick,
    pendingActions,
    selectedHandKind,
    selectedMoves,
    selectedPieceKind,
    selectedSquare,
    selectionSummary,
    setPendingActions,
  };
}
