// The overlay's frame: what every widget shares. As the Linux overlay's
// OverlayWidget.qml (a placeable widget) and Panel.qml (its card).
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { updateSettings, type Snapshot } from '../bridge';
import { setWidgetPos, widgetPos, widgetVisible, type Settings } from '../settings';
import { Theme } from '../theme';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Placed extends Rect { id: string; title: string; interactive: boolean; movable: boolean }

export interface OverlayCtx {
  s: Snapshot;
  settings: Settings;
  edit: boolean;
  screen: { w: number; h: number };
  /** The game's HUD scales with the screen's height: defaults are drawn on a 1440p screen. */
  hud: number;
  now: number;
  /** Each widget on screen, by id: for alignment while dragging and for clicks. */
  placed: React.MutableRefObject<Map<string, Placed>>;
  /** Called while a widget is dragged in Customize: where it lands, and the guides it touches. */
  place: (id: string, x: number, y: number, free: boolean) => { x: number; y: number };
  endDrag: () => void;
  relayout: () => void;
  /** Which groups of widgets may show now. */
  groups: { widget: boolean; alert: boolean; history: boolean };
}
export const Ctx = createContext<OverlayCtx>(null!);
export const useOverlay = () => useContext(Ctx);

/** The dark rounded card every widget is drawn on. */
export function Panel({ children, width, padding = Theme.pad, style, solid = false }: {
  children: ReactNode; width?: number; padding?: number; style?: CSSProperties; solid?: boolean;
}) {
  const { settings } = useOverlay();
  return <div style={{
    width, boxSizing: 'border-box', padding, borderRadius: Theme.radius,
    background: Theme.panel(solid ? 1 / 0.78 : settings.opacity), border: '1px solid ' + Theme.panelEdge,
    display: 'flex', flexDirection: 'column', gap: 3, ...style,
  }}>{children}</div>;
}

/** Plain text in the widgets' font. */
export function T({ children, size = Theme.fontNormal, color = Theme.text, bold = false, style, title }: {
  children: ReactNode; size?: number; color?: string; bold?: boolean; style?: CSSProperties; title?: string;
}) {
  return <span title={title} style={{ fontSize: size, color, fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap', ...style }}>{children}</span>;
}

/**
 * One widget: where its settings put it (or its default spot), shown while
 * `wanted` or in Customize, unless turned off. In Customize it's dragged by its
 * outline; with "Drag widgets in game" on, by itself.
 */
export function Widget({ id, title, defaultPos, wanted, interactive = false, layout = true, group = 'widget', onTap, children }: {
  id: string; title: string;
  /** Widgets show while the game is focused and they aren't hidden; alerts even when hidden; the history when opened. */
  group?: 'widget' | 'alert' | 'history';
  /** The spot before it's moved, from its own size. */
  defaultPos: (size: { w: number; h: number }) => { x: number; y: number };
  wanted: boolean;
  /** Takes clicks while shown (an open history, an alert's ✕). */
  interactive?: boolean;
  /** Placed in Customize; the history isn't (it opens on demand, centred). */
  layout?: boolean;
  /** A click without a drag, in the widget's own (unscaled) coordinates. */
  onTap?: (x: number, y: number) => void;
  children: ReactNode;
}) {
  const ctx = useOverlay();
  const { settings, edit, screen } = ctx;
  const body = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const grab = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);

  const shown = widgetVisible(settings, id) && ((wanted && ctx.groups[group]) || (edit && layout));
  const saved = widgetPos(settings, id);
  const base = drag ?? saved ?? defaultPos(size);
  const x = Math.round(Math.max(0, Math.min(base.x, screen.w - size.w)));
  const y = Math.round(Math.max(0, Math.min(base.y, screen.h - size.h)));
  // Dragged by itself outside Customize, when the setting allows it.
  const movable = !edit && settings.moveInGame && !interactive;
  const editable = edit && layout;

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize(s => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown]);

  useLayoutEffect(() => {
    if (shown) ctx.placed.current.set(id, { id, title, x, y, w: size.w, h: size.h, interactive: interactive || movable, movable: layout });
    else ctx.placed.current.delete(id);
    ctx.relayout();
  });
  useLayoutEffect(() => () => { ctx.placed.current.delete(id); ctx.relayout(); }, []);

  if (!shown) return null;

  const pointerDown = (e: React.PointerEvent) => {
    if (!(editable || movable) || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-click]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grab.current = { dx: e.clientX - x, dy: e.clientY - y, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const pointerMove = (e: React.PointerEvent) => {
    const g = grab.current;
    if (!g) return;
    if (!g.moved && Math.abs(e.clientX - g.sx) + Math.abs(e.clientY - g.sy) < 4) return;
    g.moved = true;
    const at = editable
      ? ctx.place(id, e.clientX - g.dx, e.clientY - g.dy, e.shiftKey)
      : snapToGrid(settings, e.clientX - g.dx, e.clientY - g.dy, e.shiftKey);
    setDrag(at);
  };
  const pointerUp = (e: React.PointerEvent) => {
    const g = grab.current;
    grab.current = null;
    if (!g) return;
    ctx.endDrag();
    if (g.moved && drag) updateSettings(s => setWidgetPos(s, id, Math.round(Math.max(0, Math.min(drag.x, screen.w - size.w))), Math.round(Math.max(0, Math.min(drag.y, screen.h - size.h)))));
    else if (onTap) {
      const r = body.current!.getBoundingClientRect();
      onTap((e.clientX - r.left) / settings.scale, (e.clientY - r.top) / settings.scale);
    }
    setDrag(null);
  };

  return <div
    style={{ position: 'absolute', left: x, top: y, zIndex: editable ? 2 : 1, cursor: editable || movable ? (grab.current ? 'grabbing' : 'grab') : undefined }}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { grab.current = null; setDrag(null); ctx.endDrag(); }}
    className={editable ? 'editable' : undefined}>
    <div ref={body} style={{ zoom: settings.scale, width: 'max-content' }}>{children}</div>
    {editable && <>
      <div className="edit-outline" />
      <div className="edit-tag" style={{ fontSize: Theme.fontSmall }}>⠿ {title}</div>
    </>}
  </div>;
}

/** Outside Customize, dragging snaps to the grid only; Shift places freely. */
export function snapToGrid(s: Settings, x: number, y: number, free: boolean) {
  if (free || !s.snapToGrid) return { x, y };
  const g = s.gridSize;
  return { x: Math.round(x / g) * g, y: Math.round(y / g) * g };
}

// ── Customize's placement (EditorLayer.qml) ──

/** Lines a widget can line up with along one axis: the screen's edges and centre, and every other widget's. */
export function alignLines(others: Rect[], screenSize: number, horizontal: boolean) {
  const lines = [0, screenSize / 2, screenSize];
  for (const o of others) {
    const p = horizontal ? o.x : o.y;
    const s = horizontal ? o.w : o.h;
    lines.push(p, p + s / 2, p + s);
  }
  return lines;
}

/** One axis of a drag: the widget's nearest edge or centre onto a line within 8 px, else onto the grid. */
export function placeAxis(start: number, size: number, lines: number[], snap: (v: number) => number): [number, number[]] {
  let best: number | null = null;
  for (const edge of [0, size / 2, size]) {
    for (const l of lines) {
      const d = l - (start + edge);
      if (Math.abs(d) <= 8 && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  const pos = best !== null ? start + best : snap(start);
  const touched = lines.filter(l => [0, size / 2, size].some(e => Math.abs(pos + e - l) < 0.5));
  return [pos, [...new Set(touched)]];
}
