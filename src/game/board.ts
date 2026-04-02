import { BOARD_SIZE, type Board, type BoardStack, type Coord, type Player } from './types';

export function coordToIndex(coord: Coord): number {
  return coord.y * BOARD_SIZE + coord.x;
}

export function isInsideBoard(coord: Coord): boolean {
  return (
    Number.isInteger(coord.x) &&
    Number.isInteger(coord.y) &&
    coord.x >= 0 &&
    coord.x < BOARD_SIZE &&
    coord.y >= 0 &&
    coord.y < BOARD_SIZE
  );
}

export function createEmptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => []);
}

export function cloneBoard(board: Board): Board {
  return board.map((stack) => [...stack]);
}

export function getStack(board: Board, coord: Coord): BoardStack {
  return board[coordToIndex(coord)];
}

export function setStack(board: Board, coord: Coord, stack: BoardStack): void {
  board[coordToIndex(coord)] = stack;
}

export function getTopPiece(board: Board, coord: Coord) {
  const stack = getStack(board, coord);
  return stack.at(-1) ?? null;
}

export function compareCoords(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

export function mirrorCoord(coord: Coord): Coord {
  return {
    x: BOARD_SIZE - 1 - coord.x,
    y: BOARD_SIZE - 1 - coord.y,
  };
}

export function forwardFactor(player: Player): 1 | -1 {
  return player === 'south' ? 1 : -1;
}

export function listCoords(): Coord[] {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
    x: index % BOARD_SIZE,
    y: Math.floor(index / BOARD_SIZE),
  }));
}

export function coordLabel(coord: Coord): string {
  const file = coord.x + 1;
  const rank = String.fromCharCode(65 + coord.y);
  return `${file}${rank}`;
}
