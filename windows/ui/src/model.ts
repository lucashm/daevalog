export interface Player {
  id: number; name: string; job: string; jobKey?: string; dps: number;
  damage: number; share?: number; critRate: number; isLocal?: boolean;
  /** The party roster's; 0 when the game hasn't said. */
  combatPower?: number; deaths?: number;
  // Saved fights only (daemon/src/history.rs); missing from older daemons.
  backRate?: number; active?: number; heal?: number; damageTaken?: number;
  deathMs?: number[]; damageBins?: number[]; gearScore?: number;
}
export interface Enemy {
  id: number; name: string; job: string; jobKey: string; combatPower: number;
  hp: number; maxHp: number; targeted: boolean; hittingYou: boolean; fought: boolean;
}
export interface Kina { balance: number; daily: number; gained: number; first: number; startMs: number; lastMs: number }
export interface Character {
  name: string; serverId: number; server: string; job: string; jobKey: string; level: number | null;
  combatPower: number; gearScore: number; odyle: { basic: number; charged: number } | null;
  lastSeen: number; lastPlayed: number;
}
export interface Characters { playing: string | null; list: Character[] }
export interface Skill {
  actorId?: number; code?: number; name: string; damage: number; hits: number;
  dps?: number; critRate?: number; backRate?: number; crit?: number; back?: number;
  isDot?: boolean;
}
export interface Combat {
  capture?: { gameRunning?: boolean; locked?: boolean; error?: string | null };
  character?: string | null; pingMs?: number | null; battleTimeMs?: number;
  targetMode?: string; skillsOf?: number | null; players?: Player[]; skills?: Skill[];
  target?: { name: string; currentHp: number; maxHp: number } | null;
}
export interface Fight {
  id: string; bossName: string; startTimeMs: number; durationMs: number;
  totalDamage: number; killed: boolean; players: Player[];
}
export interface PetCollection {
  server: number; ready: boolean; levels: Record<string, number>; points: Record<string, number>; estimated: number[];
}
export type WidgetId = 'meter' | 'boss' | 'ping' | 'alert' | 'pvp' | 'kina';
export interface Widget { id: WidgetId; enabled: boolean; x: number; y: number }
export interface Preferences {
  iface: string; autoStart: boolean; overlayVisible: boolean; opacity: number; scale: number;
  widgets: Widget[]; petPhase: number; pinnedPets: string[];
  notifyShugo: boolean; notifyInvasion: boolean; eventLead: number; sound: boolean;
}
export interface Snapshot {
  revision: number; running: boolean; replay: boolean; replayComplete: boolean; state: Combat; pets: PetCollection | null;
  characters: Characters | null; pvp: Enemy[]; kina: Kina;
  fights: Fight[]; fight: { summary: Fight; skills: Skill[] } | null;
  adapters: { name: string; description: string | null; addresses: string[] }[];
  preferences: Preferences; error: string | null; notice: { text: string; expires: number } | null;
  overlayLocked: boolean; overlayHotkey: boolean; overlayPassthrough: boolean; overlayWindows: number; dataDir: string;
}
/** Every native widget at its default spot; windows/src/preferences.rs has the same list. */
export const defaultWidgets: Widget[] = [{ id: 'meter', enabled: true, x: .02, y: .35 }, { id: 'boss', enabled: true, x: .35, y: .05 },
  { id: 'ping', enabled: true, x: .82, y: .85 }, { id: 'alert', enabled: true, x: .65, y: .18 },
  { id: 'pvp', enabled: true, x: .62, y: .45 }, { id: 'kina', enabled: true, x: .02, y: .72 }];
export const defaultPreferences: Preferences = {
  iface: '', autoStart: true, overlayVisible: false, opacity: 90, scale: 100, widgets: defaultWidgets,
  petPhase: 3, pinnedPets: [], notifyShugo: true, notifyInvasion: true, eventLead: 3, sound: true,
};
export const emptyKina: Kina = { balance: -1, daily: -1, gained: 0, first: 0, startMs: 0, lastMs: 0 };
export const emptySnapshot: Snapshot = {
  revision: 0, running: false, replay: false, replayComplete: false, state: {}, pets: null,
  characters: null, pvp: [], kina: emptyKina, fights: [], fight: null,
  adapters: [], preferences: defaultPreferences, error: null, notice: null,
  overlayLocked: false, overlayHotkey: false, overlayPassthrough: false, overlayWindows: 0, dataDir: '',
};
export const number = (n: number | undefined | null) => {
  if (n == null || !Number.isFinite(n)) return '—';
  return Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'm' : Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toLocaleString();
};
export const duration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s >= 3600 ? Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
export const nextEvent = (now: number, minute: number) => {
  const at = Math.floor(now / 3600000) * 3600000 + minute * 60000;
  return at <= now ? at + 3600000 : at;
};
export function playerShares(players: Player[]): Player[] {
  const sum = players.reduce((n, p) => n + p.damage, 0);
  return players.map(p => ({ ...p, share: sum ? p.damage / sum * 100 : 0 }));
}
export function savedSkills(skills: Skill[], actor: number, ms: number): Skill[] {
  return skills.filter(s => s.actorId === actor).map(s => ({
    ...s, dps: s.damage / Math.max(ms / 1000, 1),
    critRate: !s.isDot && s.hits > 0 ? (s.crit ?? 0) / s.hits : 0,
    backRate: !s.isDot && s.hits > 0 ? (s.back ?? 0) / s.hits : 0,
  })).sort((a, b) => b.damage - a.damage);
}
export const percent = (v: number | undefined, digits = 0) => v == null || !Number.isFinite(v) ? '—' : (v * 100).toFixed(digits) + '%';

// ── kina (the session itself is counted in windows/src/model.rs) ──
export const KINA_SESSION_MS = 5 * 60 * 1000, KINA_DAILY_CAP = 1_000_000;
export function kinaView(k: Kina, now: number) {
  const recent = k.lastMs > 0 && now - k.lastMs < KINA_SESSION_MS;
  const ms = Math.max(now, k.lastMs) - k.startMs;
  const perSecond = ms > 0 ? (k.gained - k.first) / (ms / 1000) : 0;
  const left = Math.max(0, KINA_DAILY_CAP - k.daily);
  return { recent, ms, perSecond, perHour: perSecond * 3600, left,
    capInMs: left > 0 && perSecond > 0 ? left / perSecond * 1000 : null };
}

// ── characters (as the Linux Characters page reads them) ──
/** Basic Odyle energy caps at 840 and recharges 15 every 3 h on the clock (UTC 1, 4, 7, ...); charged doesn't. */
export const ODYLE_CAP = 840, ODYLE_TICK = 3 * 3600e3, ODYLE_PHASE = 3600e3;
const odyleTicks = (from: number, to: number) => Math.max(0, Math.floor((to - ODYLE_PHASE) / ODYLE_TICK) - Math.floor((from - ODYLE_PHASE) / ODYLE_TICK));
/** Basic energy now: as read while playing, else what was read plus the recharges since. */
export function odyleNow(c: Character, live: boolean, now: number) {
  if (!c.odyle) return 0;
  const b = c.odyle.basic;
  return live || b >= ODYLE_CAP ? b : Math.min(ODYLE_CAP, b + 15 * odyleTicks(c.lastSeen, now));
}
/** When basic energy reaches the cap (ms); 0 if it has. */
export function odyleFull(basic: number, now: number) {
  if (basic >= ODYLE_CAP) return 0;
  return (Math.floor((now - ODYLE_PHASE) / ODYLE_TICK) + Math.ceil((ODYLE_CAP - basic) / 15)) * ODYLE_TICK + ODYLE_PHASE;
}
export const played = (c: Character) => Math.max(c.lastSeen || 0, c.lastPlayed || 0);
export function ago(ms: number, now: number) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}
/** By server, the one played last first; in each, the one playing, then the one played last. */
export function characterGroups(info: Characters | null) {
  const playing = info?.playing ?? '';
  const list = [...(info?.list ?? [])].sort((a, b) => Number(b.name === playing) - Number(a.name === playing) || played(b) - played(a));
  const out: { server: string; list: Character[] }[] = [];
  for (const c of list) {
    const server = c.server || (c.serverId ? 'Server ' + c.serverId : 'Unknown server');
    let g = out.find(g => g.server === server);
    if (!g) out.push(g = { server, list: [] });
    g.list.push(c);
  }
  return out;
}

// ── a fight's timeline: deaths and damage per 30s slice ──
/** The daemon's slice for a saved fight's damage (DAMAGE_BIN_MS). */
export const DAMAGE_BIN_MS = 30000;
export interface Lane { label: string; jobKey?: string; bold: boolean; ms: number[] }
/** Who died when in one fight; players who didn't die have no lane. Yours are bold. */
export function deathLanes(fight: Fight, myNames: string[]): Lane[] {
  return fight.players.filter(p => (p.deathMs ?? []).length && !p.name.startsWith('#'))
    .map(p => ({ label: p.name, jobKey: p.jobKey, bold: myNames.includes(p.name), ms: p.deathMs! }));
}
/** Every name you've played: your characters, and whoever is in game now. */
export function myNames(characters: Characters | null, live?: string | null) {
  const names = new Set((characters?.list ?? []).map(c => c.name));
  if (live) names.add(live);
  return [...names];
}
/** A fight's party DPS in each of the daemon's 30s slices (the last slice only as long as the fight ran into it). */
export function partyDpsBins(fight: Fight) {
  const n = Math.max(0, ...fight.players.map(p => p.damageBins?.length ?? 0));
  return Array.from({ length: n }, (_, i) => {
    const lasted = Math.max(1, Math.min(DAMAGE_BIN_MS, fight.durationMs - i * DAMAGE_BIN_MS));
    return fight.players.reduce((t, p) => t + (p.damageBins?.[i] ?? 0), 0) * 1000 / lasted;
  });
}
/** The shortest step (ms) between minute marks that leaves `minPx` for each label. */
export function tickStep(spanMs: number, widthPx: number, minPx = 48) {
  return [1, 2, 5, 10, 15, 30, 60].map(m => m * 60000).find(ms => widthPx * ms / Math.max(1, spanMs) >= minPx) ?? 3600000;
}

// ── analytics (the Linux Analytics page, daemon/src/history.rs's summaries) ──
export type Group = 'player' | 'job' | 'boss' | 'run';
export interface Run {
  fightId: string; boss: string; start: number; durationMs: number; killed: boolean;
  player: string; job: string; jobKey: string; isMe: boolean; dps: number; damage: number; share: number;
  critRate: number; backRate: number; active: number; healPs: number; takenPs: number;
  deaths: number; deathMs: number[]; damageBins: number[]; gearScore: number; combatPower: number;
}
/** One entry per player per fight, oldest first. Actors the roster never named ("#123") aren't anyone to compare. */
export function analyticsRuns(fights: Fight[], myNames: string[]): Run[] {
  const out: Run[] = [];
  for (const f of fights) {
    const seconds = Math.max(1, f.durationMs / 1000);
    const total = f.totalDamage || f.players.reduce((n, p) => n + p.damage, 0);
    for (const p of f.players) {
      if (p.name.startsWith('#')) continue;
      out.push({ fightId: f.id, boss: f.bossName || 'Unknown', start: f.startTimeMs, durationMs: f.durationMs, killed: f.killed,
        player: p.name, job: p.job, jobKey: p.jobKey ?? '', isMe: myNames.includes(p.name), dps: p.dps, damage: p.damage,
        share: total > 0 ? p.damage / total : 0, critRate: p.critRate || 0, backRate: p.backRate || 0, active: p.active || 0,
        healPs: (p.heal || 0) / seconds, takenPs: (p.damageTaken || 0) / seconds, deaths: p.deaths || 0,
        deathMs: p.deathMs || [], damageBins: p.damageBins || [], gearScore: p.gearScore || 0, combatPower: p.combatPower || 0 });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
export const keyOf = (r: Run, g: Group) => g === 'player' ? r.player : g === 'job' ? r.jobKey : g === 'boss' ? r.boss : r.fightId;
export interface RunFilter { from: number; to: number; minMinutes: number; killsOnly: boolean; meOnly: boolean; filters: Partial<Record<Group, string>> }
/** Runs that started in [from, to] (0 = an open end) and pass every filter. */
export function filterRuns(runs: Run[], f: RunFilter) {
  const to = f.to || Infinity, minMs = f.minMinutes * 60000;
  return runs.filter(r => r.start >= f.from && r.start <= to && r.durationMs >= minMs && (!f.killsOnly || r.killed) && (!f.meOnly || r.isMe)
    && (Object.keys(f.filters) as Group[]).every(k => keyOf(r, k) === f.filters[k]));
}
export interface Row {
  key: string; runs: Run[]; count: number; label: string; job: string; jobKey: string; isMe: boolean;
  start: number; durationMs: number; killed: boolean; avgDps: number; bestDps: number; share: number;
  critRate: number; backRate: number; active: number; healPs: number; takenPs: number; deaths: number;
  killRate: number; trend: number;
}
export type SortKey = keyof Omit<Row, 'runs'>;
export function analyticsRows(runs: Run[], g: Group, sortKey: SortKey, desc: boolean): Row[] {
  const byKey = new Map<string, Run[]>();
  for (const r of runs) { const k = keyOf(r, g); byKey.set(k, [...(byKey.get(k) ?? []), r]); }
  const sum = (rs: Run[], f: (r: Run) => number) => rs.reduce((t, r) => t + f(r), 0);
  const avg = (rs: Run[], f: (r: Run) => number) => sum(rs, f) / rs.length;
  // A run is the whole party: its amounts add up, its rates average.
  const add = g === 'run' ? sum : avg;
  const out = [...byKey].map(([key, rs]): Row => {
    const last = rs[rs.length - 1], avgDps = add(rs, r => r.dps);
    return { key, runs: rs, count: rs.length,
      label: g === 'player' ? last.player : g === 'job' ? last.job : last.boss,
      job: last.job, jobKey: g === 'boss' || g === 'run' ? '' : last.jobKey,
      isMe: g === 'player' ? last.isMe : g === 'run' && rs.some(r => r.isMe),
      start: last.start, durationMs: last.durationMs, killed: last.killed,
      avgDps, bestDps: Math.max(...rs.map(r => r.dps)), share: add(rs, r => r.share),
      critRate: avg(rs, r => r.critRate), backRate: avg(rs, r => r.backRate), active: avg(rs, r => r.active),
      healPs: add(rs, r => r.healPs), takenPs: add(rs, r => r.takenPs), deaths: add(rs, r => r.deaths),
      killRate: avg(rs, r => r.killed ? 1 : 0),
      // The last 5 runs against all of them.
      trend: rs.length >= 6 ? avg(rs.slice(-5), r => r.dps) / Math.max(1, avgDps) - 1 : NaN };
  });
  const dir = desc ? -1 : 1, num = (v: unknown) => Number.isNaN(Number(v)) ? -Infinity : Number(v);
  return out.sort((a, b) => dir * (typeof a[sortKey] === 'string' ? String(a[sortKey]).localeCompare(String(b[sortKey])) : num(a[sortKey]) - num(b[sortKey])));
}
/** A row's DPS in each slice of its fights: damage there over the time its fights lasted there. */
export function dpsView(row: Row | null) {
  if (!row) return null;
  const spanMs = Math.max(1, ...row.runs.map(r => r.durationMs));
  const binMs = spanMs <= 10 * 60000 ? 30000 : 60000, n = Math.ceil(spanMs / binMs);
  const dmg = new Array(n).fill(0), fights: Record<string, number> = {};
  for (const r of row.runs) {
    r.damageBins.forEach((d, i) => { dmg[Math.min(n - 1, Math.floor(i * DAMAGE_BIN_MS / binMs))] += d; });
    fights[r.fightId] = r.durationMs;
  }
  // Fights saved by a daemon without the bins.
  if (!dmg.some(d => d > 0)) return null;
  const lasted = dmg.map((_, i) => Object.values(fights).reduce((t, ms) => t + Math.max(0, Math.min(binMs, ms - i * binMs)), 0));
  return { spanMs, binMs, runs: Object.keys(fights).length, bins: dmg.map((d, i) => lasted[i] ? d * 1000 / lasted[i] : 0) };
}
/** When deaths cluster across a row's runs, per 30s (per 1 min past 10 min). */
export function deathBins(row: Row) {
  const spanMs = Math.max(1, ...row.runs.map(r => r.durationMs));
  const binMs = spanMs <= 10 * 60000 ? 30000 : 60000, bins = new Array(Math.ceil(spanMs / binMs)).fill(0);
  let total = 0;
  for (const r of row.runs) for (const ms of r.deathMs) { bins[Math.min(bins.length - 1, Math.floor(ms / binMs))]++; total++; }
  return { spanMs, binMs, bins, total, runs: new Set(row.runs.map(r => r.fightId)).size };
}
/** Start of the local day `days` days before `now`'s (0 = today). */
export function dayStart(now: number, days = 0) {
  const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - days); return d.getTime();
}

export interface PetDefinition {
  name: string; genus: string; unreleased: boolean;
  drops: { npc: string; region: string; level: number; spawns: number }[];
}
export function collectionRows(all: Record<string, PetDefinition>, collection: PetCollection | null, phase: number) {
  const thresholds = [5, 25, 75];
  const known = collection?.ready ? collection : null;
  return Object.entries(all).filter(([, p]) => !p.unreleased).map(([id, p]) => {
    const level = known?.levels[id] ?? 0, points = known?.points[id] ?? 0;
    const drop = [...p.drops].sort((a, b) => a.level - b.level || b.spawns - a.spawns)[0];
    return { ...p, id, level, points, drop, estimated: known?.estimated.includes(Number(id)) ?? false,
      remaining: Math.max(0, thresholds.slice(level, phase).reduce((n, x) => n + x, 0) - points),
      needed: known ? level < phase : false, next: thresholds[level] ?? 0 };
  });
}
