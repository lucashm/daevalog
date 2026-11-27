// Where pets spawn: a field map (tiles and spawn clusters from Arkive, see
// mapData.ts) with each pet's portrait on its spawn clusters, ringed in its
// genus's colour, and a panel to pick the map and which pets show (PetMapView.qml).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSnapshot } from '../bridge';
import { mapOf, maps, tileSize, tileUrl, useMapData, worldPx } from '../mapData';
import { maxLevel as petMax, needed, pets as catalog, soulsLeft } from '../petData';
import { AppTheme, genusColor } from '../theme';
import type { MapQuery } from './App';
import { hexAlpha, usePetsModel } from './pets';
import { Label, TextField } from './ui';

const genuses = ['cogni', 'fera', 'natura', 'varian', 'special'];
const genusOf: Record<string, string> = {};
const idOf: Record<string, string> = {};
for (const id in catalog) { genusOf[catalog[id].name] = catalog[id].genus; idOf[catalog[id].name] = id; }

/** The live cubes the daemon sent lately (near and not opened), as the Linux client keeps them. */
function liveCubes(events: any[], now: number) {
  const live = new Map<number, any>();
  for (const e of events) {
    if (e.event === 'near' && e.map) live.set(e.id, { id: e.id, map: e.map, x: e.x, y: e.y, at: e.at });
    else if (e.event === 'opened') live.delete(e.id);
  }
  return [...live.values()].filter(c => now - c.at < 300000);
}

function Pill({ label, note, checked = false, hint = false, tint = AppTheme.accent, onClick, width }: {
  label: string; note?: string; checked?: boolean; hint?: boolean; tint?: string; onClick: () => void; width?: number | string;
}) {
  const [hover, setHover] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className={hint ? 'blink' : undefined} style={{
    width, height: 30, borderRadius: 6, display: 'flex', alignItems: 'center', padding: '0 10px', cursor: 'pointer', boxSizing: 'border-box',
    background: checked ? hexAlpha(tint, 0.18) : hover ? AppTheme.rowHover : AppTheme.row, border: '1px solid ' + (checked ? tint : AppTheme.cardEdge),
  }}>
    <Label size={AppTheme.small} color={checked ? AppTheme.text : AppTheme.dim}>{label}</Label>
    {note !== undefined && <Label size={AppTheme.small} color={AppTheme.faint} style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{note}</Label>}
  </div>;
}
const Section = ({ children }: { children: ReactNode }) => <Label size={AppTheme.small} color={AppTheme.dim} bold style={{ letterSpacing: 0.5 }}>{children}</Label>;

export default function PetMap({ query, clearQuery }: { query: MapQuery | null; clearQuery: () => void }) {
  const s = useSnapshot();
  const data = useMapData();
  const pets = s.pets;
  const neededNames = usePetsModel().neededNames;
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'needed' | 'all'>('needed');
  const [genus, setGenus] = useState<string[]>(genuses);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [showCubes, setShowCubes] = useState(false);
  const [showSeen, setShowSeen] = useState(true);
  const [map, setMap] = useState('');
  const [mapPicked, setMapPicked] = useState(false);
  const [view, setView] = useState({ zoom: 0.1, x: 0, y: 0 });
  const [hovered, setHovered] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useLayoutEffect(() => {
    const el = frame.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const info = mapOf(map || maps[0].id);
  const full = info.tiles * tileSize;
  // Your side's field map, from the game's faction: the map to open on.
  const homeMap = ({ elyos: 'World_L_A', asmodian: 'World_D_A' } as Record<string, string>)[s.state?.faction] ?? '';
  // The tile level for the zoom: 2 = quarter size, 1 = half, 0 = full, as coarse as the map goes.
  const level = Math.min(info.levels, view.zoom < 0.3 ? 2 : view.zoom < 0.6 ? 1 : 0);
  const gameId = info.game ?? 0;
  const seen: number[][] = gameId ? s.cubeSpots[gameId] ?? [] : [];

  const left = (name: string) => soulsLeft(pets?.levels?.[idOf[name]] || 0, pets?.points?.[idOf[name]] || 0);
  // The pets with spawns for these filters, unsorted.
  const matching = (sc: string, gs: string[], text: string) => {
    const base = query ? query.names : sc === 'needed' ? neededNames : Object.keys(data.spawns).filter(n => idOf[n] !== undefined);
    const q = text.trim().toLowerCase();
    return base.filter(n => data.spawns[n] && gs.includes(genusOf[n]) && (!q || n.toLowerCase().includes(q)));
  };
  const listed = matching(scope, genus, search)
    .map(n => ({ name: n, genus: genusOf[n], left: left(n), here: data.spawns[n].filter(sp => sp.map === map).length }))
    .sort((a, b) => a.left - b.left || a.name.localeCompare(b.name));
  const shown = listed.filter(p => !hidden[p.name]).map(p => p.name);
  const allDots = useMemo(() => shown.flatMap(n => (data.spawns[n] ?? []).map(sp => ({ name: n, ...sp }))), [shown.join('|'), data.spawns]);
  const dots = allDots.filter(d => d.map === map);
  // Every cube mark on this map: Arkive's spots, the ones the meter saw, the cubes in range lately (always shown).
  const cubes = [
    ...(showCubes ? data.cubes.filter(c => c.map === map).map(c => ({ x: c.x, y: c.y, kind: 'spot' })) : []),
    ...(showSeen ? seen.map(p => ({ x: worldPx(p[0]), y: worldPx(p[1]), kind: 'seen' })) : []),
    ...liveCubes(s.cubeEvents, now).filter(c => gameId && c.map === gameId).map(c => ({ x: worldPx(c.x), y: worldPx(c.y), kind: 'live' })),
  ];
  // The filters that would show something when nothing shows, to blink.
  const hints = (() => {
    if (!listed.length) {
      const off = genuses.filter(g => !genus.includes(g));
      const out = off.filter(g => matching(scope, [...genus, g], search).length).map(g => 'genus:' + g);
      if (!query && scope === 'needed' && matching('all', genus, search).length) out.push('all');
      if (out.length) return out;
      if (matching('all', genuses, search).length) {
        const more = off.filter(g => matching('all', [g], search).length).map(g => 'genus:' + g);
        return query || scope === 'all' ? more : [...more, 'all'];
      }
      return search.trim() && matching('all', genuses, '').length ? ['search'] : [];
    }
    if (!shown.length) return ['showAll'];
    if (!dots.length) return maps.filter(m => allDots.some(d => d.map === m.id)).map(m => 'map:' + m.id);
    return [];
  })();

  const minZoom = () => Math.min(box.w / full, box.h / full);
  const fit = () => setView({ zoom: minZoom(), x: 0, y: 0 });
  const clampView = (z: number, x: number, y: number) => ({
    zoom: z, x: Math.max(0, Math.min(full * z - box.w, x)), y: Math.max(0, Math.min(full * z - box.h, y)),
  });
  /** Zoom by `factor`, keeping the map point under (mx, my) in place. */
  const zoomAt = (factor: number, mx: number, my: number) => setView(v => {
    const z = Math.max(minZoom(), Math.min(1.5, v.zoom * factor));
    const px = (v.x + mx) / v.zoom, py = (v.y + my) / v.zoom;
    return clampView(z, px * z - mx, py * z - my);
  });
  /** One pet's spawns, zoomed to fit them: on your faction's map if it has any, else the busiest. */
  const focusOn = (name: string) => {
    const spots = data.spawns[name] ?? [];
    if (!spots.length) return;
    setMapPicked(true);
    const counts: Record<string, number> = {};
    for (const sp of spots) counts[sp.map] = (counts[sp.map] || 0) + 1;
    const best = counts[homeMap] ? homeMap : Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    setMap(best);
    pendingFocus.current = spots.filter(sp => sp.map === best);
  };
  const pendingFocus = useRef<any[] | null>(null);
  useLayoutEffect(() => {
    const here = pendingFocus.current;
    if (!here) { fit(); return; }
    pendingFocus.current = null;
    const xs = here.map(p => p.x), ys = here.map(p => p.y), pad = 400;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const z = Math.max(minZoom(), Math.min(1, box.w / w, box.h / h));
    setView(clampView(z, ((Math.min(...xs) + Math.max(...xs)) / 2) * z - box.w / 2, ((Math.min(...ys) + Math.max(...ys)) / 2) * z - box.h / 2));
  }, [map]);
  useEffect(() => { if (view.zoom < minZoom()) fit(); }, [box.w, box.h]);

  // The map changes only when you pick one, a pet in the list, or a pet's map
  // button on the Pets page; until then it's your faction's map, or the busiest.
  useEffect(() => { if (homeMap && !mapPicked) setMap(homeMap); }, [homeMap]);
  useEffect(() => {
    if (map || !allDots.length) return;
    let best = maps[0].id, most = 0;
    for (const m of maps) { const n = allDots.filter(d => d.map === m.id).length; if (n > most) { best = m.id; most = n; } }
    setMap(best);
  }, [allDots.length]);
  useEffect(() => {
    setHidden({});
    setSearch('');
    if (query) setGenus(g => [...g, ...genuses.filter(x => !g.includes(x) && query.names.some(n => genusOf[n] === x))]);
    if (query?.names.length === 1) focusOn(query.names[0]);
  }, [query]);
  useEffect(() => { if (!map) setMap(homeMap || ''); }, []);

  // Dragging pans; the wheel zooms around the pointer.
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const onWheel = (e: React.WheelEvent) => {
    const r = frame.current!.getBoundingClientRect();
    zoomAt(Math.pow(1.0015, -e.deltaY), e.clientX - r.left, e.clientY - r.top);
  };

  const petInfo = (name: string) => {
    const id = idOf[name];
    const level = pets?.levels?.[id] || 0, points = pets?.points?.[id] || 0;
    const region = info.region;
    return {
      genus: genusOf[name] || '', level, points, estimated: !!pets?.estimated?.includes(Number(id)), left: soulsLeft(level, points),
      drops: (catalog[id]?.drops ?? []).filter(d => d.region === region),
    };
  };

  const tiles: ReactNode[] = [];
  if (map) {
    for (const lv of [2, 1, 0]) {
      if (!(level <= lv && lv <= info.levels)) continue;
      const n = info.tiles >> lv;
      const side = full / n * view.zoom;
      const margin = side / 4;
      for (let i = 0; i < n * n; i++) {
        const tx = Math.floor(i / n), ty = i % n;
        const x = tx * side, y = ty * side;
        // Finer tiles load only on screen (and just past it); the coarsest always.
        const on = lv === info.levels || (x + side > view.x - margin && x < view.x + box.w + margin && y + side > view.y - margin && y < view.y + box.h + margin);
        if (on) tiles.push(<img key={lv + ':' + i} src={tileUrl(map, lv, tx, ty)} alt="" draggable={false}
          style={{ position: 'absolute', left: x, top: y, width: Math.ceil(side), height: Math.ceil(side), zIndex: -1 - lv }} />);
      }
    }
  }
  const hov = hovered ? petInfo(hovered.name) : null;
  const hx = hovered ? hovered.x * view.zoom - view.x : 0, hy = hovered ? hovered.y * view.zoom - view.y : 0;

  return <div style={{ display: 'flex', gap: 12, height: '100%' }}>
    {/* ── the panel ── */}
    <div style={{ width: 320, flexShrink: 0, background: AppTheme.card, border: '1px solid ' + AppTheme.cardEdge, borderRadius: AppTheme.radius, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className={hints.includes('search') ? 'blink' : undefined} style={{ borderRadius: 6 }}>
          <TextField value={search} onChange={setSearch} placeholder="Search pets…" width="100%" background={AppTheme.bg} />
        </span>
        {query && <div style={{ height: 34, borderRadius: 6, background: AppTheme.accentSoft, border: '1px solid ' + AppTheme.accent, display: 'flex', alignItems: 'center', padding: '0 12px' }}>
          <Label size={AppTheme.small} color={AppTheme.accent} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{'Showing: ' + query.title}</Label>
          <span onClick={clearQuery} style={{ marginLeft: 'auto', color: AppTheme.accent, cursor: 'pointer', padding: 8, margin: -8 }}>✕</span>
        </div>}
        <Section>MAP</Section>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {maps.map(m => <Pill key={m.id} label={m.name} note={String(allDots.filter(d => d.map === m.id).length)} checked={map === m.id}
            hint={hints.includes('map:' + m.id)} onClick={() => { setMapPicked(true); setMap(m.id); }} />)}
        </div>
        <Section>LAYERS</Section>
        {/* Arkive lists only some of the spots a cube can spawn on. */}
        <Pill label="Cube spots (partial)" note={String(data.cubes.filter(c => c.map === map).length)} tint={AppTheme.cube} checked={showCubes} onClick={() => setShowCubes(!showCubes)} />
        {/* Saved by the meter as you play (cube-spots.json); a live cube shows either way. */}
        <Pill label="Cubes seen by the meter" note={String(seen.length)} tint={AppTheme.cube} checked={showSeen} onClick={() => setShowSeen(!showSeen)} />
        <Section>PETS</Section>
        {!query && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Pill label="Still needed" note={String(neededNames.filter(n => data.spawns[n]).length)} checked={scope === 'needed'} onClick={() => setScope('needed')} />
          <Pill label="All pets" checked={scope === 'all'} hint={hints.includes('all')} onClick={() => setScope('all')} />
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {genuses.map(g => <Pill key={g} label={g.charAt(0).toUpperCase() + g.slice(1)} tint={genusColor(g)} checked={genus.includes(g)} hint={hints.includes('genus:' + g)}
            onClick={() => setGenus(genus.includes(g) ? genus.filter(x => x !== g) : [...genus, g])} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <Pill label="Show all" hint={hints.includes('showAll')} onClick={() => setHidden({})} />
          <Pill label="Hide all" onClick={() => setHidden(Object.fromEntries(listed.map(p => [p.name, true])))} />
        </div>
        <Label size={AppTheme.small} color={hints.length ? AppTheme.warn : AppTheme.faint}>
          {hints.length ? (listed.length && shown.length ? 'None here: try the highlighted map' : 'Nothing shows: try the highlighted filter')
            : shown.length + ' of ' + listed.length + ' pets shown  ·  ' + dots.length + ' spawn areas here'}
        </Label>
      </div>
      {/* The pets: tick to show, click the name to go to its spawns. */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 6px 8px' }}>
        {listed.map(p => {
          const on = !hidden[p.name];
          return <div key={p.name} className="hover-row" onClick={() => { setHidden(h => { const n = { ...h }; delete n[p.name]; return n; }); focusOn(p.name); }}
            style={{ height: 44, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 0 8px', cursor: 'pointer' }}>
            <span onClick={e => { e.stopPropagation(); setHidden(h => ({ ...h, [p.name]: on })); }} style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, boxSizing: 'border-box', display: 'grid', placeItems: 'center', color: 'white', fontSize: 11, fontWeight: 700,
              background: on ? AppTheme.accent : 'transparent', border: '1px solid ' + (on ? AppTheme.accent : AppTheme.faint) }}>{on ? '✓' : ''}</span>
            <span style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, overflow: 'hidden', boxSizing: 'border-box', background: hexAlpha(genusColor(p.genus), 0.2), border: '1px solid ' + genusColor(p.genus) }}>
              {data.portraits[p.name] && <img src={data.portraits[p.name]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <Label color={on ? AppTheme.text : AppTheme.faint} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</Label>
              <Label size={11} color={AppTheme.faint}>{p.left ? p.left + ' souls to level 3' : 'Level 3'}</Label>
            </span>
            <Label size={AppTheme.small} color={AppTheme.dim} style={{ fontVariantNumeric: 'tabular-nums' }}>{p.here ? String(p.here) : '–'}</Label>
          </div>;
        })}
      </div>
    </div>

    {/* ── the map ── */}
    <div ref={frame} onWheel={onWheel}
      onPointerDown={e => { if (e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; } }}
      onPointerMove={e => { const d = drag.current; if (d) setView(v => clampView(v.zoom, d.vx - (e.clientX - d.x), d.vy - (e.clientY - d.y))); }}
      onPointerUp={() => { drag.current = null; }}
      style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: AppTheme.radius, background: '#0A1016', border: '1px solid ' + AppTheme.cardEdge, cursor: drag.current ? 'grabbing' : 'grab', touchAction: 'none' }}>
      <div style={{ position: 'absolute', left: -view.x, top: -view.y, width: full * view.zoom, height: full * view.zoom, zIndex: 0, isolation: 'isolate' }}>
        {tiles}
        {/* Hidden cubes: a small diamond each, named on hover; Arkive's faint, a live one pulsing. */}
        {cubes.map((c, i) => {
          const live = c.kind === 'live';
          const size = (live ? 22 : 16) * Math.max(0.6, Math.min(1, view.zoom * 2));
          return <span key={'c' + i} className={'cube ' + c.kind} style={{ position: 'absolute', left: c.x * view.zoom - size / 2, top: c.y * view.zoom - size / 2, width: size, height: size, zIndex: live ? 2 : 0 }}
            title={live ? 'Hidden cube here now' : c.kind === 'seen' ? 'A cube was seen here' : 'Possible cube spot (Arkive)'}>
            {live && <span className="cube-pulse" />}
            <span className="cube-mark" />
          </span>;
        })}
        {/* Each spawn cluster: the pet's portrait in a ring of its genus's colour, bigger with more spawns. */}
        {dots.map((d, i) => {
          // Half size with the whole map in view, full size from half zoom up, so a crowded map stays readable.
          const size = (28 + Math.min(12, Math.sqrt(d.count) * 1.5)) * Math.max(0.5, Math.min(1, view.zoom * 2));
          const isHovered = hovered && hovered.name === d.name && hovered.x === d.x && hovered.y === d.y;
          return <span key={d.name + i} onPointerEnter={() => setHovered(d)} onPointerLeave={() => setHovered((h: any) => (h === d ? null : h))}
            style={{ position: 'absolute', left: d.x * view.zoom - size / 2, top: d.y * view.zoom - size / 2, width: size, height: size, borderRadius: '50%', zIndex: isHovered ? 4 : 1,
              background: genusColor(genusOf[d.name]), boxShadow: isHovered ? '0 0 0 2px white' : undefined, display: 'grid', placeItems: 'center' }}>
            {data.portraits[d.name] && <img src={data.portraits[d.name]} alt="" draggable={false} style={{ width: size - 6, height: size - 6, borderRadius: '50%', objectFit: 'cover' }} />}
          </span>;
        })}
      </div>

      {/* The pet under the pointer: a card beside its portrait, kept inside the map. */}
      {hov && <div style={{
        position: 'absolute', zIndex: 10, width: 320, padding: 12, borderRadius: AppTheme.radius, background: 'rgba(18, 20, 25, 0.97)', border: '1px solid ' + genusColor(hov.genus),
        left: hx + 28 + 320 < box.w - 8 ? hx + 28 : Math.max(8, hx - 28 - 320), top: Math.max(8, Math.min(box.h - 220, hy - 30)), display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', background: hexAlpha(genusColor(hov.genus), 0.2), flexShrink: 0 }}>
            {data.portraits[hovered.name] && <img src={data.portraits[hovered.name]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Label size={AppTheme.large} bold>{hovered.name}</Label>
            <Label size={AppTheme.small} color={genusColor(hov.genus)}>{hov.genus.charAt(0).toUpperCase() + hov.genus.slice(1) + '  ·  ' + (hov.level === 0 ? 'Not collected' : 'Lv. ' + hov.level + (hov.estimated ? ' Est.' : ''))}</Label>
          </span>
        </div>
        {/* Souls toward the next level, and to the top. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex' }}>
            <Label size={AppTheme.small}>{hov.level >= petMax ? 'Level 3 · full' : hov.points + ' / ' + needed[hov.level] + ' souls to Lv. ' + (hov.level + 1)}</Label>
            {hov.level < petMax && <Label size={AppTheme.small} color={AppTheme.dim} style={{ marginLeft: 'auto' }}>{hov.left + ' to level 3'}</Label>}
          </div>
          <span style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, background: genusColor(hov.genus), width: (hov.level >= petMax ? 1 : Math.min(1, hov.points / needed[hov.level])) * 100 + '%' }} />
          </span>
        </div>
        {/* Abyss pets have no spawn points, only the zone. */}
        <Label size={AppTheme.small} color={AppTheme.dim}>{hovered.zone
          ? 'Somewhere in ' + hovered.zone + '  ·  about ' + hovered.count + (hovered.count === 1 ? ' spawn' : ' spawns')
          : 'This spot: ' + hovered.count + (hovered.count === 1 ? ' spawn' : ' spawns')}</Label>
        {/* The monsters that drop it on this map. */}
        {hov.drops.slice(0, 3).map((d, i) => {
          const k = d.kibelisk ?? null;
          return <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Label size={AppTheme.small} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.npc + (d.level ? '  Lv. ' + d.level : '') + (d.chance && d.chance !== '100%' ? '  ·  ' + d.chance : '')}</Label>
            <Label size={11} color={AppTheme.faint}>{[(d.zones ?? []).join(', '), k ? (k.teleport ? 'teleport #' + k.teleport + ' ' : 'near ') + k.name + ' · ' + k.m + ' m' : ''].filter(Boolean).join('  ·  ')}</Label>
          </div>;
        })}
      </div>}

      {/* Download state. */}
      {(data.status === 'fetching' || data.status === 'failed') && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <Label size={AppTheme.large} color={AppTheme.dim}>{data.status === 'fetching' ? 'Downloading the map…' : 'Couldn’t download the map. Check your connection and open it again.'}</Label>
      </div>}
      {data.status === 'ready' && query && query.names.every(n => !data.spawns[n]) && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
        <Label color={AppTheme.dim}>{'No known spawns for ' + (query.names.length === 1 ? 'this pet' : 'these pets') + ' on the field maps (dungeon or Abyss drops).'}</Label>
      </div>}

      {/* Zoom buttons and credit. */}
      <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 11 }} onPointerDown={e => e.stopPropagation()}>
        {([['+', 1.4], ['−', 1 / 1.4], ['⤢', 0]] as [string, number][]).map(([t, f]) => <button key={t} className="zoom-button"
          onClick={() => (f ? zoomAt(f, box.w / 2, box.h / 2) : fit())}>{t}</button>)}
      </div>
      <Label size={11} color={AppTheme.faint} style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 11 }}>Map and spawns: Arkive by tc-imba (CC BY-NC 4.0)</Label>
    </div>
  </div>;
}
