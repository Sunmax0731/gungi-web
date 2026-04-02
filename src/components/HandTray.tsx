import { createRef, useMemo, type CSSProperties, type RefObject } from 'react';
import { HandTrayScene, type HandTrayItem } from './HandTrayScene';
import { getHandTrayLayout } from './handTrayLayout';
import { type PieceKind, type Player } from '../game/types';

export interface TrayItemState extends HandTrayItem {
  label: string;
  readOnly: boolean;
  onClick?: () => void;
}

interface HandTrayProps {
  owner: Player;
  title: string;
  items: TrayItemState[];
}

export function HandTray({ owner, title, items }: HandTrayProps) {
  const layout = getHandTrayLayout(items.length);
  const trackRefKey = items.map((item) => item.kind).join('|');
  const trackRefs = useMemo(() => {
    const refs = new Map<PieceKind, RefObject<HTMLButtonElement | null>>();
    const kinds = trackRefKey ? (trackRefKey.split('|') as PieceKind[]) : [];
    for (const kind of kinds) {
      refs.set(kind, createRef<HTMLButtonElement>());
    }
    return refs;
  }, [trackRefKey]);
  const style = {
    '--tray-columns': String(layout.columns),
    '--tray-rows': String(layout.rows),
  } as CSSProperties;

  return (
    <section className="card reserve-section">
      <div className="section-heading">
        <h2>{title}</h2>
      </div>
      <div className="hand-tray-shell" style={style}>
        <div className="hand-tray-grid">
          {items.map((item) => (
            <button
              type="button"
              key={`${owner}-${item.kind}`}
              ref={trackRefs.get(item.kind)}
              className={[
                'hand-tray-cell',
                item.selected ? 'selected' : '',
                item.disabled ? 'disabled' : '',
                item.readOnly ? 'readonly' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={item.readOnly || item.disabled}
              aria-pressed={item.readOnly ? undefined : item.selected}
              onClick={item.onClick}
            >
              <span className="hand-tray-count">{item.count}</span>
              <span className="hand-tray-label">{item.label}</span>
            </button>
          ))}
        </div>
        <HandTrayScene owner={owner} items={items} trackRefs={trackRefs} />
      </div>
    </section>
  );
}
