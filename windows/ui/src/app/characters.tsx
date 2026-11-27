// Your characters, each as the game last stated it: class, level, combat power
// and Odyle energy (CharactersPage.qml).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { useSnapshot } from '../bridge';
import { AppTheme, classIcon, jobColor } from '../theme';
import { Label } from './ui';

// Odyle energy's basic cap; charged energy (from items) goes over it.
export const odyleCap = 840;
// Basic energy recharges 15 every 3 h, on the clock (840 = a week's worth); charged doesn't.
const tick = 3 * 3600e3, phase = 3600e3;
const ticks = (from: number, to: number) => Math.max(0, Math.floor((to - phase) / tick) - Math.floor((from - phase) / tick));
/** Basic energy now: as read while playing, else what was read plus the recharges since. */
export function odyleNow(c: any, live: boolean, now: number) {
  if (!c.odyle) return 0;
  const b = c.odyle.basic;
  return live || b >= odyleCap ? b : Math.min(odyleCap, b + 15 * ticks(c.lastSeen, now));
}
/** When basic energy reaches the cap (ms); 0 if it has. */
export function odyleFull(basic: number, now: number) {
  if (basic >= odyleCap) return 0;
  return (Math.floor((now - phase) / tick) + Math.ceil((odyleCap - basic) / 15)) * tick + phase;
}
export const played = (c: any) => Math.max(c.lastSeen || 0, c.lastPlayed || 0);
export function ago(ms: number, now: number) {
  const m = Math.max(0, Math.round((now - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}
/** By server, the server played last first; in each, the one playing, then the one played last. */
export function groups(info: { playing: string | null; list: any[] } | null) {
  const playing = info?.playing ?? '';
  const list = [...(info?.list ?? [])].sort((a, b) => Number(b.name === playing) - Number(a.name === playing) || played(b) - played(a));
  const out: { server: string; list: any[] }[] = [];
  for (const c of list) {
    const server = c.server || (c.serverId ? 'Server ' + c.serverId : 'Unknown server');
    let g = out.find(g => g.server === server);
    if (!g) out.push(g = { server, list: [] });
    g.list.push(c);
  }
  return out;
}

const when = (ms: number, o: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleString(undefined, { ...o, hour12: false });

export default function Characters() {
  const s = useSnapshot();
  const [now, setNow] = useState(Date.now());
  // Re-reads "Played 3 h ago" each minute.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const info = s.characters;
  const playing = info?.playing ?? '';
  const all = groups(info);
  return <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label size={AppTheme.title} bold>Characters</Label>
      <Label color={AppTheme.dim}>Your characters, as the game last said. Combat power and gear score update at character select.</Label>
    </div>
    {!all.length && <Label color={AppTheme.faint}>No characters yet: log in to one with the meter running.</Label>}
    {all.map(g => <div key={g.server} style={{ background: AppTheme.card, border: '1px solid ' + AppTheme.cardEdge, borderRadius: AppTheme.radius, padding: AppTheme.pad, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex' }}>
        <Label bold>{g.server}</Label>
        <Label size={AppTheme.small} color={AppTheme.dim} style={{ marginLeft: 'auto' }}>{g.list.length + (g.list.length === 1 ? ' character' : ' characters')}</Label>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {g.list.map(c => {
          const live = c.name === playing;
          const basic = odyleNow(c, live, now);
          const estimated = !!c.odyle && basic !== c.odyle.basic;
          return <div key={c.name} style={{ width: 340, background: AppTheme.row, border: '1px solid ' + (live ? AppTheme.good : AppTheme.cardEdge), borderRadius: AppTheme.radius, padding: AppTheme.pad, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ── name, class and level, status ── */}
            <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
              {c.jobKey && classIcon(c.jobKey) && <img src={classIcon(c.jobKey)} alt="" style={{ width: 32, height: 32 }} />}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Label size={AppTheme.large} bold color={c.jobKey ? jobColor(c.jobKey) : AppTheme.text}>{c.name}</Label>
                <Label size={AppTheme.small} color={AppTheme.dim}>{[c.job, c.level ? 'level ' + c.level : ''].filter(Boolean).join(' · ') || 'Class not seen yet'}</Label>
              </div>
              <Label size={AppTheme.small} color={live ? AppTheme.good : AppTheme.dim} style={{ marginLeft: 'auto', alignSelf: 'flex-start' }}>
                {live ? '● Playing now' : played(c) > 0 ? 'Played ' + ago(played(c), now) : ''}
              </Label>
            </div>
            {/* ── combat power, gear score ── */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Label size={AppTheme.small} color={AppTheme.faint}>Combat power</Label>
              <Label bold>{c.combatPower > 0 ? c.combatPower.toLocaleString('en-US') : '—'}</Label>
              <Label size={AppTheme.small} color={AppTheme.faint} style={{ paddingLeft: 8 }}>Gear score</Label>
              <Label bold>{c.gearScore > 0 ? c.gearScore.toLocaleString('en-US') : '—'}</Label>
            </div>
            {/* ── Odyle energy ── */}
            <div style={{ height: 62, position: 'relative', borderRadius: 6, background: AppTheme.card, border: '1px solid ' + AppTheme.cardEdge }}>
              <Label size={AppTheme.small} color={AppTheme.faint} style={{ position: 'absolute', left: 12, top: 9 }}>
                {'Odyle energy' + (!c.odyle ? '' : basic >= odyleCap ? ' · full' : ' · full ' + when(odyleFull(basic, now), { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}
              </Label>
              {c.odyle ? <span style={{ position: 'absolute', right: 12, top: 7, display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <Label size={AppTheme.large} bold>{(estimated ? '~' : '') + basic}</Label>
                {c.odyle.charged > 0 && <Label bold color={AppTheme.accent}>(+{c.odyle.charged})</Label>}
                <Label size={AppTheme.small} color={AppTheme.faint}>/{odyleCap}</Label>
              </span> : <Label size={AppTheme.small} color={AppTheme.faint} style={{ position: 'absolute', right: 12, top: 9 }}>not seen yet</Label>}
              <span style={{ position: 'absolute', left: 12, right: 12, top: 40, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, background: AppTheme.accent, width: (c.odyle ? Math.min(1, basic / odyleCap) * 100 : 0) + '%' }} />
              </span>
            </div>
            {/* Always there, so every card is as tall. */}
            <Label size={AppTheme.small} color={AppTheme.faint} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {live ? 'Live from the game' : c.lastSeen <= 0 ? 'Odyle is read once you play it'
                : 'Read ' + when(c.lastSeen, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (estimated ? ' · ~ Odyle estimated' : '')}
            </Label>
          </div>;
        })}
      </div>
    </div>)}
  </>;
}
