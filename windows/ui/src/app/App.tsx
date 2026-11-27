// The app window, as the Linux App.qml: pages that need more room than a
// widget, in an ordinary desktop window. Opened from the tray ("Open app").
import { useEffect, useState } from 'react';
import { updateSettings, useSettings, useSnapshot } from '../bridge';
import { fetchMapData } from '../mapData';
import { AppTheme } from '../theme';
import Analytics from './analytics';
import Capture from './capture';
import Characters from './characters';
import PetMap from './map';
import Notifications from './notifications';
import Pets from './pets';
import './app.css';

const sections = [
  { title: 'IN GAME', pages: [{ id: 'characters', label: 'Characters', icon: '🧝' }, { id: 'pets', label: 'Pets', icon: '🐾' }, { id: 'map', label: 'Map', icon: '🗺' }] },
  { title: 'RECORDS', pages: [{ id: 'analytics', label: 'Analytics', icon: '📈' }] },
  // Capture is Windows' own: the adapter and Npcap, which Linux sets at install.
  { title: 'SETTINGS', pages: [{ id: 'notifications', label: 'Notifications', icon: '🔔' }, { id: 'capture', label: 'Capture', icon: '📡' }] },
];
const ids = sections.flatMap(s => s.pages.map(p => p.id));
/** What the Map page shows when opened from a pet: its names and a title; null for every pet still needed. */
export interface MapQuery { names: string[]; title: string }

export default function App() {
  const s = useSnapshot();
  const settings = useSettings();
  const page = ids.includes(settings.appPage) ? settings.appPage : 'pets';
  const [mapQuery, setMapQuery] = useState<MapQuery | null>(null);
  const go = (id: string) => updateSettings({ appPage: id });
  // Asked from the tray (Analytics) or Rust.
  useEffect(() => { if (s.nav && ids.includes(s.nav.page)) go(s.nav.page); }, [s.nav?.seq]);
  // The map data (and the portraits in the Pets table): downloaded, or checked for updates.
  useEffect(() => { fetchMapData(); }, []);
  const openMap = (q: MapQuery | null) => { setMapQuery(q); go('map'); };

  return <div className="app">
    <nav className="sidebar">
      <div className="brand">Daevalog</div>
      {sections.map(sec => <div key={sec.title}>
        <div className="nav-section">{sec.title}</div>
        {sec.pages.map(p => <button key={p.id} className={'nav ' + (page === p.id ? 'current' : '')}
          // The sidebar's Map is the unfiltered one.
          onClick={() => { if (p.id === 'map') setMapQuery(null); go(p.id); }}>{p.icon}{'   '}{p.label}</button>)}
      </div>)}
      {s.error && <div className="sidebar-error" title={s.error}>⚠ {s.error}</div>}
    </nav>
    {page === 'map'
      ? <main className="page map-page"><PetMap query={mapQuery} clearQuery={() => setMapQuery(null)} /></main>
      : <main className="page"><div className={'page-body ' + (page === 'analytics' ? 'wide' : '')}>
        {page === 'characters' ? <Characters /> : page === 'pets' ? <Pets openMap={openMap} />
          : page === 'analytics' ? <Analytics /> : page === 'notifications' ? <Notifications /> : <Capture />}
      </div></main>}
  </div>;
}

export const appTheme = AppTheme;
