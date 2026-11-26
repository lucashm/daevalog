import { describe, expect, it } from 'vitest';
import { analyticsRows, analyticsRuns, characterGroups, collectionRows, deathBins, deathLanes, dpsView, filterRuns, kinaView,
  myNames, nextEvent, odyleFull, odyleNow, partyDpsBins, playerShares, savedSkills, tickStep,
  type Character, type Fight, type Player } from './model';

const fight = (id: string, start: number, boss: string, players: Partial<Player>[], durationMs = 60000, killed = true): Fight => ({
  id, bossName: boss, startTimeMs: start, durationMs, killed, totalDamage: 0,
  players: players.map((p, i) => ({ id: i, name: 'P' + i, job: 'Cleric', jobKey: 'CLERIC', dps: 0, damage: 0, critRate: 0, ...p })),
});
const character = (c: Partial<Character>): Character => ({ name: 'A', serverId: 0, server: '', job: '', jobKey: '', level: null,
  combatPower: 0, gearScore: 0, odyle: null, lastSeen: 0, lastPlayed: 0, ...c });

describe('features ported from the Linux app', () => {
  it('reads the kina rate without timing the gain that opened the session', () => {
    const k = { balance: 1300, daily: 990000, gained: 300, first: 100, startMs: 0, lastMs: 10000 };
    const v = kinaView(k, 10000);
    expect(v).toMatchObject({ recent: true, perSecond: 20, perHour: 72000, left: 10000 });
    expect(v.capInMs).toBe(500000);
    expect(kinaView(k, 10000 + 5 * 60000).recent).toBe(false);
    expect(kinaView({ ...k, daily: 1000000 }, 10000).capInMs).toBeNull();
  });
  it('recharges Odyle on the 3-hour clock up to the cap, and not while playing', () => {
    const h = 3600e3, c = character({ odyle: { basic: 800, charged: 5 }, lastSeen: 2 * h });
    expect(odyleNow(c, false, 2 * h + 1)).toBe(800);
    expect(odyleNow(c, false, 4 * h)).toBe(815);
    expect(odyleNow(c, true, 40 * h)).toBe(800);
    expect(odyleNow(c, false, 400 * h)).toBe(840);
    // 40 short: 3 ticks, the next at 4h, then 7h, 10h.
    expect(odyleFull(800, 2 * h)).toBe(10 * h);
    expect(odyleFull(840, 2 * h)).toBe(0);
  });
  it('groups characters by server, the one playing first', () => {
    const groups = characterGroups({ playing: 'B', list: [character({ name: 'A', server: 'Siel', lastSeen: 9 }),
      character({ name: 'B', server: 'Siel', lastSeen: 1 }), character({ name: 'C', serverId: 2402, lastPlayed: 5 })] });
    expect(groups.map(g => [g.server, g.list.map(c => c.name)])).toEqual([['Siel', ['B', 'A']], ['Server 2402', ['C']]]);
    expect(myNames({ playing: null, list: [character({ name: 'A' })] }, 'Z')).toEqual(['A', 'Z']);
  });
  it('lays deaths and party DPS along the fight', () => {
    const f = fight('f', 0, 'Boss', [{ name: 'Me', deathMs: [4000], damageBins: [30000, 1500] }, { name: 'Other', damageBins: [30000] }, { name: '#9', deathMs: [1] }], 45000);
    expect(deathLanes(f, ['Me'])).toEqual([{ label: 'Me', jobKey: 'CLERIC', bold: true, ms: [4000] }]);
    // 60k over the first 30 s; 1.5k over the 15 s the fight ran into the second slice.
    expect(partyDpsBins(f)).toEqual([2000, 100]);
    expect(tickStep(60000, 500)).toBe(60000);
    expect(tickStep(3600000, 500)).toBe(600000);
  });
  it('compares runs like the Linux Analytics page', () => {
    const fights = [fight('a', 1000, 'Vakron', [{ name: 'Me', dps: 100, damage: 600, deaths: 1, deathMs: [40000], damageBins: [300, 300] }, { name: 'Pal', dps: 300, damage: 1800 }]),
      fight('b', 2000, 'Vakron', [{ name: 'Me', dps: 200, damage: 1200, damageBins: [600, 600] }], 60000, false),
      fight('c', 3000, 'Urahum', [{ name: 'Me', dps: 400, damage: 2400 }, { name: '#77', dps: 1 }])];
    const runs = analyticsRuns(fights, ['Me']);
    // The unnamed "#77" isn't anyone to compare.
    expect(runs).toHaveLength(4);
    expect(runs[0]).toMatchObject({ player: 'Me', isMe: true, share: .25 });
    const players = analyticsRows(runs, 'player', 'avgDps', true);
    expect(players.map(r => [r.label, r.count, r.avgDps, r.bestDps])).toEqual([['Pal', 1, 300, 300], ['Me', 3, 700 / 3, 400]]);
    const bosses = analyticsRows(filterRuns(runs, { from: 0, to: 0, minMinutes: 0, killsOnly: false, meOnly: true, filters: {} }), 'boss', 'label', false);
    expect(bosses.map(r => [r.label, r.killRate])).toEqual([['Urahum', 1], ['Vakron', .5]]);
    // A run adds its party up.
    expect(analyticsRows(runs, 'run', 'start', false)[0]).toMatchObject({ key: 'a', avgDps: 400, count: 2 });
    expect(filterRuns(runs, { from: 1500, to: 2500, minMinutes: 0, killsOnly: false, meOnly: false, filters: {} })).toHaveLength(1);
    expect(filterRuns(runs, { from: 0, to: 0, minMinutes: 0, killsOnly: true, meOnly: false, filters: { boss: 'Vakron' } })).toHaveLength(2);
    const vakron = analyticsRows(runs.filter(r => r.boss === 'Vakron' && r.isMe), 'boss', 'avgDps', true)[0];
    // Both runs lasted the whole first and second slice: (300+600)/2 runs/30 s.
    expect(dpsView(vakron)!.bins).toEqual([15, 15]);
    expect(deathBins(vakron)).toMatchObject({ bins: [0, 1], total: 1, runs: 2 });
  });
});

describe('engine presentation boundary', () => {
  it('derives history shares without assuming live-only fields exist', () => {
    const players = playerShares([{ id: 1, damage: 750 }, { id: 2, damage: 250 }] as Player[]);
    expect(players.map(p => p.share)).toEqual([75, 25]);
    expect(playerShares([{ damage: 0 }] as Player[])[0].share).toBe(0);
  });
  it('uses saved hit counts and actor identity for skill rates', () => {
    const skills = savedSkills([{ actorId: 7, name: 'Hit', damage: 750, hits: 4, crit: 2, back: 1 },
      { actorId: 8, name: 'Other', damage: 500, hits: 1 }], 7, 2000);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ dps: 375, critRate: .5, backRate: .25 });
  });
  it('keeps unknown collection state distinct from zero progress and carries souls across levels', () => {
    const all = { '1002': { name: 'Pet', genus: 'cogni', unreleased: false, drops: [] } };
    expect(collectionRows(all, null, 3)[0].needed).toBe(false);
    const c = { server: 1, ready: true, levels: { '1002': 1 }, points: { '1002': 7 }, estimated: [1002] };
    expect(collectionRows(all, c, 3)[0]).toMatchObject({ remaining: 93, estimated: true });
    expect(collectionRows(all, c, 1)[0].remaining).toBe(0);
  });
  it('does not treat an uncached server as a known empty collection', () => {
    const all = { '1002': { name: 'Pet', genus: 'cogni', unreleased: false, drops: [] } };
    const collection = { server: 1001, ready: false, levels: {}, points: {}, estimated: [] };
    expect(collectionRows(all, collection, 3)[0].needed).toBe(false);
    expect(collectionRows(all, { ...collection, ready: true }, 3)[0].needed).toBe(true);
  });
  it('suppresses saved DoT crit and back rates like the live meter', () => {
    const skills = savedSkills([{ actorId: 7, name: 'DoT', damage: 100, hits: 4,
      crit: 4, back: 2, isDot: true }], 7, 2000);
    expect(skills[0]).toMatchObject({ isDot: true, dps: 50, critRate: 0, backRate: 0 });
  });
  it('rolls the hourly schedule forward at the boundary', () => {
    expect(nextEvent(0, 0)).toBe(3600000);
    expect(nextEvent(1700000, 30)).toBe(1800000);
    expect(nextEvent(1800000, 30)).toBe(5400000);
  });
});
