// The pet map's data from Arkive (github.com/arkive-games/arkive, by tc-imba,
// CC BY-NC 4.0): each map's pet spawn clusters by pet name, the pets'
// portraits and the hidden cube spots. As MapData.qml, but read straight from
// Arkive (it allows any origin) with the webview's HTTP cache standing in for
// fetch-map.sh's download folder.
import { useSyncExternalStore } from 'react';
import { pets } from './petData';

export const DATA = 'https://data-aion2.tc-imba.com';
export const RESOURCES = 'https://resource-aion2.tc-imba.com/';

export interface MapInfo { id: string; name: string; region: string; tiles: number; levels: number; game?: number }
// Tiles of 1024 px per side, the coarsest tile level there is (2 = quarter size),
// the region name the pet data uses for it, and the game's id for it.
export const maps: MapInfo[] = [
  { id: 'World_L_A', name: 'Verteron', region: 'Verteron', tiles: 8, levels: 2, game: 1010 },
  { id: 'World_D_A', name: 'Altgard', region: 'Altgard', tiles: 8, levels: 2, game: 1110 },
  { id: 'Abyss_Reshanta_A', name: 'Lower Reshanta', region: 'Chaotic Lower Reshanta', tiles: 4, levels: 1 },
  // Arkive calls it "Chaotic Upper Reshanta"; the game and the pet data say Outer (map 23).
  { id: 'Abyss_Reshanta_D', name: 'Outer Reshanta', region: 'Chaotic Outer Reshanta', tiles: 2, levels: 1 },
];
export const tileSize = 1024;
export const mapOf = (id: string) => maps.find(m => m.id === id) ?? maps[0];
/** A world x or y (game units, cm) to map pixels: the map is centred on 0, 99.61 units a pixel (fitted on Altgard). */
export const worldPx = (v: number) => 4096 + v / 99.612;
/** A tile's URL; full size and the smaller levels alike load from Arkive. */
export function tileUrl(map: string, level: number, x: number, y: number) {
  const name = map + '_' + String(x).padStart(2, '0') + '_' + String(y).padStart(2, '0') + '.webp';
  return RESOURCES + 'UI/Map/WorldMap/' + map + '/Res/' + (level > 0 ? 'z-' + level + '/' : '') + name;
}

export interface Spawn { map: string; x: number; y: number; count: number; zone?: string }
export interface MapState {
  status: 'idle' | 'fetching' | 'ready' | 'failed';
  /** Pet name → spawn clusters in map pixels. */
  spawns: Record<string, Spawn[]>;
  /** Pet name → portrait URL. */
  portraits: Record<string, string>;
  /** Hidden cubes: n is Arkive's number for it. */
  cubes: { map: string; x: number; y: number; n: number }[];
}

let state: MapState = { status: 'idle', spawns: {}, portraits: {}, cubes: [] };
const listeners = new Set<() => void>();

/** A polygon's centre (its area centroid), from Arkive's region borders. */
export function centre(ring: number[][]) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a ? { x: cx / (3 * a), y: cy / (3 * a) } : { x: ring[0][0], y: ring[0][1] };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MapFile { map: string; markers: any[] | null; names: any; regions: any[] | null; regionNames: any }

/** Spawns, portraits and cubes from each map's files (MapData.qml's read()). */
export function readMaps(files: MapFile[]) {
  const spawns: Record<string, Spawn[]> = {};
  const portraits: Record<string, string> = {};
  const cubes: MapState['cubes'] = [];
  const add = (n: string, s: Spawn) => (spawns[n] ??= []).push(s);
  for (const f of files) {
    if (!f.markers || !f.names) continue;
    let creatures = 0;
    for (const m of f.markers) {
      if (m.subtype === 'hiddenCube') cubes.push({ map: f.map, x: m.x, y: m.y, n: m.indexInSubtype + 1 });
      if (m.category !== 'creature') continue;
      const n = f.names[m.id]?.name;
      if (!n) continue;
      creatures++;
      add(n, { map: f.map, x: m.x, y: m.y, count: m.count || 1 });
      if (m.icon && !portraits[n]) portraits[n] = RESOURCES + m.icon;
    }
    if (creatures || !f.regions || !f.regionNames) continue;
    // No spawn points: each pet at the middle of each zone its monsters are in,
    // the pets sharing a zone spread in a ring around it.
    const zones: Record<string, { x: number; y: number }> = {};
    for (const r of f.regions) {
      const name = f.regionNames[r.name]?.name;
      if (name && r.borders?.[0]) zones[name] = centre(r.borders[0]);
    }
    const region = mapOf(f.map).region;
    const inZone: Record<string, Record<string, number>> = {};
    for (const p of Object.values(pets)) {
      for (const d of p.drops) {
        if (d.region !== region) continue;
        for (const z of d.zones ?? []) {
          if (!zones[z]) continue;
          const here = (inZone[z] ??= {});
          here[p.name] = (here[p.name] || 0) + Math.max(1, Math.round((d.spawns || 1) / (d.zones?.length || 1)));
        }
      }
    }
    for (const z in inZone) {
      const names = Object.keys(inZone[z]).sort();
      const r = names.length > 1 ? 40 * Math.sqrt(names.length) : 0;
      names.forEach((n, k) => {
        const a = 2 * Math.PI * k / names.length;
        add(n, { map: f.map, x: zones[z].x + r * Math.cos(a), y: zones[z].y + r * Math.sin(a), count: inZone[z][n], zone: z });
      });
    }
  }
  return { spawns, portraits, cubes };
}

async function json(path: string) {
  const r = await fetch(DATA + path);
  if (!r.ok) throw new Error(path + ': ' + r.status);
  return r.json();
}

/** Downloads (or revalidates) the data, then reads it. Cheap after the first time. */
export function fetchMapData() {
  if (state.status === 'fetching' || state.status === 'ready') return;
  state = { ...state, status: 'fetching' };
  listeners.forEach(l => l());
  void (async () => {
    try {
      const files = await Promise.all(maps.map(async m => {
        const [markers, names, regions, regionNames] = await Promise.all([
          json('/markers/' + m.id + '.json'), json('/locales/en-US/markers/' + m.id + '.json'),
          json('/regions/' + m.id + '.json'), json('/locales/en-US/regions/' + m.id + '.json'),
        ]);
        return { map: m.id, markers: markers.markers, names, regions: regions.regions, regionNames };
      }));
      state = { status: 'ready', ...readMaps(files) };
    } catch {
      state = { ...state, status: 'failed' };
    }
    listeners.forEach(l => l());
  })();
}

export function useMapData(fetchIt = true): MapState {
  if (fetchIt) fetchMapData();
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}
