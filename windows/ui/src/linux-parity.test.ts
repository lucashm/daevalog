// The Windows UI is a port of the Linux overlay (overlay/*.qml): these check
// the ported logic behaves as the QML does.
import { describe, expect, it } from 'vitest';
import { countdown, events, nearNote, pushCube, upcoming } from './overlay/alerts';
import { comboOf, prettyCombo } from './overlay/editor';
import { alignLines, placeAxis, snapToGrid } from './overlay/frame';
import { critRate, playerSkills } from './overlay/history';
import { areaOf, petsModel } from './app/pets';
import { deathView, dpsView, rowsOf, runsOf } from './app/analytics';
import { rangeLabel } from './app/range';
import { groups, odyleFull, odyleNow } from './app/characters';
import { centre, readMaps, worldPx } from './mapData';
import { defaults, readSettings, resetLayout, saveLayout, loadLayout, setShortcut, setWidgetPos, setWidgetVisible, widgetPos, widgetVisible } from './settings';
import { compact, duration, percent } from './theme';

const settings = readSettings({});

describe('Theme.qml formatting', () => {
  it('compacts like Theme.compact', () => {
    expect(compact(999)).toBe('999');
    expect(compact(1234)).toBe('1.23K');
    expect(compact(12345)).toBe('12.3K');
    expect(compact(12345678)).toBe('12.3M');
    expect(compact(1.5e9)).toBe('1.50B');
    expect(compact('x')).toBe('0');
  });
  it('formats durations and percents', () => {
    expect(duration(83500)).toBe('1:23');
    expect(duration(3723000)).toBe('1:02:03');
    expect(duration(-5)).toBe('0:00');
    expect(percent(0.4567)).toBe('45.7%');
    expect(percent(0.4567, 0)).toBe('46%');
  });
});

describe('Settings.qml', () => {
  it('reads a file over the defaults and drops wrong types', () => {
    const s = readSettings({ scale: 1.2, meterMetric: 'dps', maxRows: 8, widgets: 'nope', unknown: 1 });
    expect(s.scale).toBe(1.2);
    expect(s.meterMetric).toBe('dps');
    // Raids are 10; old configs saved 8.
    expect(s.maxRows).toBe(10);
    expect(s.widgets).toEqual({});
    expect(s.shortcutEdit).toBe(defaults.shortcutEdit);
  });
  it('places, hides and lays out widgets', () => {
    let s = { ...settings, ...setWidgetPos(settings, 'meter', 10, 20) };
    expect(widgetPos(s, 'meter')).toEqual({ x: 10, y: 20 });
    s = { ...s, ...setWidgetVisible(s, 'boss', false) };
    expect(widgetVisible(s, 'boss')).toBe(false);
    expect(widgetVisible(s, 'skills')).toBe(true);
    s = { ...s, ...saveLayout(s, 1) };
    expect(s.layouts).toEqual([null, s.widgets, null]);
    // Reset keeps hidden widgets hidden, moves the rest home.
    s = { ...s, ...resetLayout(s) };
    expect(s.widgets).toEqual({ boss: { visible: false } });
    s = { ...s, ...loadLayout(s, 1) };
    expect(widgetPos(s, 'meter')).toEqual({ x: 10, y: 20 });
  });
  it('gives a combo to one shortcut only', () => {
    const s = { ...settings, ...setShortcut(settings, 'hide', 'CTRL + grave') };
    expect(s.shortcutHide).toBe('CTRL + grave');
    expect(s.shortcutEdit).toBe('');
  });
});

describe('EditorLayer.qml placement', () => {
  const others = [{ x: 100, y: 100, w: 200, h: 50 }];
  const grid = (v: number) => Math.round(v / 32) * 32;
  it('snaps an edge onto another widget\'s within 8 px, else to the grid', () => {
    const lines = alignLines(others, 2000, true);
    expect(lines).toEqual([0, 1000, 2000, 100, 200, 300]);
    // The left edge at 105 → 100, touching 100.
    expect(placeAxis(105, 50, lines, grid)).toEqual([100, [100]]);
    // Nothing near: the grid.
    expect(placeAxis(520, 50, lines, grid)[0]).toBe(512);
  });
  it('places freely with Shift, or without the grid', () => {
    expect(snapToGrid(settings, 50, 70, true)).toEqual({ x: 50, y: 70 });
    expect(snapToGrid(settings, 50, 70, false)).toEqual({ x: 64, y: 64 });
    expect(snapToGrid({ ...settings, snapToGrid: false }, 50, 70, false)).toEqual({ x: 50, y: 70 });
  });
  it('records shortcuts as the Linux combos', () => {
    const key = (code: string, mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {}) =>
      comboOf({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
    expect(key('Backquote', { ctrlKey: true })).toBe('CTRL + grave');
    expect(key('KeyZ', { altKey: true, shiftKey: true })).toBe('ALT + SHIFT + Z');
    expect(key('F9')).toBe('F9');
    // A letter needs Ctrl, Alt or Super; a lone modifier isn't a combo.
    expect(key('KeyZ', { shiftKey: true })).toBe('');
    expect(key('ControlLeft', { ctrlKey: true })).toBe('');
    expect(prettyCombo('CTRL + grave')).toBe('Ctrl + `');
    expect(prettyCombo('ALT + SHIFT + F9')).toBe('Alt + Shift + F9');
  });
});

describe('CubeAlert.qml', () => {
  let k = 0;
  const next = () => ++k;
  it('shows a cube in range with its distance, and drops it when opened or gone', () => {
    const [shown, chime] = pushCube([], { event: 'near', id: 7, distance: 64, keys: 41 }, settings, 1000, next);
    expect(chime).toBe(true);
    expect(nearNote(shown[0], 1000)).toBe('About 64 m away  ·  41 keys');
    const [moved] = pushCube(shown, { event: 'distance', id: 7, distance: 20 }, settings, 2000, next);
    expect(nearNote(moved[0], 8000)).toBe('About 20 m away  (6 s ago)  ·  41 keys');
    const [opened] = pushCube(moved, { event: 'opened', id: 7, by: 'Faffy' }, settings, 3000, next);
    expect(opened.map(a => a.title)).toEqual(['Hidden cube opened']);
    expect(opened[0].note).toBe('By Faffy');
    expect(pushCube(moved, { event: 'left', id: 7 }, settings, 3000, next)[0]).toEqual([]);
  });
  it('stays quiet without a key, for your own opening, or when turned off', () => {
    expect(pushCube([], { event: 'near', id: 1, keys: 0 }, settings, 0, next)[0]).toEqual([]);
    expect(pushCube([], { event: 'near', id: 1, keys: null }, settings, 0, next)[0]).toHaveLength(1);
    expect(pushCube([], { event: 'opening', id: 1, mine: true }, settings, 0, next)[0]).toEqual([]);
    expect(pushCube([], { event: 'near', id: 1 }, { ...settings, notifyCubes: false }, 0, next)[0]).toEqual([]);
  });
  it('keeps three at most, the newest first', () => {
    let shown = [] as ReturnType<typeof pushCube>[0];
    for (const id of [1, 2, 3, 4]) shown = pushCube(shown, { event: 'opening', id, by: 'P' + id }, settings, 0, next)[0];
    expect(shown.map(a => a.title)).toEqual(['P4 is opening a hidden cube', 'P3 is opening a hidden cube', 'P2 is opening a hidden cube']);
  });
});

describe('EventAlert.qml', () => {
  const hour = 3600000;
  it('reminds within the lead time and a minute past the start, while the game runs', () => {
    const at = 10 * hour + 57 * 60000; // 3 minutes before the Shugo Festival
    const due = upcoming(at, settings, true, null);
    expect(due.map(a => a.id)).toEqual(['shugo']);
    expect(countdown(due[0], at)).toBe('Starts in 3:00');
    expect(upcoming(11 * hour + 30000, settings, true, null).map(a => a.id)).toEqual(['shugo']);
    expect(countdown(upcoming(11 * hour + 30000, settings, true, null)[0], 11 * hour + 30000)).toBe('Starting now');
    expect(upcoming(11 * hour + 61000, settings, true, null)).toEqual([]);
    expect(upcoming(at, settings, false, null)).toEqual([]);
    expect(upcoming(at, { ...settings, notifyShugo: false }, true, null)).toEqual([]);
  });
  it('shows a test even with the game closed', () => {
    const due = upcoming(1000, settings, false, { id: 'invasion', start: 11000 });
    expect(due.map(a => [a.key, a.name])).toEqual([['sample', events[1].name]]);
  });
});

describe('HistoryPanel.qml', () => {
  const fight = { summary: { durationMs: 10000 }, skills: [
    { actorId: 1, code: 5, name: 'Slash', damage: 600, hits: 4, crit: 2, back: 1 },
    { actorId: 1, code: 5, name: 'Slash', damage: 200, hits: 2, crit: 0, back: 1 },
    { actorId: 1, code: 9, name: 'Bleed', damage: 200, hits: 5, crit: 5, back: 0, isDot: true },
    { actorId: 2, code: 5, name: 'Slash', damage: 999, hits: 1, crit: 1, back: 0 },
  ] };
  it('totals a player\'s skills like the live widget', () => {
    const rows = playerSkills(fight, 1);
    expect(rows.map(r => [r.name, r.damage, r.hits])).toEqual([['Slash', 800, 6], ['Bleed', 200, 5]]);
    expect(rows[0]).toMatchObject({ share: 0.8, dps: 80, critRate: 2 / 6, backRate: 2 / 6 });
    expect(rows[1]).toMatchObject({ critRate: 0, backRate: 0 });
    expect(critRate(fight, 1)).toBe(2 / 6);
  });
});

describe('PetsPage.qml', () => {
  const all = {
    '1': { name: 'Aaa', genus: 'cogni', unreleased: false, chests: [], drops: [{ npc: 'Krall', region: 'Verteron', level: 21, spawns: 27 }] },
    '2': { name: 'Bbb', genus: 'fera', unreleased: false, chests: [], drops: [{ npc: 'Mau', region: 'Altgard', level: 10, spawns: 5 }] },
    '3': { name: 'Ccc', genus: 'special', unreleased: false, chests: [], drops: [] },
  };
  const o = { phase: '3', genus: ['cogni', 'fera', 'natura', 'varian', 'special'], farmIn: ['elyos', 'asmodian', 'abyss'], search: '', sort: 'closest' };
  it('sorts pets into needed, done and not farmed for the phase', () => {
    const m = petsModel(all, { '1': 3, '2': 1 }, { '2': 7 }, [2], o);
    expect(m.farmable).toBe(2);
    expect(m.needed.map(p => p.name)).toEqual(['Bbb']);
    expect(m.done.map(p => p.name)).toEqual(['Aaa']);
    expect(m.notFarmed.map(p => p.name)).toEqual(['Ccc']);
    // Level 1 with 7 souls: 25 + 75 - 7 to level 3.
    expect(m.soulsNeeded).toBe(93);
    expect(m.needed[0].estimated).toBe(true);
    expect(m.collected).toBe(2);
    expect(m.nextReward).toEqual({ at: 5, reward: '100 soul crystals' });
  });
  it('farms only where asked, and finds by monster', () => {
    expect(petsModel(all, {}, {}, [], { ...o, farmIn: ['elyos'] }).needed.map(p => p.name)).toEqual(['Aaa']);
    expect(petsModel(all, {}, {}, [], { ...o, search: 'mau' }).needed.map(p => p.name)).toEqual(['Bbb']);
    expect(areaOf('Chaotic Lower Reshanta')).toBe('abyss');
    expect(areaOf('Poeta')).toBe('elyos');
  });
});

describe('AnalyticsPage.qml', () => {
  const history = [
    { id: 'b', bossName: 'Vakron', startTimeMs: 2000, durationMs: 60000, killed: false, totalDamage: 1200,
      players: [{ name: 'Me', job: 'Gladiator', jobKey: 'GLADIATOR', dps: 200, damage: 1200, deathMs: [], damageBins: [600, 600] }] },
    { id: 'a', bossName: 'Vakron', startTimeMs: 1000, durationMs: 60000, killed: true, totalDamage: 2400,
      players: [{ name: 'Me', job: 'Gladiator', jobKey: 'GLADIATOR', dps: 100, damage: 600, deaths: 1, deathMs: [40000], damageBins: [300, 300] },
        { name: 'Pal', job: 'Cleric', jobKey: 'CLERIC', dps: 300, damage: 1800 }, { name: '#77', dps: 1, damage: 1 }] },
  ];
  const runs = runsOf(history, ['Me']);
  it('makes one run per named player per fight, oldest first', () => {
    expect(runs.map(r => [r.fightId, r.player])).toEqual([['a', 'Me'], ['a', 'Pal'], ['b', 'Me']]);
    expect(runs[0]).toMatchObject({ isMe: true, share: 0.25 });
  });
  it('groups and sorts, a run adding its party up', () => {
    expect(rowsOf(runs, 'player', 'avgDps', true).map(r => [r.label, r.count, r.avgDps])).toEqual([['Pal', 1, 300], ['Me', 2, 150]]);
    const boss = rowsOf(runs, 'boss', 'start', true)[0];
    expect(boss).toMatchObject({ label: 'Vakron', count: 3, killRate: 2 / 3 });
    expect(rowsOf(runs, 'run', 'start', false)[0]).toMatchObject({ key: 'a', avgDps: 400, count: 2 });
  });
  it('charts DPS over the fight and when deaths happen', () => {
    const me = rowsOf(runs.filter(r => r.isMe), 'boss', 'start', true)[0];
    expect(dpsView(me, 'boss', true)).toMatchObject({ bins: [15, 15], runs: 2, title: 'Your DPS over the fight  ·  average of 2 runs' });
    expect(deathView(me, 'boss', history)).toMatchObject({ bins: [0, 1], title: 'When deaths happen  ·  1 in 2 runs' });
    const run = rowsOf(runs, 'run', 'start', false)[0];
    expect(deathView(run, 'run', history)).toMatchObject({ lanes: [{ label: 'Me', bold: true, ms: [40000] }], title: 'Deaths in this run' });
  });
  it('words the date range as the Linux picker does', () => {
    expect(rangeLabel(0, 0, '')).toBe('All time');
    expect(rangeLabel(5, 0, 'Last 7 days')).toBe('Last 7 days');
    const day = new Date(2026, 10, 3).getTime();
    expect(rangeLabel(day, 0, '')).toMatch(/^Since /);
  });
});

describe('CharactersPage.qml', () => {
  const h = 3600e3;
  it('recharges basic Odyle 15 every 3 hours on the clock, up to the cap', () => {
    const c = { odyle: { basic: 800, charged: 5 }, lastSeen: 2 * h };
    expect(odyleNow(c, false, 2 * h + 1)).toBe(800);
    expect(odyleNow(c, false, 4 * h)).toBe(815);
    expect(odyleNow(c, true, 40 * h)).toBe(800);
    expect(odyleNow(c, false, 400 * h)).toBe(840);
    expect(odyleFull(800, 2 * h)).toBe(10 * h);
    expect(odyleFull(840, 2 * h)).toBe(0);
  });
  it('groups by server, the one playing first', () => {
    const g = groups({ playing: 'B', list: [{ name: 'A', server: 'Siel', lastSeen: 9 }, { name: 'B', server: 'Siel', lastSeen: 1 }, { name: 'C', serverId: 2402, lastPlayed: 5 }] });
    expect(g.map(x => [x.server, x.list.map(c => c.name)])).toEqual([['Siel', ['B', 'A']], ['Server 2402', ['C']]]);
  });
});

describe('MapData.qml', () => {
  it('reads spawns, portraits and cubes from Arkive\'s files', () => {
    const files = [{
      map: 'World_D_A',
      markers: [{ id: 'm1', category: 'creature', x: 10, y: 20, count: 3, icon: 'UI/x.webp' }, { subtype: 'hiddenCube', x: 5, y: 6, indexInSubtype: 0 }],
      names: { m1: { name: 'Bbb' } }, regions: null, regionNames: null,
    }];
    const r = readMaps(files);
    expect(r.spawns.Bbb).toEqual([{ map: 'World_D_A', x: 10, y: 20, count: 3 }]);
    expect(r.portraits.Bbb).toBe('https://resource-aion2.tc-imba.com/UI/x.webp');
    expect(r.cubes).toEqual([{ map: 'World_D_A', x: 5, y: 6, n: 1 }]);
  });
  it('centres a zone and converts world units', () => {
    expect(centre([[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]])).toEqual({ x: 1, y: 1 });
    expect(worldPx(0)).toBe(4096);
  });
});
