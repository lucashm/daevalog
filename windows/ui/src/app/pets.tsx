// Every pet with your level and souls, the phase you farm in, and where to find
// the pets you still need (PetsPage.qml).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState, type ReactNode } from 'react';
import { updateSettings, useSettings, useSnapshot } from '../bridge';
import { useMapData } from '../mapData';
import { collectionRewards, maxLevel, needed, pets as catalog, sideMaps, type Drop, type Pet } from '../petData';
import { AppTheme, genusColor } from '../theme';
import type { MapQuery } from './App';
import { Bar, Card, Check, Label, Section, TextField } from './ui';

const phaseTitles: Record<number, string> = { 1: 'Collect every pet', 2: 'Take every pet to level 2', 3: 'Take every pet to level 3' };
const sorts = [{ key: 'closest', label: 'Closest to done' }, { key: 'name', label: 'Name' }, { key: 'level', label: 'Level' }];
const genuses = [{ key: 'cogni', label: 'Cogni' }, { key: 'fera', label: 'Fera' }, { key: 'natura', label: 'Natura' }, { key: 'varian', label: 'Varian' }, { key: 'special', label: 'Special' }];
const areas = [{ key: 'elyos', label: 'Elyos' }, { key: 'asmodian', label: 'Asmodian' }, { key: 'abyss', label: 'Abyss' }, { key: 'other', label: 'Other' }];

/** Which side's ground a drop's region is: "elyos", "asmodian", "abyss" or "other". */
export function areaOf(region: string) {
  if (sideMaps.elyos.includes(region)) return 'elyos';
  if (sideMaps.asmodian.includes(region)) return 'asmodian';
  return region.includes('Reshanta') ? 'abyss' : 'other';
}

export interface PetRowData {
  id: string; name: string; genus: string; level: number; points: number; estimated: boolean;
  drop: Drop | null; farmable: boolean; toMax: number; toPhase: number; matches: boolean;
}

/** Everything the page shows, from the pet data, your levels and points, and the filters. */
export function petsModel(all: Record<string, Pet>, levels: Record<string, number>, points: Record<string, number>, estimated: number[],
  o: { phase: string; genus: string[]; farmIn: string[]; search: string; sort: string }) {
  const souls = (level: number, pts: number, upTo: number) => Math.max(0, needed.slice(level, upTo).reduce((n, x) => n + x, 0) - pts);
  const q = (o.search || '').trim().toLowerCase();
  const list: PetRowData[] = [];
  const genus: Record<string, { collected: number; total: number }> = {};
  let collected = 0;
  for (const id in all) {
    const p = all[id];
    const level = levels[id] || 0;
    const pts = points[id] || 0;
    const g = (genus[p.genus] ??= { collected: 0, total: 0 });
    g.total++;
    if (level >= 1) { g.collected++; collected++; }
    // The easiest monster in the areas you farm: lowest level, then most spawns.
    const drops = p.drops.filter(d => o.farmIn.includes(areaOf(d.region))).sort((a, b) => a.level - b.level || b.spawns - a.spawns);
    const drop = drops[0] ?? null;
    list.push({
      id, name: p.name, genus: p.genus, level, points: pts, estimated: estimated.includes(Number(id)), drop,
      farmable: !!drop && !p.unreleased && p.genus !== 'special' && o.genus.includes(p.genus),
      toMax: souls(level, pts, needed.length), toPhase: 0,
      matches: !q || p.name.toLowerCase().includes(q) || p.drops.some(d => d.npc.toLowerCase().includes(q)),
    });
  }
  const farmable = list.filter(p => p.farmable);
  const phaseCounts: Record<number, number> = {};
  for (let l = 1; l <= needed.length; l++) phaseCounts[l] = farmable.filter(p => p.level >= l).length;
  // The level you farm toward: 1, 2 or 3 (anything else, such as an old "auto", is 3).
  const phase = Number(o.phase) >= 1 && Number(o.phase) <= needed.length ? Number(o.phase) : needed.length;
  for (const p of list) p.toPhase = souls(p.level, p.points, phase);
  const by = ({
    // Closest to level 3: the fewest souls left to the top.
    closest: (a: PetRowData, b: PetRowData) => a.toMax - b.toMax || a.name.localeCompare(b.name),
    name: (a: PetRowData, b: PetRowData) => a.name.localeCompare(b.name),
    level: (a: PetRowData, b: PetRowData) => b.level - a.level || a.name.localeCompare(b.name),
  } as Record<string, (a: PetRowData, b: PetRowData) => number>)[o.sort] ?? ((a, b) => a.name.localeCompare(b.name));
  const shown = (p: PetRowData) => p.matches;
  const neededNow = farmable.filter(p => p.level < phase);
  return {
    phase, farmable: farmable.length, phaseCounts,
    needed: neededNow.filter(shown).sort(by), neededCount: neededNow.length,
    neededNames: neededNow.map(p => p.name), soulsNeeded: neededNow.reduce((n, p) => n + p.toPhase, 0),
    done: farmable.filter(p => p.level >= phase).filter(shown).sort(by),
    notFarmed: list.filter(p => !p.farmable).filter(shown).sort(by),
    notFarmedCount: list.length - farmable.length, genus, collected, total: list.length,
    nextReward: collectionRewards.find(m => m.at > collected) ?? null,
  };
}

/** The pets still needed under the page's filters: what the Map shows by default. */
export function usePetsModel(search = '') {
  const s = useSnapshot();
  const settings = useSettings();
  const pets = s.pets;
  return useMemo(() => petsModel(catalog, pets?.levels ?? {}, pets?.points ?? {}, pets?.estimated ?? [], {
    phase: settings.petsPhase, genus: settings.petsGenus, farmIn: settings.petsFarmIn, search, sort: settings.petsSort,
  }), [pets, settings.petsPhase, settings.petsGenus, settings.petsFarmIn, settings.petsSort, search]);
}

const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
const cols = [0.27, 0.15, 0.15, 0.25, 0.13, 0.05];

export default function Pets({ openMap }: { openMap: (q: MapQuery | null) => void }) {
  const s = useSnapshot();
  const settings = useSettings();
  const map = useMapData();
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [showNotFarmed, setShowNotFarmed] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const model = usePetsModel(search);
  const live = !!s.state?.capture?.locked;
  const character = s.state?.character ?? '';

  return <>
    {/* ── header ── */}
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <Label size={AppTheme.title} bold>Pets</Label>
        <Label color={AppTheme.dim}>Every pet with your level and souls, the phase you farm in and where to find the pets you still need.</Label>
      </div>
      <span style={{ height: 26, padding: '0 12px', borderRadius: 13, background: 'rgba(255,255,255,0.04)', border: '1px solid ' + AppTheme.cardEdge, display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'center' }}>
        <span style={{ width: 7, height: 7, borderRadius: 4, background: live ? AppTheme.good : AppTheme.faint }} />
        <Label size={AppTheme.small}>{live ? 'Live' + (character ? ' · ' + character : '') : 'Offline'}</Label>
      </span>
      <button onClick={() => openMap(null)} style={{ height: 34, padding: '0 14px', borderRadius: 6, border: 0, background: AppTheme.accent, color: 'white', fontWeight: 700, cursor: 'pointer' }}>Open the map</button>
    </div>

    {/* ── how it works ── */}
    {!settings.petsHelpHidden && <Card style={{ padding: 20, position: 'relative', background: 'rgba(61, 140, 255, 0.05)', borderColor: 'rgba(61, 140, 255, 0.35)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Label size={AppTheme.large} bold>How pet farming works</Label>
      <div style={{ display: 'flex', gap: 24 }}>
        {[['Kill a pet’s monster for its souls', '5 souls collect the pet, 25 more take it to level 2 and 75 more to level 3. Every level adds to your stats.'],
          ['Every pet first, then the next level', 'Collecting gives 100 Genus EXP per soul, level 2 only 10 and level 3 about 3. So collect every pet, then take all to level 2, then to 3.'],
          ['Pick an area and open the map', 'The map then shows where the pets you still need spawn, and the pet souls widget tracks the ones you farm.']].map(([t, n], i) =>
          <div key={i} style={{ flex: 1, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ width: 20, height: 20, borderRadius: 10, background: AppTheme.accentSoft, color: AppTheme.accent, fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><Label bold>{t}</Label><Label size={AppTheme.small} color={AppTheme.dim}>{n}</Label></div>
          </div>)}
      </div>
      <Label size={AppTheme.small} color={AppTheme.dim}>ⓘ  Your progress comes from the game while the meter runs. A level-up shows as Est. until the game confirms it (when you teleport or log in).</Label>
      <span onClick={() => updateSettings({ petsHelpHidden: true })} style={{ position: 'absolute', right: 14, top: 14, color: AppTheme.dim, cursor: 'pointer', padding: 6, margin: -6 }}>✕</span>
    </Card>}

    {/* ── filters and table ── */}
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <Card style={{ width: 220, flexShrink: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Section>PHASE</Section>
        {[1, 2, 3].map(l => <Check key={l} label={'Lv. ' + l} note={(model.phaseCounts[l] || 0) + ' / ' + model.farmable} checked={model.phase === l} toggled={() => updateSettings({ petsPhase: String(l) })} />)}
        <span style={{ height: 12 }} />
        <Section>GENUS INSIGHT</Section>
        {genuses.map(g => {
          const c = model.genus[g.key] ?? { collected: 0, total: 0 };
          const insight = s.pets?.genus?.[g.key];
          return <Check key={g.key} label={g.label} note={c.collected + ' / ' + c.total + (insight ? ' · Lv. ' + insight.level : '')}
            checked={settings.petsGenus.includes(g.key)} toggled={() => updateSettings({ petsGenus: toggle(settings.petsGenus, g.key) })} />;
        })}
        <span style={{ height: 12 }} />
        <div style={{ display: 'flex' }}>
          <Section>FARM IN</Section>
          <Label size={AppTheme.small} color={AppTheme.accent} style={{ marginLeft: 'auto', cursor: 'pointer' }}>
            <span onClick={() => updateSettings({ petsFarmIn: ['elyos', 'asmodian', 'abyss'] })}>Reset</span>
          </Label>
        </div>
        {areas.map(a => <Check key={a.key} label={a.label} checked={settings.petsFarmIn.includes(a.key)} toggled={() => updateSettings({ petsFarmIn: toggle(settings.petsFarmIn, a.key) })} />)}
        <span style={{ height: 12 }} />
        <Section>COLLECTION</Section>
        <div style={{ height: 24, display: 'flex', alignItems: 'center' }}>
          <Label>Collected</Label>
          <Label color={AppTheme.dim} style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{model.collected + ' / ' + model.total}</Label>
        </div>
        {model.nextReward && <div style={{ height: 24, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Label size={AppTheme.small} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{model.nextReward.reward}</Label>
          <Label size={AppTheme.small} color={AppTheme.dim} style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{'at ' + model.nextReward.at + ' pets'}</Label>
        </div>}
      </Card>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Phase title, counts and progress. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Label size={AppTheme.large} bold>{phaseTitles[model.phase]}</Label>
          <Label color={AppTheme.dim}>{'·  ' + model.neededCount + ' pets needed  ·  ' + model.soulsNeeded + ' souls'}</Label>
          <Bar width={110} value={model.farmable ? model.phaseCounts[model.phase] / model.farmable : 0} />
          <Label size={AppTheme.small} color={AppTheme.dim}>{model.phaseCounts[model.phase] + ' / ' + model.farmable}</Label>
        </div>
        {/* Search and sort. */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, position: 'relative', zIndex: 2 }}>
          <TextField value={search} onChange={setSearch} placeholder="Search pets or monsters" width={240} />
          <div style={{ position: 'relative', width: 190 }}>
            <button onClick={() => setSortOpen(!sortOpen)} style={{ width: '100%', height: 34, borderRadius: 6, background: AppTheme.card, border: '1px solid ' + (sortOpen ? AppTheme.accent : AppTheme.cardEdge), color: AppTheme.text, display: 'flex', alignItems: 'center', padding: '0 12px', cursor: 'pointer' }}>
              {(sorts.find(o => o.key === settings.petsSort) ?? sorts[0]).label}<span style={{ marginLeft: 'auto', color: AppTheme.dim }}>⌄</span>
            </button>
            {sortOpen && <div style={{ position: 'absolute', top: 38, width: '100%', padding: '4px 0', borderRadius: 6, background: AppTheme.card, border: '1px solid ' + AppTheme.cardEdge }}>
              {sorts.map(o => <div key={o.key} className="hover-row" onClick={() => { updateSettings({ petsSort: o.key }); setSortOpen(false); }}
                style={{ height: 30, padding: '0 12px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: o.key === settings.petsSort ? AppTheme.accent : AppTheme.text }}>{o.label}</div>)}
            </div>}
          </div>
        </div>
        {/* The table. */}
        <Card style={{ overflow: 'hidden' }}>
          <Row height={40} border>
            {['PET', 'LEVEL', 'SOULS', 'MONSTER', 'WHERE', ''].map((h, i) => <Cell key={i} i={i}><Section>{h}</Section></Cell>)}
          </Row>
          <Group title="Needed now" note={model.neededCount + ' pets · ' + model.soulsNeeded + ' souls'} color={AppTheme.accent} open rows={model.needed} portraits={map.portraits} spawns={map.spawns} openMap={openMap} />
          <Group title="Done for this phase" note={model.phaseCounts[model.phase] + ' pets'} color={AppTheme.good} open={showDone} toggle={() => setShowDone(!showDone)} rows={model.done} portraits={map.portraits} spawns={map.spawns} openMap={openMap} />
          <Group title="Not farmed" note={model.notFarmedCount + ' pets · where you don’t farm, not on the map or not from monsters'} color={AppTheme.text} open={showNotFarmed} toggle={() => setShowNotFarmed(!showNotFarmed)} rows={model.notFarmed} portraits={map.portraits} spawns={map.spawns} openMap={openMap} />
        </Card>
      </div>
    </div>
  </>;
}

function Row({ children, height, border = false, hover = false }: { children: ReactNode; height: number; border?: boolean; hover?: boolean }) {
  return <div className={hover ? 'hover-row' : undefined} style={{ height, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid ' + (border ? AppTheme.cardEdge : 'rgba(255,255,255,0.04)') }}>{children}</div>;
}
function Cell({ i, children }: { i: number; children: ReactNode }) {
  return <div style={{ width: cols[i] * 100 + '%', minWidth: 0, paddingRight: 8, display: 'flex', alignItems: 'center' }}>{children}</div>;
}

/** A collapsible group of pet rows in the table. */
function Group({ title, note, color, open, toggle, rows, portraits, spawns, openMap }: {
  title: string; note: string; color: string; open: boolean; toggle?: () => void; rows: PetRowData[];
  portraits: Record<string, string>; spawns: Record<string, unknown>; openMap: (q: MapQuery | null) => void;
}) {
  return <>
    <div onClick={toggle} style={{ height: 38, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px solid ' + AppTheme.cardEdge, cursor: toggle ? 'pointer' : undefined }}>
      <Label color={AppTheme.dim} style={{ width: 12 }}>{open ? '⌄' : '›'}</Label>
      <Label color={color} bold>{title}</Label>
      <Label color={AppTheme.dim}>{note}</Label>
    </div>
    {open && rows.map(p => {
      const full = p.level >= maxLevel;
      return <Row key={p.id} height={52} hover>
        {/* Pet: portrait, name, genus. */}
        <Cell i={0}>
          <span style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0, overflow: 'hidden', background: hexAlpha(genusColor(p.genus), 0.18), display: 'grid', placeItems: 'center', marginRight: 10 }}>
            {portraits[p.name] ? <img src={portraits[p.name]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Label bold color={genusColor(p.genus)}>{p.name.charAt(0)}</Label>}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</Label>
            <Label size={AppTheme.small} color={AppTheme.dim}>{p.genus.charAt(0).toUpperCase() + p.genus.slice(1)}</Label>
          </span>
        </Cell>
        {/* Level. */}
        <Cell i={1}><Label color={p.level === 0 ? AppTheme.dim : AppTheme.text}>{p.level === 0 ? 'Not collected' : 'Lv. ' + p.level + (p.estimated ? ' Est.' : '')}</Label></Cell>
        {/* Souls toward the next level. */}
        <Cell i={2}>
          <Label style={{ fontVariantNumeric: 'tabular-nums', marginRight: 8 }}>{full ? 'Max' : p.points + ' / ' + needed[p.level]}</Label>
          {!full && <Bar width={50} value={p.points / needed[p.level]} />}
        </Cell>
        {/* Monster and where. */}
        <Cell i={3}><Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.drop ? <>{p.drop.npc}{p.drop.level ? <span style={{ color: AppTheme.dim }}> Lv. {p.drop.level}</span> : null}</> : '–'}
        </Label></Cell>
        <Cell i={4}><Label style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.drop ? p.drop.region : ''}</Label></Cell>
        <Cell i={5}>{spawns[p.name] ? <span className="map-pin" onClick={() => openMap({ names: [p.name], title: p.name })}
          style={{ cursor: 'pointer', fontSize: AppTheme.large, color: AppTheme.dim, padding: 6, margin: -6 }} title="Show on the map">⌖</span> : null}</Cell>
      </Row>;
    })}
  </>;
}

/** "#5F8CFF" at alpha. */
export function hexAlpha(c: string, a: number) {
  const n = parseInt(c.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
