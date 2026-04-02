export interface HandTrayLayout {
  columns: number;
  rows: number;
}

export function getHandTrayLayout(itemCount: number): HandTrayLayout {
  const columns = itemCount <= 6 ? 3 : 4;
  return {
    columns,
    rows: Math.max(1, Math.ceil(itemCount / columns)),
  };
}
