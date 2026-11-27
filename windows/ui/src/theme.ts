// The Linux overlay's look: Theme.qml for the widgets over the game, AppTheme.qml
// for the app window. Same colours, sizes and number formats.

export const Theme = {
  // The widgets' card: alpha times the opacity setting (Panel.qml).
  panel: (opacity: number) => `rgba(13, 15, 23, ${0.78 * opacity})`,
  panelEdge: 'rgba(255, 255, 255, 0.08)',
  rowBg: 'rgba(255, 255, 255, 0.05)',
  text: '#E9EDF5',
  dim: '#9AA4B8',
  faint: '#69728A',
  accent: '#F2C15A',
  good: '#5BD68A',
  warn: '#F2C15A',
  bad: '#F0605D',
  hp: '#E0484D',
  hpBack: 'rgba(224, 71, 77, 0.18)',
  radius: 8,
  pad: 8,
  rowHeight: 22,
  fontSmall: 11,
  fontNormal: 12.5,
  fontLarge: 15,
  colCp: 40,
  colDamage: 50,
  colDps: 44,
  colShare: 32,
  colCrit: 32,
  colSpacing: 6,
  fontFamily: "Inter, 'Noto Sans', 'Segoe UI', sans-serif",
} as const;

export const AppTheme = {
  bg: '#0B0C0E',
  sidebar: '#0F1013',
  card: '#121419',
  cardEdge: '#22262E',
  row: '#161920',
  rowHover: '#1C2029',
  text: '#E8EAED',
  dim: '#A3A9B5',
  faint: '#6C7380',
  accent: '#3D8BFF',
  accentSoft: 'rgba(61, 140, 255, 0.14)',
  good: '#34C77B',
  warn: '#F2C15A',
  cube: '#4FD1E8',
  font: "'Noto Sans', 'Segoe UI', sans-serif",
  small: 12,
  normal: 14,
  large: 16,
  title: 24,
  radius: 8,
  pad: 16,
} as const;

// A2Tools' class colours, by class key.
const jobColors: Record<string, string> = {
  GLADIATOR: '#4FD1C5', TEMPLAR: '#5F8CFF', RANGER: '#41D98A', ASSASSIN: '#7BE35A',
  SORCERER: '#9A6BFF', ELEMENTALIST: '#E06BFF', CLERIC: '#F2C15A', CHANTER: '#FF9A3D', FIGHTER: '#E85D5D',
};
export const jobColor = (key?: string | null) => (key && jobColors[key]) || '#8C96AA';

// Each genus's colour (dots, badges).
const genusColors: Record<string, string> = { cogni: '#5F8CFF', fera: '#E8734A', natura: '#41C97A', varian: '#B36BFF', special: '#F2C15A' };
export const genusColor = (g?: string | null) => (g && genusColors[g]) || AppTheme.faint;

// The class icons, bundled from overlay/icons.
const icons = import.meta.glob('../../../overlay/icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const classIcon = (jobKey?: string | null) => (jobKey ? icons['../../../overlay/icons/' + jobKey + '.png'] : undefined);

/** `color` at `alpha`: "#F2C15A" → "rgba(242, 193, 90, a)". */
export function alpha(color: string, a: number) {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** 1234 → "1.23K", 12345678 → "12.3M". */
export function compact(value: unknown) {
  const n = Number(value) || 0;
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 1 : 2) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 1e4 ? 1 : 2) + 'K';
  return Math.round(n).toString();
}

export function percent(f: unknown, digits = 1) {
  return ((Number(f) || 0) * 100).toFixed(digits) + '%';
}

/** 83500 → "1:23"; an hour or more → "1:02:03". */
export function duration(ms: unknown) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? h + ':' + String(m % 60).padStart(2, '0') + ':' + ss : m + ':' + ss;
}

/** Qt's toLocaleString(Qt.locale(), "ddd d MMM, HH:mm"). */
export function dayTime(ms: number) {
  const d = new Date(ms);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return day + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
