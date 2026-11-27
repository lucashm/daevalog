// Deaths along a fight's minutes: a lane per player with a dot per death (one
// run), or bars per slice of the fight (many runs; the DPS chart uses them
// too). As DeathTimeline.qml and BarLabel.qml.
import { useLayoutEffect, useRef, useState } from 'react';
import { duration, jobColor, Theme } from '../theme';

export interface Lane { label: string; jobKey?: string; bold: boolean; ms: number[] }

/** The shortest step between minute marks that leaves room for each "10:00" label. */
export const stepFor = (trackW: number, spanMs: number) =>
  [1, 2, 5, 10, 15, 30, 60].map(m => m * 60000).find(ms => trackW * ms / Math.max(1, spanMs) >= 48) ?? 3600000;

export function DeathTimeline({ title, spanMs, lanes = [], bins = [], binMs = 30000, runs = 1, barColor = Theme.bad, fmt = (v: number) => String(v), describe }: {
  title: string; spanMs: number; lanes?: Lane[]; bins?: number[]; binMs?: number; runs?: number; barColor?: string;
  fmt?: (v: number) => string; describe?: (v: number) => string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState('');
  useLayoutEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const labelW = lanes.length ? 80 : 0;
  const trackW = Math.max(1, width - labelW);
  const step = stepFor(trackW, spanMs);
  const peak = Math.max(1, ...bins);
  const xOf = (ms: number) => labelW + trackW * Math.min(1, ms / Math.max(1, spanMs));
  const tell = describe ?? ((v: number) => v + (v === 1 ? ' death' : ' deaths') + ' in ' + runs + (runs === 1 ? ' run' : ' runs'));
  const chartH = 72;
  const small = { fontSize: Theme.fontSmall, fontVariantNumeric: 'tabular-nums' } as const;
  return <div ref={box} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <span style={{ ...small, color: hover ? Theme.text : Theme.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hover || title}</span>
    {/* ── one run: who died when ── */}
    {lanes.map(l => <div key={l.label} style={{ position: 'relative', height: 16 }}>
      <span style={{ ...small, position: 'absolute', top: 1, width: labelW - 6, color: jobColor(l.jobKey), fontWeight: l.bold ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label}</span>
      <span style={{ position: 'absolute', left: labelW, width: trackW, top: 8, height: 1, background: 'rgba(255,255,255,0.15)' }} />
      {l.ms.map((ms, i) => <span key={i} onMouseEnter={() => setHover(l.label + ' died at ' + duration(ms))} onMouseLeave={() => setHover('')}
        className="death-dot" style={{ position: 'absolute', left: xOf(ms) - 4.5, top: 3.5, width: 9, height: 9, borderRadius: '50%' }} />)}
    </div>)}
    {/* ── many runs: when it clusters ── */}
    {bins.length > 0 && <div style={{ position: 'relative', height: chartH }}>
      {bins.map((v, i) => {
        const x = xOf(i * binMs), w = Math.max(1, xOf((i + 1) * binMs) - x - 1);
        const h = v ? Math.max(2, (chartH - Theme.fontSmall - 3) * v / peak) : 0;
        const label = v ? fmt(v) : '';
        // Across the top of a bar wide enough for it; a narrow bar's value is in the hover line.
        const flat = w >= label.length * 6.5 + 4;
        return <div key={i} onMouseEnter={() => setHover(duration(i * binMs) + '–' + duration((i + 1) * binMs) + '  ·  ' + tell(v))} onMouseLeave={() => setHover('')}
          style={{ position: 'absolute', left: x, width: w, top: 0, bottom: 0 }} className="bin">
          <span className="bin-bar" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: h, borderRadius: Math.min(2, w / 2), background: barColor, opacity: 0.4 + 0.5 * v / peak }} />
          {label && flat && <span style={{ ...small, position: 'absolute', left: '50%', bottom: h + 1, color: Theme.dim, whiteSpace: 'nowrap', transform: 'translateX(-50%)' }}>{label}</span>}
        </div>;
      })}
    </div>}
    {/* ── minutes ── */}
    <div style={{ position: 'relative', height: Theme.fontSmall + 6 }}>
      <span style={{ position: 'absolute', left: labelW, width: trackW, height: 1, background: 'rgba(255,255,255,0.25)' }} />
      {Array.from({ length: Math.floor(spanMs / step) + 1 }, (_, i) => <span key={i} style={{ position: 'absolute', left: xOf(i * step) }}>
        <span style={{ position: 'absolute', width: 1, height: 4, background: 'rgba(255,255,255,0.25)' }} />
        <span style={{ ...small, position: 'absolute', top: 5, color: Theme.faint, transform: i === 0 ? 'none' : 'translateX(-50%)', whiteSpace: 'nowrap' }}>{duration(i * step)}</span>
      </span>)}
    </div>
  </div>;
}
