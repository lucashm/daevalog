// Past runs side by side: every saved fight's players, grouped by player,
// class or boss (or one row per run), filtered and sorted, with the picked
// row's runs in a pane beside the table (AnalyticsPage.qml).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { send, updateSettings, useSettings, useSnapshot } from '../bridge';
import { addMyName } from '../settings';
import { classIcon, compact, duration, jobColor, percent, Theme } from '../theme';
import { Chip } from '../overlay/widgets';
import { DateRangePicker, rangeLabel } from './range';
import { DeathTimeline } from './timeline';

export type Group = 'player' | 'job' | 'boss' | 'run';
const groupNames: Record<Group, string> = { player: 'Player', job: 'Class', boss: 'Boss', run: 'Run' };
export const keyOf = (r: any, g: Group) => (g === 'player' ? r.player : g === 'job' ? r.jobKey : g === 'boss' ? r.boss : r.fightId);

/** One entry per player per fight, oldest first; actors the roster never named aren't anyone to compare. */
export function runsOf(history: any[], myNames: string[]) {
  const out: any[] = [];
  for (const f of history) {
    const seconds = Math.max(1, f.durationMs / 1000);
    for (const p of f.players) {
      if (p.name.startsWith('#')) continue;
      out.push({
        fightId: f.id, boss: f.bossName || 'Unknown', start: f.startTimeMs, durationMs: f.durationMs, killed: f.killed,
        player: p.name, job: p.job, jobKey: p.jobKey, isMe: myNames.includes(p.name),
        dps: p.dps, damage: p.damage, share: f.totalDamage > 0 ? p.damage / f.totalDamage : 0,
        // Missing from a daemon older than the overlay.
        critRate: p.critRate || 0, backRate: p.backRate || 0, active: p.active || 0,
        healPs: (p.heal || 0) / seconds, takenPs: (p.damageTaken || 0) / seconds, deaths: p.deaths || 0, deathMs: p.deathMs || [], damageBins: p.damageBins || [],
        gearScore: p.gearScore || 0, combatPower: p.combatPower || 0,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Runs grouped and sorted: a run is the whole party (its amounts add up), the rest average. */
export function rowsOf(filtered: any[], g: Group, sortKey: string, sortDesc: boolean) {
  const byKey: Record<string, any[]> = {};
  for (const r of filtered) (byKey[keyOf(r, g)] ??= []).push(r);
  const sum = (rs: any[], f: (r: any) => number) => rs.reduce((t, r) => t + f(r), 0);
  const avg = (rs: any[], f: (r: any) => number) => sum(rs, f) / rs.length;
  const add = g === 'run' ? sum : avg;
  const out = Object.keys(byKey).map(key => {
    const rs = byKey[key], last = rs[rs.length - 1], avgDps = add(rs, r => r.dps);
    return {
      key, runs: rs, count: rs.length,
      label: g === 'player' ? last.player : g === 'job' ? last.job : last.boss,
      job: last.job, jobKey: g === 'boss' || g === 'run' ? '' : last.jobKey,
      isMe: g === 'player' ? last.isMe : g === 'run' && rs.some(r => r.isMe),
      start: last.start, durationMs: last.durationMs, killed: last.killed,
      avgDps, bestDps: Math.max(...rs.map(r => r.dps)),
      share: add(rs, r => r.share), critRate: avg(rs, r => r.critRate), backRate: avg(rs, r => r.backRate), active: avg(rs, r => r.active),
      healPs: add(rs, r => r.healPs), takenPs: add(rs, r => r.takenPs), deaths: add(rs, r => r.deaths),
      killRate: avg(rs, r => (r.killed ? 1 : 0)),
      // The last 5 runs against all of them.
      trend: rs.length >= 6 ? avg(rs.slice(-5), r => r.dps) / Math.max(1, avgDps) - 1 : NaN,
    } as Record<string, any>;
  });
  const dir = sortDesc ? -1 : 1, num = (v: any) => (Number.isNaN(Number(v)) ? -Infinity : Number(v));
  return out.sort((a, b) => dir * (typeof a[sortKey] === 'string' ? a[sortKey].localeCompare(b[sortKey]) : num(a[sortKey]) - num(b[sortKey])));
}

/** The pane's DPS chart: the row's damage in each slice over the time its fights lasted there. The daemon bins per 30 s. */
export function dpsView(s: any, group: Group, meOnly: boolean) {
  if (!s) return null;
  const spanMs = Math.max(1, ...s.runs.map((r: any) => r.durationMs));
  const binMs = spanMs <= 10 * 60000 ? 30000 : 60000;
  const n = Math.ceil(spanMs / binMs);
  const dmg = new Array(n).fill(0), fights: Record<string, number> = {};
  for (const r of s.runs) {
    r.damageBins.forEach((d: number, i: number) => { dmg[Math.min(n - 1, Math.floor(i * 30000 / binMs))] += d; });
    fights[r.fightId] = r.durationMs;
  }
  // Fights saved by a daemon without the bins.
  if (!dmg.some(d => d > 0)) return null;
  const lasted = dmg.map((_, i) => Object.values(fights).reduce((t, ms) => t + Math.max(0, Math.min(binMs, ms - i * binMs)), 0));
  const runs = Object.keys(fights).length;
  const who = group !== 'boss' ? 'DPS' : meOnly ? 'Your DPS' : 'Party DPS';
  return { spanMs, binMs, runs, bins: dmg.map((d, i) => (lasted[i] ? d * 1000 / lasted[i] : 0)), title: who + ' over the fight' + (runs > 1 ? '  ·  average of ' + runs + ' runs' : '') };
}

/** The pane's death timeline: a lane for each player who died in a run, or when deaths cluster across a boss's runs. */
export function deathView(s: any, group: Group, history: any[]) {
  if (!s || (group !== 'run' && group !== 'boss')) return null;
  if (group === 'run') {
    const f = history.find(f => f.id === s.runs[0].fightId);
    if (!f) return null;
    const lanes = f.players.filter((p: any) => (p.deathMs || []).length && !p.name.startsWith('#'))
      .map((p: any) => ({ label: p.name, jobKey: p.jobKey, bold: s.runs.some((x: any) => x.isMe && x.player === p.name), ms: p.deathMs }));
    const n = lanes.reduce((t: number, l: any) => t + l.ms.length, 0);
    return { spanMs: f.durationMs, lanes, bins: [], binMs: 30000, runs: 1, title: n ? 'Deaths in this run' : 'No deaths in this run' };
  }
  const spanMs = Math.max(1, ...s.runs.map((r: any) => r.durationMs));
  const binMs = spanMs <= 10 * 60000 ? 30000 : 60000;
  const bins = new Array(Math.ceil(spanMs / binMs)).fill(0);
  let n = 0;
  for (const r of s.runs) for (const ms of r.deathMs) { bins[Math.min(bins.length - 1, Math.floor(ms / binMs))]++; n++; }
  const runs = new Set(s.runs.map((r: any) => r.fightId)).size;
  return { spanMs, lanes: [], bins: n ? bins : [], binMs, runs, title: n ? 'When deaths happen  ·  ' + n + ' in ' + runs + (runs === 1 ? ' run' : ' runs') : 'No deaths in these runs' };
}

type Column = { key: string; title: string; w?: number; main?: boolean; fmt: (v: any) => string; color?: (v: any) => string };
const common: Column[] = [
  { key: 'share', title: 'Share', fmt: v => percent(v, 0) }, { key: 'critRate', title: 'Crit', fmt: v => percent(v, 0) },
  { key: 'backRate', title: 'Back', fmt: v => percent(v, 0) }, { key: 'active', title: 'Active', fmt: v => percent(v, 0) },
  { key: 'healPs', title: 'Heal/s', fmt: v => (v > 0 ? compact(v) : '–') }, { key: 'takenPs', title: 'Taken/s', fmt: v => compact(v) },
];
const dayMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const columnsFor = (g: Group): Column[] => (g === 'run' ? [
  { key: 'start', title: 'Date', w: 1.7, fmt: v => dayMonth(v) + ' ' + new Date(v).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) },
  { key: 'durationMs', title: 'Time', fmt: v => duration(v) },
  { key: 'avgDps', title: 'DPS', main: true, fmt: v => compact(v) },
  { key: 'count', title: 'Players', fmt: v => String(v) },
  ...common.filter(c => c.key !== 'share'),
  { key: 'deaths', title: 'Deaths', fmt: v => (v > 0 ? String(v) : '–') },
  { key: 'killed', title: 'Kill', fmt: v => (v ? '✓' : ''), color: () => Theme.good },
] : [
  { key: 'count', title: 'Runs', fmt: v => String(v) },
  { key: 'avgDps', title: 'Avg DPS', main: true, fmt: v => compact(v) },
  { key: 'bestDps', title: 'Best DPS', fmt: v => compact(v) },
  ...common,
  { key: 'deaths', title: 'Deaths', fmt: v => v.toFixed(1) },
  { key: 'killRate', title: 'Kill %', fmt: v => percent(v, 0) },
  { key: 'trend', title: 'Trend', fmt: v => (Number.isNaN(v) ? '–' : (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v * 100).toFixed(0) + '%'), color: v => (Number.isNaN(v) ? Theme.faint : v >= 0 ? Theme.good : Theme.bad) },
]);

const text = { fontFamily: Theme.fontFamily, fontSize: Theme.fontSmall } as const;
const colW = 62;

export default function Analytics() {
  const s = useSnapshot();
  const settings = useSettings();
  const [group, setGroupState] = useState<Group>('player');
  const [sortKey, setSortKey] = useState('avgDps');
  const [sortDesc, setSortDesc] = useState(true);
  const [range, setRange] = useState({ from: 0, to: 0, preset: '' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [minMinutes, setMinMinutes] = useState(0);
  const [killsOnly, setKillsOnly] = useState(false);
  const [meOnly, setMeOnly] = useState(false);
  const [filters, setFilters] = useState<Partial<Record<Group, string>>>({});
  const [selectedKey, setSelectedKey] = useState('');
  const [width, setWidth] = useState(1240);

  // The page is on screen: the fight list is fetched then.
  useEffect(() => { send({ action: 'history' }); }, []);
  // Every name you've played, so "Me" works with the game closed.
  const localName: string = (s.state?.players ?? []).find((p: any) => p.isLocal)?.name ?? '';
  useEffect(() => { if (localName) updateSettings(st => addMyName(st, localName)); }, [localName]);

  const runs = useMemo(() => runsOf(s.history, settings.myNames), [s.history, settings.myNames]);
  const filtered = useMemo(() => {
    const from = range.from, to = range.to || Infinity, minMs = minMinutes * 60000;
    return runs.filter(r => r.start >= from && r.start <= to && r.durationMs >= minMs && (!killsOnly || r.killed) && (!meOnly || r.isMe)
      && (Object.keys(filters) as Group[]).every(k => keyOf(r, k) === filters[k]));
  }, [runs, range, minMinutes, killsOnly, meOnly, filters]);
  const rows = useMemo(() => rowsOf(filtered, group, sortKey, sortDesc), [filtered, group, sortKey, sortDesc]);
  // The picked row; else yours; else the top one.
  const sel = rows.find(r => r.key === selectedKey) ?? rows.find(r => r.isMe) ?? rows[0] ?? null;
  const other: Group = group === 'player' ? 'boss' : 'player';
  const columns = columnsFor(group);
  const colsW = columns.reduce((t, c) => t + Math.round((c.w || 1) * colW), 0);
  const paneW = Math.max(300, Math.min(640, width - Theme.pad * 3 - colsW - 160));
  const tableW = width - Theme.pad * 3 - paneW;
  const labelW = Math.max(80, tableW - colsW);

  const setGroup = (g: Group) => {
    setGroupState(g);
    // Runs and bosses: the latest first.
    setSortKey(g === 'run' || g === 'boss' ? 'start' : 'avgDps');
    setSortDesc(true);
    setSelectedKey('');
  };
  const sortBy = (k: string) => { if (sortKey === k) setSortDesc(!sortDesc); else { setSortKey(k); setSortDesc(k !== 'label'); } };
  const setFilter = (g: Group, value?: string) => setFilters(f => { const n = { ...f }; if (value === undefined) delete n[g]; else n[g] = value; return n; });
  const filterLabel = (g: Group, value: string) => groupNames[g] + ': ' + (g === 'job' ? runs.find(r => keyOf(r, g) === value)?.job ?? value : value);

  const dps = dpsView(sel, group, meOnly);
  const deaths = deathView(sel, group, s.history);
  const bests = (() => {
    if (!sel || group === 'run') return [];
    const best: Record<string, any> = {};
    for (const r of sel.runs) { const k = keyOf(r, other); if (!best[k] || r.dps > best[k].dps) best[k] = r; }
    return Object.values(best).sort((a, b) => b.dps - a.dps).slice(0, 8);
  })();
  const detail = (() => {
    if (!sel) return '';
    const per = group === 'run' ? '' : ' per run';
    const lines = [
      'Crit ' + percent(sel.critRate, 0) + '  ·  back ' + percent(sel.backRate, 0) + (group === 'run' ? '' : '  ·  share ' + percent(sel.share, 0)),
      (sel.healPs > 0 ? 'Heal ' + compact(sel.healPs) + '/s  ·  ' : '') + 'taken ' + compact(sel.takenPs) + '/s',
      (group === 'run' ? sel.deaths : sel.deaths.toFixed(1)) + ' deaths' + per + (group === 'run' ? '' : '  ·  ' + percent(sel.killRate, 0) + ' kills'),
    ];
    // The newest gear: it changes over time.
    const geared = sel.runs.filter((r: any) => r.gearScore > 0);
    if (group === 'player' && geared.length) {
      const g = geared[geared.length - 1];
      lines.push('Gear score ' + g.gearScore + '  ·  CP ' + compact(g.combatPower));
    }
    return lines.join('\n');
  })();

  return <div ref={el => { if (el && Math.abs(el.clientWidth - width) > 1) setWidth(el.clientWidth); }}
    style={{ position: 'relative', boxSizing: 'border-box', padding: Theme.pad, borderRadius: Theme.radius, background: 'rgb(13, 15, 23)', border: '1px solid ' + Theme.panelEdge, fontFamily: Theme.fontFamily, color: Theme.text, display: 'flex', flexDirection: 'column', gap: 3 }}>
    {/* ── title ── */}
    <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: Theme.pad }}>
      <span style={{ fontSize: Theme.fontNormal, fontWeight: 700 }}>Analytics</span>
      <span style={{ ...text, color: Theme.faint }}>{filtered.length + ' runs  ·  last ' + s.history.length + ' fights'}</span>
    </div>
    {/* ── grouping and filters ── */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <span style={{ ...text, color: Theme.dim }}>Group by</span>
      {(['player', 'job', 'boss', 'run'] as Group[]).map(g => <Chip key={g} label={g === 'run' ? 'Runs' : groupNames[g]} checked={group === g} onClick={() => setGroup(g)} />)}
      {group === 'boss' && <>
        <span style={{ ...text, color: Theme.dim, paddingLeft: Theme.pad }}>Sort</span>
        <Chip label="Latest" checked={sortKey === 'start' && sortDesc} onClick={() => { setSortKey('start'); setSortDesc(true); }} />
        <Chip label="A–Z" checked={sortKey === 'label' && !sortDesc} onClick={() => { setSortKey('label'); setSortDesc(false); }} />
      </>}
      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
        <RangeButton label={rangeLabel(range.from, range.to, range.preset)} set={range.from > 0 || range.to > 0} open={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)} />
        {pickerOpen && <DateRangePicker fromMs={range.from} toMs={range.to} preset={range.preset} starts={s.history.map(f => f.startTimeMs)}
          picked={(from, to, preset) => setRange({ from, to, preset })} closed={() => setPickerOpen(false)} />}
        <span style={{ ...text, color: Theme.dim, paddingLeft: Theme.pad }}>Min</span>
        <input value={minMinutes ? String(minMinutes) : ''} placeholder="0" onChange={e => setMinMinutes(Math.max(0, Math.min(9999, parseInt(e.target.value) || 0)))}
          style={{ ...text, width: 40, height: 24, textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid ' + Theme.panelEdge, color: Theme.text, outline: 'none' }} />
        <span style={{ ...text, color: Theme.dim, paddingRight: Theme.pad }}>min</span>
        <Chip label="Kills only" checked={killsOnly} onClick={() => setKillsOnly(!killsOnly)} />
        <Chip label="Me only" checked={meOnly} onClick={() => setMeOnly(!meOnly)} />
      </span>
    </div>
    {Object.keys(filters).length > 0 && <div style={{ display: 'flex', gap: 4 }}>
      {(Object.keys(filters) as Group[]).map(g => <Chip key={g} label={filterLabel(g, filters[g]!) + '  ✕'} onClick={() => setFilter(g)} />)}
    </div>}

    <div style={{ display: 'flex', gap: Theme.pad, alignItems: 'flex-start' }}>
      {/* ── table ── */}
      <div style={{ width: tableW, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex' }}>
          {[{ key: 'label', title: groupNames[group] } as Column, ...columns].map((c, i) => <span key={c.key} onClick={() => sortBy(c.key)} style={{
            ...text, cursor: 'pointer', width: i === 0 ? labelW : Math.round((c.w || 1) * colW), paddingLeft: i === 0 ? 6 : 0, paddingRight: i === 0 ? 0 : 6, boxSizing: 'border-box',
            textAlign: i === 0 ? 'left' : 'right', color: sortKey === c.key ? Theme.text : Theme.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.title + (sortKey === c.key ? (sortDesc ? ' ▼' : ' ▲') : '')}</span>)}
        </div>
        {rows.length > 0 && <div style={{ maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {rows.map(r => {
            const picked = sel !== null && sel.key === r.key;
            return <div key={r.key} className="analytics-row" onClick={() => setSelectedKey(r.key)} style={{
              height: Theme.rowHeight, flexShrink: 0, borderRadius: 4, display: 'flex', alignItems: 'center', cursor: 'pointer',
              boxShadow: `inset 0 0 0 1px ${picked ? Theme.accent : r.isMe ? 'rgba(255,255,255,0.35)' : 'transparent'}`,
            }}>
              <span style={{ width: labelW, paddingLeft: 6, display: 'flex', alignItems: 'center', gap: 6, boxSizing: 'border-box', minWidth: 0 }}>
                {r.jobKey && classIcon(r.jobKey) && <img src={classIcon(r.jobKey)} alt="" style={{ width: 16, height: 16 }} />}
                <span style={{ fontSize: Theme.fontNormal, fontWeight: r.isMe ? 700 : 400, color: r.jobKey && group !== 'boss' ? jobColor(r.jobKey) : Theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              </span>
              {columns.map(c => <span key={c.key} style={{
                width: Math.round((c.w || 1) * colW), paddingRight: 6, boxSizing: 'border-box', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                fontSize: c.main ? Theme.fontNormal : Theme.fontSmall, color: c.color ? c.color(r[c.key]) : c.main ? Theme.text : Theme.dim,
              }}>{c.fmt(r[c.key])}</span>)}
            </div>;
          })}
        </div>}
        {rows.length === 0 && <span style={{ ...text, color: Theme.faint }}>{s.history.length === 0 ? 'No saved fights yet. Boss fights are saved when they end.' : 'No runs match these filters.'}</span>}
      </div>

      {/* ── the picked row ── */}
      {sel && <div style={{ width: paneW, boxSizing: 'border-box', padding: Theme.pad, borderRadius: 4, background: Theme.rowBg, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: Theme.fontLarge, fontWeight: 700, color: sel.jobKey && group !== 'boss' ? jobColor(sel.jobKey) : Theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(sel.isMe ? '★ ' : '') + sel.label + (group === 'player' ? '  ·  ' + sel.job : '')}
        </span>
        <span style={{ ...text, color: Theme.dim, fontVariantNumeric: 'tabular-nums' }}>
          {group === 'run'
            ? new Date(sel.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) + '  ·  ' + duration(sel.durationMs) + (sel.killed ? '  ·  killed' : '')
            : sel.count + ' runs  ·  avg ' + compact(sel.avgDps) + '/s  ·  best ' + compact(sel.bestDps) + '/s'}
        </span>
        {/* Average DPS in each slice of the fight. */}
        {dps && <div style={{ paddingTop: 4 }}>
          <DeathTimeline title={dps.title} spanMs={dps.spanMs} bins={dps.bins} binMs={dps.binMs} runs={dps.runs} barColor={Theme.accent}
            fmt={v => compact(v)} describe={v => compact(v) + '/s' + (dps.runs > 1 ? ' on average over ' + dps.runs + ' runs' : '')} />
        </div>}
        {/* Who died when (a run), or when deaths cluster (a boss). */}
        {deaths && <div style={{ paddingTop: 4 }}>
          <DeathTimeline title={deaths.title} spanMs={deaths.spanMs} lanes={deaths.lanes} bins={deaths.bins} binMs={deaths.binMs} runs={deaths.runs} />
        </div>}
        {/* Best run per boss (or per player). */}
        {bests.length > 0 && <>
          <span style={{ ...text, color: Theme.faint, paddingTop: 4 }}>{'Best by ' + groupNames[other].toLowerCase()}</span>
          {bests.map(b => <div key={keyOf(b, other)} className="analytics-row" onClick={() => setFilter(other, keyOf(b, other))}
            style={{ height: 20, borderRadius: 3, display: 'flex', alignItems: 'center', padding: '0 4px', cursor: 'pointer', background: 'transparent' }}>
            <span style={{ ...text, width: '50%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: other === 'player' && b.isMe ? 700 : 400,
              color: other === 'player' ? jobColor(b.jobKey) : Theme.text }}>{other === 'boss' ? b.boss : b.player}</span>
            <span style={{ ...text, marginLeft: 'auto', color: Theme.dim, fontVariantNumeric: 'tabular-nums', whiteSpace: 'pre' }}>{compact(b.dps) + '/s   ' + dayMonth(b.start) + '  ›'}</span>
          </div>)}
        </>}
        <span style={{ ...text, color: Theme.dim, whiteSpace: 'pre-wrap', lineHeight: 1.4, paddingTop: 4, fontVariantNumeric: 'tabular-nums' }}>{detail}</span>
        <span style={{ paddingTop: 4 }}>
          {group === 'run'
            ? <Chip label="Open fight ›" onClick={() => send({ action: 'historyPanel', open: true, fight: sel.runs[0].fightId })} />
            : <Chip label={'Only this ' + groupNames[group].toLowerCase() + ' ›'} onClick={() => {
              // Narrow to it and break it down by the other side.
              const g = group, key = sel.key;
              setFilter(g, key);
              setGroup(g === 'boss' || g === 'job' ? 'player' : 'boss');
            }} />}
        </span>
      </div>}
    </div>
  </div>;
}

/** Opens the date range picker; shows what's picked. */
function RangeButton({ label, set, open, onClick }: { label: string; set: boolean; open: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="range-button" style={{
    ...text, height: 24, padding: `0 ${Theme.pad}px`, borderRadius: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    background: open ? 'rgba(242, 193, 90, 0.18)' : 'rgba(255,255,255,0.07)', border: '1px solid ' + (set || open ? Theme.accent : Theme.panelEdge), color: set ? Theme.accent : Theme.text,
  }}>
    {/* A little calendar. */}
    <span style={{ position: 'relative', width: 11, height: 11 }}>
      <span style={{ position: 'absolute', inset: '1px 0 0 0', borderRadius: 2, border: '1.2px solid ' + (set ? Theme.accent : Theme.dim) }} />
      <span style={{ position: 'absolute', top: 1, left: 0, right: 0, height: 3.5, borderRadius: 1.5, background: set ? Theme.accent : Theme.dim }} />
    </span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{label}</span>
    <span style={{ color: Theme.dim }}>{open ? '▴' : '▾'}</span>
  </button>;
}
