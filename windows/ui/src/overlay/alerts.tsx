// Notifications over the game: hidden cube alerts (CubeAlert.qml) and the
// hourly event reminders (EventAlert.qml).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { send } from '../bridge';
import type { Settings } from '../settings';
import { AppTheme, alpha, Theme } from '../theme';
import { Panel, T, useOverlay, Widget } from './frame';
import { CloseX } from './widgets';

export interface CubeAlertItem {
  key: number; title: string; note?: string; until: number;
  // A cube in range: its id, distance, when that was, your keys.
  cube?: number; distance?: number | null; at?: number; keys?: number | null;
}

/** A cube in range's line: its distance and how old that is, your keys. */
export function nearNote(a: CubeAlertItem, now: number) {
  const age = Math.round((now - (a.at ?? now)) / 1000);
  return (a.distance != null ? 'About ' + a.distance + ' m away' + (age >= 5 ? '  (' + age + ' s ago)' : '') : 'Within about 100 m')
    + (a.keys != null ? '  ·  ' + a.keys + (a.keys === 1 ? ' key' : ' keys') : '');
}

/**
 * A message from the daemon ({ event, id, by, mine, distance, keys }), or a test
 * one (id -1), onto the alerts shown: the newest first, three at most. Returns
 * the new list and whether to chime.
 */
export function pushCube(shown: CubeAlertItem[], e: any, settings: Settings, now: number, nextKey: () => number): [CubeAlertItem[], boolean] {
  if (!settings.notifyCubes) return [shown, false];
  // A cube in range's banner: a new distance, or it's gone.
  if (e.event === 'distance') return [shown.map(a => (a.cube === e.id ? { ...a, distance: e.distance, at: now } : a)), false];
  if (e.event === 'left' || e.event === 'opened') shown = shown.filter(a => a.cube !== e.id);
  if (e.event === 'left') return [shown, false];
  // No key, no use: unless the meter doesn't know your keys yet.
  if (e.event === 'near' && settings.cubesNeedKey && e.keys === 0) return [shown, false];
  const live = shown.filter(a => a.until > now);
  if (e.event === 'near') {
    const item = { key: nextKey(), cube: e.id, title: 'Hidden cube nearby', distance: e.distance, at: now, keys: e.keys, until: now + (e.id < 0 ? 10000 : 120000) };
    return [[item, ...live].slice(0, 3), settings.cubeSound];
  }
  if (e.mine) return [shown, false]; // You know: you're the one opening it.
  // No name: it may be you, if the game hasn't said who you are yet.
  const item = e.event === 'opening'
    ? { key: nextKey(), title: e.by ? e.by + ' is opening a hidden cube' : 'A hidden cube is being opened', note: 'Nearby', until: now + 7000 }
    : { key: nextKey(), title: 'Hidden cube opened', note: e.by ? 'By ' + e.by : '', until: now + 7000 };
  return [[item, ...live].slice(0, 3), false];
}

/** Hidden cube alerts at the top centre: up to three, the newest on top. */
export function CubeAlert({ test }: { test: { event: any; seq: number } | null }) {
  const { s, settings, screen, hud, now } = useOverlay();
  const width = 380;
  const [shown, setShown] = useState<CubeAlertItem[]>([]);
  const count = useRef(0);
  const lastSeq = useRef<number | null>(null);
  const take = (e: any) => setShown(cur => {
    const [next, chime] = pushCube(cur, e, settings, Date.now(), () => ++count.current);
    if (chime) send({ action: 'chime' });
    return next;
  });
  // The daemon's messages since the last look; those from before the overlay started are old news.
  useEffect(() => {
    const events = s.cubeEvents ?? [];
    if (lastSeq.current === null) { lastSeq.current = events.length ? events[events.length - 1].seq : 0; return; }
    for (const e of events) if (e.seq > lastSeq.current) take(e);
    if (events.length) lastSeq.current = Math.max(lastSeq.current, events[events.length - 1].seq);
  }, [s.cubeEvents]);
  useEffect(() => { if (test) take(test.event); }, [test?.seq]);
  const live = shown.filter(a => a.until > now);
  useEffect(() => { if (live.length !== shown.length) setShown(live); }, [now]);
  const active = live.length > 0;
  return <Widget id="cubeAlert" title="Hidden cube alerts" group="alert" wanted={active} interactive={active}
    defaultPos={() => ({ x: Math.round(screen.w / 2 - width / 2), y: Math.round(150 * hud) })}>
    <div style={{ width, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Something to place in Customize while there's no alert. */}
      {!active && <Panel width={width}><T size={Theme.fontSmall} color={Theme.dim}>Hidden cube alerts show here</T></Panel>}
      {live.map(a => <Panel key={a.key} width={width} style={{ borderColor: alpha(AppTheme.cube, 0.6) }}>
        <div style={{ display: 'flex', gap: Theme.pad, alignItems: 'center' }}>
          {/* The cube: a diamond in the map's cube colour. */}
          <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <span style={{ width: 17, height: 17, background: AppTheme.cube, transform: 'rotate(45deg)' }} />
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <T size={Theme.fontLarge} bold style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</T>
            {(a.cube != null || a.note) && <T size={Theme.fontSmall} color={Theme.dim}>{a.cube != null ? nearNote(a, now) : a.note}</T>}
          </div>
          <CloseX onClick={() => setShown(cur => cur.filter(x => x.key !== a.key))} />
        </div>
      </Panel>)}
    </div>
  </Widget>;
}

// The server clock is UTC+9, a whole number of hours from UTC: its :00 and :30 are UTC's.
export const events = [
  { id: 'shugo', setting: 'notifyShugo' as const, minute: 0, name: 'Shugo Festival', note: 'Minigames: entry is only open for a few minutes', color: '#F2C15A' },
  { id: 'invasion', setting: 'notifyInvasion' as const, minute: 30, name: 'Dimensional Invasion', note: 'Beritra Air Raid, Accursed Sword or Incursion of the Spirits', color: '#B48CF2' },
];
export interface Reminder { key: string; id: string; name: string; note: string; color: string; start: number }

/**
 * The reminders due at `now`, while the game is open: each event that's on and
 * starts within the lead time, or started less than a minute ago; and a sample
 * from the Notifications page. Soonest first.
 */
export function upcoming(now: number, settings: Settings, gameRunning: boolean, sample: { id: string; start: number } | null): Reminder[] {
  const hour = 3600000;
  const list: Reminder[] = [];
  for (const ev of events) {
    if (!settings[ev.setting]) continue;
    if (!gameRunning && !(sample && sample.id === ev.id)) continue;
    let start = Math.floor((now - ev.minute * 60000) / hour) * hour + ev.minute * 60000;
    if (now - start >= 60000) start += hour;
    if (gameRunning && start - now <= settings.eventLead * 60000) list.push({ ...ev, key: ev.id + start, start });
    if (sample && sample.id === ev.id && now < sample.start + 3000) list.push({ ...ev, key: 'sample', start: sample.start });
  }
  return list.sort((a, b) => a.start - b.start);
}

export function countdown(a: Reminder, now: number) {
  const s = Math.ceil((a.start - now) / 1000);
  return s <= 0 ? 'Starting now' : 'Starts in ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** Hourly event reminders below the cube alerts, with a countdown. */
export function EventAlert({ test }: { test: { id: string; seq: number } | null }) {
  const { s, settings, screen, hud, now } = useOverlay();
  const width = 380;
  const [sample, setSample] = useState<{ id: string; start: number } | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const chimed = useRef<string[]>([]);
  const gameRunning = !!s.state?.capture?.gameRunning;
  useEffect(() => {
    if (!test) return;
    setSample({ id: test.id, start: Date.now() + 10000 });
    setDismissed(d => d.filter(k => k !== 'sample'));
  }, [test?.seq]);
  const shown = upcoming(now, settings, gameRunning, sample).filter(a => !dismissed.includes(a.key));
  const keys = shown.map(a => a.key).join(',');
  useEffect(() => {
    const ks = shown.map(a => a.key);
    if (settings.eventSound && ks.some(k => !chimed.current.includes(k))) send({ action: 'chime' });
    chimed.current = ks;
  }, [keys]);
  const active = shown.length > 0;
  return <Widget id="eventAlert" title="Event reminders" group="alert" wanted={active} interactive={active}
    defaultPos={() => ({ x: Math.round(screen.w / 2 - width / 2), y: Math.round(400 * hud) })}>
    <div style={{ width, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {!active && <Panel width={width}><T size={Theme.fontSmall} color={Theme.dim}>Event reminders show here</T></Panel>}
      {shown.map(a => <Panel key={a.key} width={width} style={{ borderColor: alpha(a.color, 0.6) }}>
        <div style={{ display: 'flex', gap: Theme.pad, alignItems: 'center' }}>
          <span style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <span style={{ width: 17, height: 17, borderRadius: '50%', background: a.color }} />
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <T size={Theme.fontLarge} bold style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name + '  ·  ' + countdown(a, now)}</T>
            <T size={Theme.fontSmall} color={Theme.dim} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.note}</T>
          </div>
          <CloseX onClick={() => setDismissed(d => [...d, a.key])} />
        </div>
      </Panel>)}
    </div>
  </Widget>;
}
