// The native side: one shared snapshot (polled while it changes) and actions.
// The Linux overlay's MeterClient, over Tauri instead of a Unix socket.
import { invoke, isTauri } from '@tauri-apps/api/core';
import { useSyncExternalStore } from 'react';
import { readSettings, type Settings } from './settings';

export const native = isTauri();

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Snapshot {
  revision: number;
  running: boolean;
  replay: boolean;
  replayComplete: boolean;
  state: any;
  pets: any;
  characters: { playing: string | null; list: any[] } | null;
  pvp: any[];
  kina: { balance: number; daily: number; gained: number; first: number; startMs: number; lastMs: number };
  /** Filled in from `history` apart from the snapshot: every saved fight is too big to copy with each meter update. */
  history: any[];
  historyRevision: number;
  fight: any;
  cubeSpots: Record<string, number[][]>;
  cubeEvents: any[];
  adapters: { name: string; description: string | null; addresses: string[] }[];
  preferences: { iface: string; autoStart: boolean };
  settings: unknown;
  editMode: boolean;
  historyOpen: boolean;
  historyRequest: { id: string; seq: number } | null;
  gameFocused: boolean;
  nav: { page: string; seq: number } | null;
  testNotification: { event: any; seq: number } | null;
  error: string | null;
  dataDir: string;
}

export const emptySnapshot: Snapshot = {
  revision: -1, running: false, replay: false, replayComplete: false, state: null, pets: null, characters: null,
  pvp: [], kina: { balance: -1, daily: -1, gained: 0, first: 0, startMs: 0, lastMs: 0 }, history: [], historyRevision: -1, fight: null,
  cubeSpots: {}, cubeEvents: [], adapters: [], preferences: { iface: '', autoStart: true }, settings: {},
  editMode: false, historyOpen: false, historyRequest: null, gameFocused: false, nav: null, testNotification: null,
  error: null, dataDir: '',
};

let snapshot = emptySnapshot;
let historyRevision = -1;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

// The overlay needs the meter as it changes; the daemon sends it every 200 ms.
let polling = false;
function startPolling() {
  if (polling || !native) return;
  polling = true;
  let inFlight = false;
  const poll = async () => {
    if (inFlight) return;
    inFlight = true;
    try {
      // Null while nothing changed: a long fight history isn't copied every poll.
      const next = await invoke<Snapshot | null>('snapshot', { since: snapshot.revision < 0 ? null : snapshot.revision });
      if (next && next.revision !== snapshot.revision) {
        let history = snapshot.history;
        if (next.historyRevision !== historyRevision) {
          history = (await invoke<any[] | null>('history', { since: null })) ?? [];
          historyRevision = next.historyRevision;
        }
        snapshot = { ...next, history };
        if (!pendingSettings) settingsValue = readSettings(next.settings);
        notify();
      }
    } catch { /* The next poll retries. */ } finally { inFlight = false; }
  };
  void poll();
  setInterval(() => void poll(), 150);
}

export function useSnapshot(): Snapshot {
  startPolling();
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => snapshot);
}

export async function act(action: Record<string, unknown>) {
  if (!native) return;
  await invoke('act', { action });
}
export const send = (action: Record<string, unknown>) => { void act(action).catch(() => {}); };

// ── settings: shown at once, written one at a time, the latest last ──
let settingsValue: Settings = readSettings({});
let pendingSettings: Settings | null = null;
let writing = false;
async function flush() {
  if (writing) return;
  writing = true;
  try {
    while (pendingSettings) {
      const value = pendingSettings;
      try { await act({ action: 'settings', settings: value }); } catch { /* Kept locally; the next change retries. */ }
      if (pendingSettings === value) pendingSettings = null;
    }
  } finally { writing = false; }
}
export function useSettings(): Settings {
  useSnapshot();
  return settingsValue;
}
/** A change: an object of new values, or a function of the current settings that returns one. */
export function updateSettings(change: Partial<Settings> | ((s: Settings) => Partial<Settings>)) {
  const patch = typeof change === 'function' ? change(settingsValue) : change;
  if (!Object.keys(patch).length) return;
  settingsValue = { ...settingsValue, ...patch };
  pendingSettings = settingsValue;
  snapshot = { ...snapshot };
  notify();
  void flush();
}

export async function monitors(): Promise<string[]> {
  return native ? invoke<string[]>('monitors') : [];
}
export function overlayInput(input: { rects: number[][]; all: boolean; shown: boolean }) {
  if (native) void invoke('overlay_input', { input }).catch(() => {});
}
