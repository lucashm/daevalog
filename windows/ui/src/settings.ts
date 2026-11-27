// overlay.json, as the Linux overlay's Settings.qml keeps it: the same keys and
// defaults, so a settings file reads the same on both. Stored by Rust as one
// object; every change replaces it (never mutates), as Settings.qml does.

export interface WidgetPlace { x?: number; y?: number; visible?: boolean }
export type Metric = 'both' | 'damage' | 'dps';

export const defaults = {
  scale: 1.0,
  opacity: 0.85,
  alwaysShow: false,
  // Widgets take the pointer outside Customize, to be dragged while the game's cursor is free (Alt).
  moveInGame: false,
  // The key under Esc: by the left hand and unbound in the game.
  shortcutEdit: 'CTRL + grave',
  shortcutHide: 'ALT + grave',
  maxRows: 10,
  skillRows: 10,
  gameMonitor: '',
  // A monitor picked in Customize; empty = follow the game.
  pinnedMonitor: '',
  hideWidgets: false,
  meterMetric: 'both' as Metric,
  historyMetric: 'both' as Metric,
  snapToGrid: true,
  gridSize: 32,
  // id -> { x, y, visible }
  widgets: {} as Record<string, WidgetPlace>,
  // Three saved layouts: each a copy of `widgets`, or null.
  layouts: [] as (Record<string, WidgetPlace> | null)[],
  // Every name seen as the local player: "you" in analytics.
  myNames: [] as string[],
  appPage: 'pets',
  petsHelpHidden: false,
  petsPhase: '3',
  petsGenus: ['cogni', 'fera', 'natura', 'varian', 'special'],
  petsFarmIn: ['elyos', 'asmodian', 'abyss'],
  petsSort: 'closest',
  notifyCubes: true,
  cubesNeedKey: true,
  cubeSound: true,
  notifyShugo: true,
  notifyInvasion: true,
  eventLead: 3,
  eventSound: true,
};
export type Settings = typeof defaults;

/** The file over the defaults; a value of the wrong type falls back to its default. */
export function readSettings(raw: unknown): Settings {
  const file = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...defaults } as Record<string, unknown>;
  for (const [k, d] of Object.entries(defaults)) {
    const v = file[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(d) ? Array.isArray(v) : typeof v === typeof d) out[k] = v;
  }
  const s = out as Settings;
  // Raids are 10; old configs saved 8.
  s.maxRows = Math.max(10, s.maxRows);
  return s;
}

export const widgetPos = (s: Settings, id: string) => {
  const w = s.widgets[id];
  return w && w.x !== undefined && w.y !== undefined ? { x: w.x, y: w.y } : null;
};
export const widgetVisible = (s: Settings, id: string) => s.widgets[id]?.visible !== false;

function updateWidget(s: Settings, id: string, change: WidgetPlace): Partial<Settings> {
  return { widgets: { ...s.widgets, [id]: { ...(s.widgets[id] ?? {}), ...change } } };
}
export const setWidgetPos = (s: Settings, id: string, x: number, y: number) => updateWidget(s, id, { x, y });
export const setWidgetVisible = (s: Settings, id: string, visible: boolean) => updateWidget(s, id, { visible });

export function saveLayout(s: Settings, i: number): Partial<Settings> {
  const all = [0, 1, 2].map(n => s.layouts[n] ?? null);
  all[i] = JSON.parse(JSON.stringify(s.widgets));
  return { layouts: all };
}
export function loadLayout(s: Settings, i: number): Partial<Settings> {
  const l = s.layouts[i];
  return l ? { widgets: JSON.parse(JSON.stringify(l)) } : {};
}
/** Back to the default spots; hidden widgets stay hidden. */
export function resetLayout(s: Settings): Partial<Settings> {
  const all: Record<string, WidgetPlace> = {};
  for (const id in s.widgets) if (s.widgets[id].visible === false) all[id] = { visible: false };
  return { widgets: all };
}
export const clampScale = (v: number) => Math.round(Math.max(0.6, Math.min(2.0, v)) * 10) / 10;
export const clampOpacity = (v: number) => Math.round(Math.max(0.2, Math.min(1.0, v)) * 10) / 10;
export const clampGrid = (v: number) => Math.max(4, Math.min(64, v));
/** One combo per shortcut: giving a combo to one takes it from the other. */
export function setShortcut(s: Settings, name: 'edit' | 'hide', combo: string): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (combo && name !== 'edit' && s.shortcutEdit === combo) out.shortcutEdit = '';
  if (combo && name !== 'hide' && s.shortcutHide === combo) out.shortcutHide = '';
  if (name === 'edit') out.shortcutEdit = combo;
  else out.shortcutHide = combo;
  return out;
}
export function addMyName(s: Settings, name: string): Partial<Settings> {
  return s.myNames.includes(name) ? {} : { myNames: [...s.myNames, name] };
}
