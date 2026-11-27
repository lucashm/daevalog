// A from/to range for the analytics filter (DateRangePicker.qml): presets, a
// month calendar (a day with saved fights carries a dot, brighter for more)
// and the from/to times. Each change applies at once. 0 = an open end.
import { useEffect, useMemo, useState } from 'react';
import { Theme } from '../theme';

const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const endOfDay = (ms: number) => { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); };
const addDays = (ms: number, n: number) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
const firstOfMonth = (ms: number) => { const d = new Date(startOfDay(ms)); d.setDate(1); return d.getTime(); };
const addMonths = (ms: number, n: number) => { const d = new Date(ms); d.setMonth(d.getMonth() + n); return d.getTime(); };
const hhmm = (ms: number) => (ms ? new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }) : '--:--');
const dayMonth = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const plural = (n: number, w: string) => n + ' ' + w + (n === 1 ? '' : 's');

/** The range button's words: a preset's name, a day, or from–to. */
export function rangeLabel(from: number, to: number, preset: string) {
  if (preset) return preset;
  if (!from && !to) return 'All time';
  const midnight = (ms: number) => hhmm(ms) === '00:00';
  if (from && to && new Date(from).toDateString() === new Date(to).toDateString() && midnight(from) && hhmm(to) === '23:59')
    return new Date(from).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const at = (ms: number) => (midnight(ms) ? dayMonth(ms) : dayMonth(ms) + ' ' + hhmm(ms));
  if (!to) return 'Since ' + at(from);
  if (!from) return 'Until ' + dayMonth(to) + ' ' + hhmm(to);
  return at(from) + '  –  ' + (hhmm(to) === '23:59' ? dayMonth(to) : dayMonth(to) + ' ' + hhmm(to));
}

export function presets(now: number) {
  const today = startOfDay(now);
  return [
    { name: 'All time', from: 0, to: 0 },
    { name: 'Today', from: today, to: 0 },
    { name: 'Yesterday', from: addDays(today, -1), to: endOfDay(addDays(today, -1)) },
    { name: 'Last 24 hours', from: now - 86400000, to: 0 },
    { name: 'Last 7 days', from: addDays(today, -6), to: 0 },
    { name: 'Last 30 days', from: addDays(today, -29), to: 0 },
    { name: 'This month', from: firstOfMonth(now), to: 0 },
    { name: 'Last month', from: addMonths(firstOfMonth(now), -1), to: firstOfMonth(now) - 1 },
  ];
}

const text = { fontFamily: Theme.fontFamily, fontSize: Theme.fontSmall, fontVariantNumeric: 'tabular-nums' } as const;

export function DateRangePicker({ fromMs, toMs, preset, starts, picked, closed }: {
  fromMs: number; toMs: number; preset: string; starts: number[];
  picked: (from: number, to: number, preset: string) => void; closed: () => void;
}) {
  const today = startOfDay(Date.now());
  // First of the month on show; the first day clicked, waiting for the last.
  const [viewMs, setViewMs] = useState(firstOfMonth(fromMs || Date.now()));
  const [anchor, setAnchor] = useState(0);
  const [hoverDay, setHoverDay] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closed(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  const counts = useMemo(() => {
    const c: Record<number, number> = {};
    for (const t of starts) { const d = startOfDay(t); c[d] = (c[d] || 0) + 1; }
    return c;
  }, [starts]);
  const peak = Math.max(1, ...Object.values(counts));
  const fightsBetween = (a: number, b: number) => starts.filter(t => (!a || t >= a) && (!b || t <= b)).length;
  // What the calendar shows as picked: the range, or the one being drawn.
  const selFrom = anchor ? Math.min(anchor, hoverDay || anchor) : fromMs;
  const selTo = anchor ? endOfDay(Math.max(anchor, hoverDay || anchor)) : toMs || (fromMs ? Date.now() : 0);
  // The 6 weeks on show, Monday first.
  const back = (new Date(viewMs).getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => addDays(addDays(viewMs, -back), i));
  // One click: that whole day. A second: the range between.
  const clickDay = (day: number) => {
    if (!anchor) { setAnchor(day); picked(day, endOfDay(day), ''); return; }
    const a = Math.min(anchor, day), b = Math.max(anchor, day);
    setAnchor(0);
    picked(a, endOfDay(b), '');
  };
  // "18:30" on the day of `ms` (today when open); null when not a time.
  const withTime = (ms: number, value: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    const d = new Date(ms || Date.now());
    d.setHours(+m[1], +m[2], 0, 0);
    return d.getTime();
  };
  const now = Date.now();
  return <>
    {/* Clicks outside close it. */}
    <div onClick={closed} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
    <div style={{ position: 'absolute', right: 0, top: 30, zIndex: 11, display: 'flex', gap: 12, padding: 12, borderRadius: Theme.radius * 1.5, background: 'rgb(20, 23, 31)',
      border: '1px solid ' + Theme.panelEdge, boxShadow: '0 12px 40px rgba(0,0,0,.45)', color: Theme.text }}>
      {/* ── presets ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: 150 }}>
        {presets(now).map(p => {
          const on = preset === p.name || (!preset && p.name === 'All time' && !fromMs && !toMs);
          return <div key={p.name} className="preset" onClick={() => { setAnchor(0); picked(p.from, p.to, p.name); setViewMs(firstOfMonth(p.from || now)); }}
            style={{ ...text, height: 28, padding: '0 10px', borderRadius: 6, display: 'flex', alignItems: 'center', cursor: 'pointer', background: on ? 'rgba(242, 193, 90, 0.18)' : 'transparent', color: on ? Theme.accent : Theme.text }}>
            {p.name}<span style={{ marginLeft: 'auto', color: Theme.faint }}>{fightsBetween(p.from, p.to)}</span>
          </div>;
        })}
      </div>
      {/* ── calendar ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="cal-nav" onClick={() => setViewMs(addMonths(viewMs, -1))}>‹</span>
          <span style={{ ...text, fontSize: Theme.fontNormal, fontWeight: 700, flex: 1, textAlign: 'center' }}>{new Date(viewMs).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span>
          <span className="cal-nav" onClick={() => setViewMs(addMonths(viewMs, 1))}>›</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 34px)', rowGap: 2 }}>
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <span key={d} style={{ ...text, color: Theme.faint, textAlign: 'center', height: 20 }}>{d}</span>)}
          {days.map(day => {
            const inMonth = new Date(day).getMonth() === new Date(viewMs).getMonth();
            const future = day > today;
            const isStart = selFrom > 0 && day === startOfDay(selFrom);
            const isEnd = selTo > 0 && day === startOfDay(selTo);
            const inRange = selTo > 0 && endOfDay(day) >= selFrom && day <= selTo;
            const n = counts[day] || 0;
            return <span key={day} onClick={() => !future && clickDay(day)} onMouseEnter={() => setHoverDay(day)} onMouseLeave={() => setHoverDay(0)}
              style={{ position: 'relative', height: 34, display: 'grid', placeItems: 'center', cursor: future ? 'default' : 'pointer',
                background: inRange ? `rgba(242, 193, 90, ${anchor ? 0.10 : 0.16})` : 'transparent' }}>
              <span style={{ ...text, width: 28, height: 28, borderRadius: 14, display: 'grid', placeItems: 'center',
                background: isStart || isEnd ? Theme.accent : hoverDay === day && !future ? 'rgba(255,255,255,0.10)' : 'transparent',
                color: isStart || isEnd ? '#1b1b1b' : !inMonth || future ? Theme.faint : Theme.text, fontWeight: isStart || isEnd || day === today ? 700 : 400,
                outline: day === today && !isStart && !isEnd ? '1px solid ' + Theme.panelEdge : undefined }}>{new Date(day).getDate()}</span>
              {/* Days you played: brighter for more fights. */}
              {n > 0 && <span title={plural(n, 'fight')} style={{ position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, background: Theme.accent, opacity: 0.35 + 0.65 * n / peak }} />}
            </span>;
          })}
        </div>
        {/* ── exact from / to ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ ...text, color: Theme.dim }}>From</span>
          <TimeField value={hhmm(fromMs)} commit={v => { const t = withTime(fromMs, v); if (t !== null) picked(t, toMs, ''); }} />
          <span style={{ ...text, color: Theme.dim }}>to</span>
          <TimeField value={hhmm(toMs)} commit={v => { const t = withTime(toMs || fromMs, v); if (t !== null) picked(fromMs, t, ''); }} />
          <span style={{ ...text, color: Theme.faint, marginLeft: 'auto' }}>{plural(fightsBetween(fromMs, toMs), 'fight')}</span>
        </div>
      </div>
    </div>
  </>;
}

function TimeField({ value, commit }: { value: string; commit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <input value={draft ?? value} onChange={e => setDraft(e.target.value)} onBlur={() => { if (draft !== null) commit(draft); setDraft(null); }}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    style={{ ...text, width: 56, height: 24, textAlign: 'center', borderRadius: 12, background: 'rgba(255,255,255,0.07)', border: '1px solid ' + Theme.panelEdge, color: Theme.text, outline: 'none' }} />;
}
