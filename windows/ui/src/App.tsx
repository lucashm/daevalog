import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowRight, Bell, ChartColumn, Check, Coins, Crosshair, Flame, History, Home,
  Layers, Lock, Minus, PawPrint, Pin, Play, RotateCcw, Search, Settings, ShieldCheck, Signal, Skull,
  Sparkles, Square, Swords, Trophy, Users, Volume2, Wind, X } from 'lucide-react';
import { native, useCompanion, windowAction } from './bridge';
import { ODYLE_CAP, ago, analyticsRows, analyticsRuns, characterGroups, collectionRows, dayStart, deathBins, deathLanes,
  defaultWidgets, dpsView, duration, filterRuns, keyOf, kinaView, myNames, nextEvent, number, odyleFull, odyleNow,
  partyDpsBins, percent, played, playerShares, savedSkills, tickStep, DAMAGE_BIN_MS,
  type Combat, type Fight, type Group, type Lane, type Player, type Row, type Skill, type SortKey, type Widget, type WidgetId } from './model';
import petData from '../../../overlay/data/pets.json';

const pages = [
  { id: 'home', label: 'Overview', icon: Home },
  { id: 'combat', label: 'Combat meter', icon: Swords },
  { id: 'pvp', label: 'PvP', icon: Flame },
  { id: 'pets', label: 'Pet collection', icon: PawPrint },
  { id: 'overlays', label: 'Overlay studio', icon: Layers },
  { id: 'characters', label: 'Characters', icon: Users },
  { id: 'history', label: 'Fight history', icon: History },
  { id: 'analytics', label: 'Analytics', icon: ChartColumn },
  { id: 'alerts', label: 'Event alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;
const sections: Partial<Record<string, string>> = { combat: 'IN GAME', characters: 'YOUR JOURNEY' };
type Page = typeof pages[number]['id'];
type Companion = ReturnType<typeof useCompanion> & { go: (page: Page) => void; now: number };
const Context = createContext<Companion>(null!);
const useApp = () => useContext(Context);
const classes = import.meta.glob('../../../overlay/icons/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const classColors: Record<string, string> = { CLERIC: '#79b6ed', ASSASSIN: '#b29aee', GLADIATOR: '#e8b87c', CHANTER: '#72c9ac', SORCERER: '#bd92e1', RANGER: '#a9c77c' };
const iconFor = (job: string) => classes['../../../overlay/icons/' + job + '.png'];
function Button({ children, onClick, primary = false, disabled = false }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) {
  return <button className={'button ' + (primary ? 'primary' : '')} onClick={onClick} disabled={disabled}>{children}</button>;
}
function Switch({ label, on, change, disabled = false }: { label: string; on: boolean; change: (on: boolean) => void; disabled?: boolean }) {
  return <button className="switch" role="switch" aria-label={label} aria-checked={on} disabled={disabled} onClick={() => change(!on)} />;
}
function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{title && <div className="card-head"><h2>{title}</h2>{action}</div>}{children}</section>;
}
function Heading({ title, note, eyebrow, action }: { title: string; note: string; eyebrow: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{note}</p></div>{action}</div>;
}
function Stat({ label, value, note, icon: Icon }: { label: string; value: ReactNode; note: string; icon: typeof Activity }) {
  return <div className="stat"><div className="stat-label"><Icon size={12} />{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>;
}
function Empty({ title, note, children }: { title: string; note: string; children?: ReactNode }) {
  return <div className="empty full-empty"><div className="event-icon"><Crosshair size={23} /></div><h2>{title}</h2><p>{note}</p>{children}</div>;
}
function useClock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000); return () => clearInterval(timer); }, []);
  return now;
}
function send(command: Companion['command'], action: Record<string, unknown>) { void command(action).catch(() => {}); }
function connection(state: Combat, running: boolean, replay: boolean, complete = false) {
  if (replay) return running && !complete ? 'Replaying capture' : 'Replay finished';
  if (!running) return 'Capture stopped';
  if (state.capture?.locked) return 'Capturing game traffic';
  return state.capture?.gameRunning ? 'Finding game traffic' : 'Waiting for AION 2';
}

export default function App() {
  const companion = useCompanion();
  const [page, setPage] = useState<Page>(() => {
    const value = new URLSearchParams(location.search).get('page');
    return pages.some(p => p.id === value) ? value as Page : 'home';
  });
  const now = useClock();
  const search = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const go = (next: Page) => { setPage(next); const url = new URL(location.href); url.searchParams.set('page', next); history.replaceState(null, '', url); };
  const { snapshot: s, preferences: p, error } = companion;
  // The app was told to show a page (Ctrl+` in game opens Overlay studio).
  useEffect(() => { if (s.nav && pages.some(x => x.id === s.nav!.page)) go(s.nav.page as Page); }, [s.nav?.seq]);
  const status = connection(s.state, s.running, s.replay, s.replayComplete);
  const openSearch = () => { setQuery(''); search.current?.showModal(); search.current?.querySelector('input')?.focus(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, []);
  const windowCommand = (action: string) => { void windowAction(action).catch(e => companion.setError(String(e))); };
  return <Context.Provider value={{ ...companion, go, now }}>
    <div className="app selected-layout">
      <header className="titlebar" onMouseDown={e => { if (e.button === 0 && !(e.target as HTMLElement).closest('button')) windowCommand('drag'); }}>
        <div className="brand"><span className="brand-mark"><Wind size={19} /></span>Daevalog <small>/ AION 2</small></div>
        <div className="row"><span className="connection"><i className={'dot ' + (s.state.capture?.locked ? '' : 'off')} />{status}</span>
          <div className="row"><button className="window-button" aria-label="Minimize" onClick={() => windowCommand('minimize')}><Minus size={14} /></button><button className="window-button" aria-label="Maximize or restore" onClick={() => windowCommand('maximize')}><Square size={12} /></button><button className="window-button close" aria-label="Close to tray" onClick={() => windowCommand('hide')}><X size={15} /></button></div>
        </div>
      </header>
      {!native && <div className="preview-label">Browser preview · run the Windows application for capture, persistence and native overlays.</div>}
      {(error || s.error || s.state.capture?.error) && <div className="error-banner" role="alert"><Signal size={16} /><span>{error || s.error || s.state.capture?.error}</span><button onClick={() => go('settings')}>Open settings <ArrowRight size={13} /></button></div>}
      {s.notice && s.notice.expires > now && <div className="notice-banner" role="status"><Bell size={14} /> {s.notice.text}</div>}
      <div className="shell">
        <nav className="sidebar" aria-label="App navigation">
          {pages.map(({ id, label, icon: Icon }) => <div key={id}>
            {sections[id] && <div className="nav-section">{sections[id]}</div>}
            <button className={'nav-item ' + (page === id ? 'active' : '')} aria-label={label} aria-current={page === id ? 'page' : undefined} title={label} onClick={() => go(id)}><Icon size={17} /><span>{label}</span>{id === 'overlays' && <span className="badge">{p.widgets.filter(w => w.enabled).length}</span>}{id === 'pvp' && s.pvp.some(e => e.fought) && <span className="badge hot">{s.pvp.filter(e => e.fought).length}</span>}</button>
          </div>)}
          <div className="sidebar-foot"><div className="profile"><div className="avatar"><Wind size={20} /></div><div><b>{s.state.character || 'Your character'}</b><small>{s.pets ? 'Server ' + s.pets.server : 'Waiting for game data'}</small></div></div></div>
        </nav>
        <div className="workspace">
          <div className="toolbar"><span className="breadcrumb">Companion / <b>{pages.find(p => p.id === page)?.label}</b></span><button className="search-trigger" onClick={openSearch}><Search size={13} />Quick navigation <kbd>Ctrl K</kbd></button></div>
          <main className="main" key={page}>
            {page === 'home' ? <Overview /> : page === 'combat' ? <CombatPage /> : page === 'pvp' ? <PvpPage /> : page === 'pets' ? <PetsPage /> : page === 'overlays' ? <OverlayPage /> : page === 'characters' ? <CharactersPage /> : page === 'history' ? <HistoryPage /> : page === 'analytics' ? <AnalyticsPage /> : page === 'alerts' ? <AlertsPage /> : <SettingsPage />}
          </main>
        </div>
      </div>
      <footer className="status-strip"><span><Signal size={10} /> {s.state.pingMs != null ? s.state.pingMs + ' ms' : 'No latency reading'} · {s.replay ? 'Replay' : status}</span><span>Local-first · {p.overlayVisible ? 'Overlays on' : 'Overlays off'} · Close to tray / Quit from tray</span></footer>
    </div>
    <dialog className="search-modal" ref={search}><button className="close" aria-label="Close search" onClick={() => search.current?.close()}><X size={17} /></button><h2>Go anywhere</h2><input className="input" autoFocus aria-label="Search pages" placeholder="Search pages…" value={query} onChange={e => setQuery(e.target.value)} />{pages.filter(p => p.label.toLowerCase().includes(query.toLowerCase())).map(p => <button className="result" key={p.id} onClick={() => { search.current?.close(); go(p.id); }}><p.icon size={17} />{p.label}</button>)}</dialog>
  </Context.Provider>;
}

function BossBanner({ detail = false }: { detail?: boolean }) {
  const { snapshot: s, go } = useApp(), t = s.state.target;
  const hp = t && t.maxHp > 0 && t.currentHp >= 0 ? Math.min(100, Math.max(0, t.currentHp / t.maxHp * 100)) : null;
  return <div className="boss-banner"><div className="row spread"><div><span className={'tag ' + (s.state.capture?.locked ? 'green' : '')}>{connection(s.state, s.running, s.replay, s.replayComplete)}</span><h2>{t?.name || (s.state.players?.length ? 'Current encounter' : 'Your next encounter awaits')}</h2><p>{duration(s.state.battleTimeMs ?? 0)} elapsed · {s.state.players?.length ?? 0} players</p></div>{!detail && <Button primary onClick={() => go('combat')}><ArrowRight size={14} />Open combat</Button>}</div>{t && <><div className="boss-hp"><i style={{ width: hp == null ? '0%' : hp + '%' }} /></div><div className="row spread" style={{ marginTop: 7 }}><small>{hp == null ? 'Waiting for an HP reading' : 'Boss health · ' + hp.toFixed(1) + '%'}</small><small>{hp == null ? '' : number(t.currentHp) + ' / ' + number(t.maxHp)}</small></div></>}</div>;
}
function Party({ players, select, focused }: { players: Player[]; select?: (id: number) => void; focused?: number | null }) {
  const max = Math.max(1, ...players.map(p => p.damage));
  return <Card title="Party performance" action={<span className="tag accent">{players.length} players</span>}>{players.length ? players.map((p, i) => <button className="player player-button" key={p.id} disabled={!select} aria-pressed={focused === p.id} onClick={() => select?.(p.id)}>
    <span className="player-rank">{i + 1}</span><span className="player-name">{p.jobKey && iconFor(p.jobKey) && <img className="job-icon" src={iconFor(p.jobKey)} alt="" />}<span>{p.name}<small>{p.isLocal && <b style={{ color: 'var(--accent)' }}>YOU </b>}{p.combatPower ? 'CP ' + number(p.combatPower) : ''}{(p.deaths ?? 0) > 0 && <b className="deaths" title={p.deaths + (p.deaths === 1 ? ' death' : ' deaths')}> <Skull size={9} />{p.deaths}</b>}</small></span></span>
    <span className="player-bar" style={{ color: classColors[p.jobKey ?? ''] ?? '#78dbcc' }}><i style={{ width: p.damage / max * 100 + '%', background: classColors[p.jobKey ?? ''] ?? '#78dbcc' }} /><span>{number(p.damage)} · {p.job || 'Unknown class'}</span></span><span className="player-dps">{number(p.dps)}<small>DPS</small></span>
  </button>) : <p className="inline-note">Your party appears here when the game sends combat data.</p>}</Card>;
}
function SkillTable({ skills }: { skills: Skill[] }) {
  return skills.length ? <div className="table-wrap"><table className="table skill-table"><thead><tr><th>Skill</th><th>Damage</th><th>Hits</th><th>Crit</th><th>Back</th></tr></thead><tbody>{skills.map((s, i) => <tr key={(s.code ?? 'skill') + ':' + i}><td title={s.name}>{s.name}</td><td>{number(s.damage)}</td><td>{s.hits}</td><td>{s.isDot ? '–' : ((s.critRate ?? 0) * 100).toFixed(1) + '%'}</td><td>{s.isDot ? '–' : ((s.backRate ?? 0) * 100).toFixed(1) + '%'}</td></tr>)}</tbody></table></div> : <p className="inline-note">Select a player or deal damage to see the skill breakdown.</p>;
}
const events = [{ name: 'Shugo Festival', minute: 0, key: 'notifyShugo' as const, icon: Sparkles, note: 'Hourly · community schedule' },
  { name: 'Dimensional Invasion', minute: 30, key: 'notifyInvasion' as const, icon: Wind, note: 'Hourly · community schedule' }];
function Events({ compact = false }: { compact?: boolean }) {
  const { now, preferences: p, updatePreferences } = useApp();
  return <>{events.map(e => <div className="event" key={e.key}><span className="event-icon"><e.icon size={17} /></span><div><b>{e.name}</b><small>{e.note}</small></div><span className="time">{duration(nextEvent(now, e.minute) - now)}</span>{!compact && <Switch label={e.name + ' reminder'} on={p[e.key]} change={on => updatePreferences({ [e.key]: on })} />}</div>)}</>;
}
function Overview() {
  const { snapshot: s, preferences: p, go } = useApp(), players = s.state.players ?? [], me = players.find(p => p.isLocal);
  const allPets = Object.entries(petData.pets).filter(([, p]) => !p.unreleased);
  const collected = s.pets ? allPets.filter(([id]) => s.pets!.levels[id] >= 1).length : null;
  return <>
    <Heading title={s.state.character ? 'Welcome back, ' + s.state.character + '.' : 'Your companion in Atreia.'} note="A little clarity for your time in Atreia." eyebrow="YOUR COMPANION, IN SYNC" action={<Button onClick={() => go('overlays')}><Layers size={14} />Overlay studio</Button>} />
    <div className="stats"><Stat label="Your DPS" value={number(me?.dps)} note="Your current encounter" icon={Activity} /><Stat label="Party damage" value={number(players.reduce((n, p) => n + p.damage, 0))} note={players.length + ' players · damage dealt'} icon={Swords} /><Stat label="Pets collected" value={<>{collected ?? '—'} <em>/ {allPets.length}</em></>} note={s.pets ? 'Server ' + s.pets.server : 'Awaiting your collection'} icon={PawPrint} /><Stat label="Saved encounters" value={s.fights.length} note="Most recent 200 fights" icon={History} /></div>
    <BossBanner />
    <div className="grid two"><Party players={players} /><Card title="Coming up in Atreia" action={<button className="text-button" onClick={() => go('alerts')}>Manage <ArrowRight size={12} /></button>}><Events compact /><p className="inline-note">{[p.notifyShugo, p.notifyInvasion].filter(Boolean).length} reminders enabled · {p.eventLead} minutes before</p></Card></div>
    <div className="quick-actions">{[{ page: 'overlays', title: 'Make it your own', note: 'Arrange the widgets you see in game.', icon: Layers }, { page: 'pets', title: 'One soul closer', note: 'Find the next pet for your collection.', icon: PawPrint }, { page: 'history', title: 'Know your progress', note: 'Revisit your recent encounters.', icon: History }].map(q => <button className="quick" key={q.page} onClick={() => go(q.page as Page)}><q.icon size={19} /><b>{q.title} <ArrowRight size={12} /></b><small>{q.note}</small></button>)}</div>
  </>;
}
function CombatPage() {
  const { snapshot: s, command, go } = useApp(), players = s.state.players ?? [], skills = s.state.skills ?? [];
  const modes = [['allTargets', 'All targets'], ['bossTargets', 'Bosses'], ['lastHitByMe', 'My target']];
  return <>
    <Heading title="Combat meter" note="Every hit, a clearer picture." eyebrow="LIVE ENCOUNTER" action={<Button onClick={() => go('overlays')}><Layers size={14} />Overlay studio</Button>} />
    <div className="filters"><div className="segmented" aria-label="Target filter">{modes.map(([mode, label]) => <button disabled={!s.running} key={mode} className={(s.state.targetMode || 'bossTargets') === mode ? 'active' : ''} onClick={() => send(command, { action: 'target', mode })}>{label}</button>)}</div><span className="muted" style={{ fontSize: 10 }}>Party · {players.length} players</span><div style={{ marginLeft: 'auto' }}><Button disabled={!s.running} onClick={() => send(command, { action: 'reset' })}><RotateCcw size={13} />Save & reset</Button></div></div>
    {!players.length ? <Empty title={s.running ? 'Ready when you are.' : 'Capture is stopped.'} note={s.running ? 'Waiting for AION 2 and your character. Your party’s combat numbers will appear here.' : 'Start capture in Settings, or replay a saved pcap.'}><Button primary onClick={() => go('settings')}><Signal size={14} />Capture settings</Button></Empty> : <>
      <BossBanner detail /><div className="grid combat-grid"><Party players={players} focused={s.state.skillsOf} select={id => send(command, { action: 'focus', id })} /><Card title="Skill breakdown" action={<select className="input" aria-label="Player skill breakdown" value={s.state.skillsOf ?? ''} onChange={e => send(command, { action: 'focus', id: e.target.value === '' ? null : Number(e.target.value) })}><option value="">My skills</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}><SkillTable skills={skills} /></Card></div>
    </>}
    <div className="grid two" style={{ marginTop: 15 }}><KinaCard />{s.pvp.length > 0 ? <PvpCard limit={4} /> : <Card title="PvP"><p className="inline-note" style={{ marginTop: 0 }}>Enemy players show here while they are in range.</p></Card>}</div>
  </>;
}

function KinaCard() {
  const { snapshot: s, now } = useApp(), k = kinaView(s.kina, now);
  return <Card title="Kina while farming" action={<Coins size={15} />}>
    {k.recent ? <><div className="kina-rate">{k.perSecond < 10 ? k.perSecond.toFixed(1) : number(k.perSecond)}<small> kina/s</small></div>
      <div className="mini-metrics"><div><span>Counting</span><b>{duration(k.ms)}</b></div><div><span>This session</span><b>+{number(s.kina.gained)}</b></div><div><span>Per hour</span><b>{number(k.perHour)}</b></div></div>
      {s.kina.daily >= 0 && <><div className="row spread" style={{ marginTop: 14, fontSize: 10 }}><span className="muted">Daily gain limit · {number(s.kina.daily)} / 1M</span><span className={k.left <= 0 ? 'green' : 'muted'}>{k.left <= 0 ? 'Capped' : k.capInMs != null ? 'Cap in ~' + duration(k.capInMs) : 'Cap in –'}</span></div><div className="progress"><i style={{ width: Math.min(100, s.kina.daily / 10000) + '%' }} /></div></>}</>
      : <p className="inline-note" style={{ marginTop: 0 }}>Shows from your first kina pick-up, and goes 5 minutes after the last. Spending kina doesn’t lower the rate.{s.kina.balance >= 0 && <> Balance: {s.kina.balance.toLocaleString()}.</>}</p>}
  </Card>;
}

function EnemyRow({ e }: { e: import('./model').Enemy }) {
  const hasHp = e.hp >= 0 && e.maxHp > 0, fraction = hasHp ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
  const status = [e.targeted && 'target', e.hittingYou && 'hitting you'].filter(Boolean).join(' · ');
  return <div className={'enemy ' + (e.fought ? '' : 'dim')}>
    <div className="row spread"><span className="row" style={{ gap: 7, minWidth: 0 }}>{e.jobKey && iconFor(e.jobKey) && <img className="job-icon" src={iconFor(e.jobKey)} alt="" />}<b style={{ color: classColors[e.jobKey] ?? undefined, fontWeight: e.targeted ? 700 : 500 }}>{e.name}</b><small>{e.job}</small>{e.combatPower > 0 && <small className="accent">{number(e.combatPower)}</small>}</span>{status && <small className={e.hittingYou ? 'bad' : 'accent'}>{status}</small>}</div>
    <div className="enemy-hp"><i style={{ width: fraction * 100 + '%' }} /><span>{e.hp === 0 ? 'down' : hasHp ? number(e.hp) + ' / ' + number(e.maxHp) : 'HP unknown'}</span></div>
  </div>;
}
function PvpCard({ limit }: { limit?: number }) {
  const { snapshot: s, go } = useApp(), shown = limit ? s.pvp.slice(0, limit) : s.pvp;
  return <Card title="Enemies around you" action={limit ? <button className="text-button" onClick={() => go('pvp')}>All {s.pvp.length} <ArrowRight size={12} /></button> : <span className="tag accent">{s.pvp.length} in range</span>}>{shown.map(e => <EnemyRow key={e.id} e={e} />)}</Card>;
}
function PvpPage() {
  const { snapshot: s, preferences: p, go } = useApp(), fought = s.pvp.filter(e => e.fought).length;
  return <>
    <Heading title="Know who you’re facing." note="Your target, then whoever is hitting you, then those you traded hits with in the last minute, then the other side’s players in range (dimmed)." eyebrow="PVP" action={<Button onClick={() => go('overlays')}><Layers size={14} />{p.widgets.find(w => w.id === 'pvp')?.enabled ? 'PvP widget on' : 'Add the PvP widget'}</Button>} />
    <div className="stats"><Stat label="In range" value={s.pvp.length} note="Enemy players the game has shown you" icon={Users} /><Stat label="Fighting you" value={fought} note="Traded hits in the last minute" icon={Swords} /><Stat label="Hitting you now" value={s.pvp.filter(e => e.hittingYou).length} note="Hit you in the last 5 seconds" icon={Flame} /><Stat label="Strongest" value={number(Math.max(0, ...s.pvp.map(e => e.combatPower)) || null)} note="Combat power, when the game says" icon={Trophy} /></div>
    {s.pvp.length ? <PvpCard /> : <Empty title={s.running ? 'No enemies around.' : 'Capture is stopped.'} note={s.running ? 'Enemy players appear here as they come into range, the ones fighting you first.' : 'Start capture in Settings to see enemy players.'} />}
  </>;
}

function CharactersPage() {
  const { snapshot: s, now } = useApp(), info = s.characters, groups = characterGroups(info), playing = info?.playing ?? '';
  return <>
    <Heading title="Characters" note="Your characters, as the game last said. Combat power and gear score update at character select." eyebrow="YOUR JOURNEY" />
    {!groups.length ? <Empty title="No characters yet." note={s.running ? 'Log in to one with capture running.' : 'Start capture, then log in to a character.'} /> : groups.map(g => <Card key={g.server} title={g.server} action={<small>{g.list.length} {g.list.length === 1 ? 'character' : 'characters'}</small>} className="character-group">
      <div className="character-grid">{g.list.map(c => {
        const live = c.name === playing, basic = odyleNow(c, live, now), estimated = !!c.odyle && basic !== c.odyle.basic, full = odyleFull(basic, now);
        return <div className={'character ' + (live ? 'live' : '')} key={c.name}>
          <div className="row spread"><span className="row" style={{ gap: 10 }}>{c.jobKey && iconFor(c.jobKey) && <img className="job-icon big" src={iconFor(c.jobKey)} alt="" />}<span><b style={{ color: classColors[c.jobKey] ?? undefined }}>{c.name}</b><small>{[c.job, c.level ? 'level ' + c.level : ''].filter(Boolean).join(' · ') || 'Class not seen yet'}</small></span></span><small className={live ? 'green' : ''}>{live ? '● Playing now' : played(c) > 0 ? 'Played ' + ago(played(c), now) : ''}</small></div>
          <div className="mini-metrics"><div><span>Combat power</span><b>{c.combatPower > 0 ? c.combatPower.toLocaleString() : '—'}</b></div><div><span>Gear score</span><b>{c.gearScore > 0 ? c.gearScore.toLocaleString() : '—'}</b></div></div>
          <div className="odyle"><div className="row spread"><small>Odyle energy{c.odyle ? basic >= ODYLE_CAP ? ' · full' : ' · full ' + new Date(full).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</small>{c.odyle ? <span><b>{estimated ? '~' : ''}{basic}</b>{c.odyle.charged > 0 && <b className="accent"> (+{c.odyle.charged})</b>}<small>/{ODYLE_CAP}</small></span> : <small>not seen yet</small>}</div><div className="progress"><i style={{ width: (c.odyle ? Math.min(1, basic / ODYLE_CAP) * 100 : 0) + '%' }} /></div></div>
          <small className="character-foot">{live ? 'Live from the game' : c.lastSeen <= 0 ? 'Odyle is read once you play it' : 'Read ' + new Date(c.lastSeen).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (estimated ? ' · ~ Odyle estimated' : '')}</small>
        </div>;
      })}</div>
    </Card>)}
  </>;
}

/** A fight's minutes: a lane per player with a dot per death, or bars per slice. */
function Timeline({ title, spanMs, lanes = [], bins = [], binMs = DAMAGE_BIN_MS, describe, fmt = String, tone = 'bad', labels = false }: {
  title: string; spanMs: number; lanes?: Lane[]; bins?: number[]; binMs?: number; describe?: (v: number) => string; fmt?: (v: number) => string; tone?: 'bad' | 'accent';
  /** Keep the name column even without lanes, so stacked timelines share one time axis. */
  labels?: boolean;
}) {
  const [hover, setHover] = useState(''), box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(560);
  // Drawn at its real width, so labels keep their size in a narrow pane.
  useEffect(() => {
    const el = box.current; if (!el) return;
    const observer = new ResizeObserver(([e]) => setWidth(Math.max(160, Math.round(e.contentRect.width))));
    observer.observe(el); return () => observer.disconnect();
  }, []);
  const labelW = lanes.length || labels ? 86 : 0, track = width - labelW;
  const x = (ms: number) => labelW + track * Math.min(1, ms / Math.max(1, spanMs)), step = tickStep(spanMs, track), peak = Math.max(1, ...bins);
  const height = lanes.length * 18 + (bins.length ? 70 : 0) + 18;
  return <div className="timeline" ref={box}><small className={hover ? 'hover' : ''}>{hover || title}</small>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {lanes.map((l, i) => <g key={l.label + i} transform={`translate(0 ${i * 18 + 9})`}>
        <text x={0} y={4} className="lane-label" fill={classColors[l.jobKey ?? ''] ?? '#c9d6e3'} fontWeight={l.bold ? 700 : 400}>{l.label.length > 12 ? l.label.slice(0, 11) + '…' : l.label}</text>
        <line x1={labelW} x2={width} className="lane-line" />
        {l.ms.map((ms, j) => <circle key={j} cx={x(ms)} r={4.5} className={'dot-' + tone} onMouseEnter={() => setHover(l.label + ' died at ' + duration(ms))} onMouseLeave={() => setHover('')} />)}
      </g>)}
      {bins.length > 0 && <g transform={`translate(0 ${lanes.length * 18})`}>{bins.map((v, i) => {
        const h = v ? Math.max(2, 56 * v / peak) : 0, x0 = x(i * binMs), w = Math.max(1, x((i + 1) * binMs) - x0 - 1);
        return <g key={i} onMouseEnter={() => setHover(duration(i * binMs) + '–' + duration((i + 1) * binMs) + '  ·  ' + (describe ? describe(v) : fmt(v)))} onMouseLeave={() => setHover('')}>
          <rect x={x0} y={0} width={w} height={70} fill="transparent" /><rect x={x0} y={70 - h} width={w} height={h} rx={1.5} className={'bar-' + tone} style={{ opacity: .4 + .5 * v / peak }} />
        </g>;
      })}</g>}
      <g transform={`translate(0 ${lanes.length * 18 + (bins.length ? 70 : 0)})`}><line x1={labelW} x2={width} className="axis" />
        {Array.from({ length: Math.floor(spanMs / step) + 1 }, (_, i) => <g key={i} transform={`translate(${x(i * step)} 0)`}><line y2={4} className="axis" /><text y={14} textAnchor={i === 0 ? 'start' : 'middle'} className="tick">{duration(i * step)}</text></g>)}
      </g>
    </svg>
  </div>;
}

function FightTimelines({ fight, names }: { fight: Fight; names: string[] }) {
  const lanes = deathLanes(fight, names), dps = partyDpsBins(fight), deaths = lanes.reduce((n, l) => n + l.ms.length, 0);
  if (!dps.some(d => d > 0) && !lanes.length) return null;
  return <Card title="Over the fight" className="fight-timelines">
    {dps.some(d => d > 0) && <Timeline title="Party DPS over the fight" spanMs={fight.durationMs} bins={dps} fmt={v => number(v) + ' DPS'} tone="accent" labels={lanes.length > 0} />}
    <Timeline title={deaths ? 'Deaths in this fight · ' + deaths : 'No deaths in this fight'} spanMs={fight.durationMs} lanes={lanes} />
  </Card>;
}

const groupNames: Record<Group, string> = { player: 'Player', job: 'Class', boss: 'Boss', run: 'Run' };
type Column = { key: SortKey; title: string; fmt: (v: number, r: Row) => ReactNode; tone?: (v: number) => string };
const common: Column[] = [{ key: 'share', title: 'Share', fmt: v => percent(v) }, { key: 'critRate', title: 'Crit', fmt: v => percent(v) },
  { key: 'backRate', title: 'Back', fmt: v => percent(v) }, { key: 'active', title: 'Active', fmt: v => percent(v) },
  { key: 'healPs', title: 'Heal/s', fmt: v => v > 0 ? number(v) : '–' }, { key: 'takenPs', title: 'Taken/s', fmt: v => number(v) }];
const trend: Column = { key: 'trend', title: 'Trend', fmt: v => Number.isNaN(v) ? '–' : (v >= 0 ? '▲ ' : '▼ ') + Math.abs(v * 100).toFixed(0) + '%', tone: v => Number.isNaN(v) ? 'muted' : v >= 0 ? 'green' : 'bad' };
const columnsFor = (g: Group): Column[] => g === 'run'
  ? [{ key: 'start', title: 'Date', fmt: v => new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
    { key: 'durationMs', title: 'Time', fmt: v => duration(v) }, { key: 'avgDps', title: 'DPS', fmt: v => number(v) }, { key: 'count', title: 'Players', fmt: v => String(v) },
    ...common.filter(c => c.key !== 'share'), { key: 'deaths', title: 'Deaths', fmt: v => v > 0 ? String(v) : '–' }, { key: 'killed', title: 'Kill', fmt: v => v ? '✓' : '', tone: () => 'green' }]
  : [{ key: 'count', title: 'Runs', fmt: v => String(v) }, { key: 'avgDps', title: 'Avg DPS', fmt: v => number(v) }, { key: 'bestDps', title: 'Best DPS', fmt: v => number(v) },
    ...common, { key: 'deaths', title: 'Deaths', fmt: v => v.toFixed(1) }, { key: 'killRate', title: 'Kill %', fmt: v => percent(v) }, trend];
const ranges = [['all', 'All time'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['custom', 'Custom…']] as const;
const toInput = (ms: number) => ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';
const fromInput = (v: string, end = false) => { if (!v) return 0; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d + (end ? 1 : 0)).getTime() - (end ? 1 : 0); };

function AnalyticsPage() {
  const { snapshot: s, command, now } = useApp();
  const [group, setGroupState] = useState<Group>('player'), [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'avgDps', desc: true });
  const [range, setRange] = useState<string>('all'), [custom, setCustom] = useState({ from: 0, to: 0 });
  const [minMinutes, setMin] = useState(0), [killsOnly, setKills] = useState(false), [meOnly, setMe] = useState(false);
  const [filters, setFilters] = useState<Partial<Record<Group, string>>>({}), [selected, setSelected] = useState('');
  useEffect(() => { if (s.running) send(command, { action: 'history' }); }, [s.running]);
  const names = useMemo(() => myNames(s.characters, s.state.character), [s.characters, s.state.character]);
  const runs = useMemo(() => analyticsRuns(s.fights, names), [s.fights, names]);
  const span = range === 'all' ? { from: 0, to: 0 } : range === 'today' ? { from: dayStart(now), to: 0 } : range === 'custom' ? custom : { from: dayStart(now, Number(range) - 1), to: 0 };
  const filtered = useMemo(() => filterRuns(runs, { ...span, minMinutes, killsOnly, meOnly, filters }), [runs, span.from, span.to, minMinutes, killsOnly, meOnly, filters]);
  const rows = useMemo(() => analyticsRows(filtered, group, sort.key, sort.desc), [filtered, group, sort]);
  const sel = rows.find(r => r.key === selected) ?? rows.find(r => r.isMe) ?? rows[0] ?? null;
  const other: Group = group === 'player' ? 'boss' : 'player', columns = columnsFor(group);
  const setGroup = (g: Group) => { setGroupState(g); setSort({ key: g === 'run' || g === 'boss' ? 'start' : 'avgDps', desc: true }); setSelected(''); };
  const sortBy = (key: SortKey) => setSort(sort.key === key ? { key, desc: !sort.desc } : { key, desc: key !== 'label' });
  const narrow = (g: Group, value: string | undefined) => { const f = { ...filters }; if (value === undefined) delete f[g]; else f[g] = value; setFilters(f); setSelected(''); };
  const label = (g: Group, value: string) => groupNames[g] + ': ' + (g === 'job' ? runs.find(r => r.jobKey === value)?.job ?? value : value);
  const dps = dpsView(sel), deaths = sel && group === 'boss' ? deathBins(sel) : null;
  const runFight = sel && group === 'run' ? s.fights.find(f => f.id === sel.key) : undefined;
  const best = sel ? analyticsRows(sel.runs, other, 'bestDps', true).slice(0, 6) : [];
  return <>
    <Heading title="Your runs, side by side." note="Every saved fight, grouped by player, class or boss, or one row per run. Click a row for its runs; narrow to it to break it down further." eyebrow="ANALYTICS" action={<Button disabled={!s.running} onClick={() => send(command, { action: 'history' })}><RotateCcw size={13} />Refresh</Button>} />
    <div className="filters">
      <div className="segmented" aria-label="Group by">{(Object.keys(groupNames) as Group[]).map(g => <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>{groupNames[g]}</button>)}</div>
      <select className="input" aria-label="Date range" value={range} onChange={e => { setRange(e.target.value); if (e.target.value === 'custom' && !custom.from) setCustom({ from: dayStart(now, 6), to: 0 }); }}>{ranges.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      {range === 'custom' && <><input className="input" type="date" aria-label="From" value={toInput(custom.from)} max={toInput(custom.to || now)} onChange={e => setCustom({ ...custom, from: fromInput(e.target.value) })} /><span className="muted">to</span><input className="input" type="date" aria-label="To" value={toInput(custom.to)} min={toInput(custom.from)} onChange={e => setCustom({ ...custom, to: fromInput(e.target.value, true) })} /></>}
      <select className="input" aria-label="Shortest run" value={minMinutes} onChange={e => setMin(Number(e.target.value))}>{[0, 1, 2, 5, 10].map(m => <option key={m} value={m}>{m ? 'Runs ≥ ' + m + ' min' : 'Any length'}</option>)}</select>
      <label className="check"><Switch label="Kills only" on={killsOnly} change={setKills} />Kills only</label>
      <label className="check"><Switch label="My characters only" on={meOnly} change={setMe} disabled={!names.length} />Me</label>
      {(Object.keys(filters) as Group[]).map(g => <button key={g} className="tag accent chip" onClick={() => narrow(g, undefined)}>{label(g, filters[g]!)} <X size={10} /></button>)}
      <span className="muted" style={{ marginLeft: 'auto', fontSize: 10 }}>{filtered.length} entries · {new Set(filtered.map(r => r.fightId)).size} fights</span>
    </div>
    {!runs.length ? <Empty title="Nothing to compare yet." note={s.running ? 'Boss fights are saved as they end; they line up here.' : 'Start capture to load your saved fights.'} /> : !rows.length ? <Empty title="No runs match." note="Widen the date range or clear a filter." /> :
      <div className="analytics-layout">
        <div className="card table-wrap analytics-table"><table className="table"><thead><tr><th><button className={'sort ' + (sort.key === 'label' ? 'on' : '')} onClick={() => sortBy('label')}>{groupNames[group]}</button></th>{columns.map(c => <th key={c.key} className="num"><button className={'sort ' + (sort.key === c.key ? 'on' : '')} onClick={() => sortBy(c.key)}>{c.title}{sort.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}</button></th>)}</tr></thead>
          <tbody>{rows.map(r => <tr key={r.key} className={'clickable ' + (sel?.key === r.key ? 'picked' : '')} onClick={() => setSelected(r.key)}>
            <td><span className="row" style={{ gap: 7 }}>{r.jobKey && iconFor(r.jobKey) && <img className="job-icon" src={iconFor(r.jobKey)} alt="" />}<span style={{ color: r.jobKey ? classColors[r.jobKey] : undefined, fontWeight: r.isMe ? 700 : 500 }}>{group === 'run' ? r.label : r.label || '—'}</span></span></td>
            {columns.map(c => { const v = r[c.key] as number; return <td key={c.key} className={'num ' + (c.tone?.(v) ?? '')}>{c.fmt(v, r)}</td>; })}
          </tr>)}</tbody></table></div>
        {sel && <aside className="card analytics-pane">
          <div className="card-head"><h2>{group === 'run' ? sel.label + ' · ' + new Date(sel.start).toLocaleDateString() : sel.label || '—'}</h2>{group !== 'run' && !filters[group] && <button className="text-button" onClick={() => narrow(group, sel.key)}>Narrow to it <ArrowRight size={12} /></button>}</div>
          <div className="mini-metrics" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}><div><span>{group === 'run' ? 'Party DPS' : 'Avg DPS'}</span><b>{number(sel.avgDps)}</b></div><div><span>Best</span><b>{number(sel.bestDps)}</b></div><div><span>{group === 'run' ? 'Players' : 'Runs'}</span><b>{sel.count}</b></div><div><span>Kill %</span><b>{percent(sel.killRate)}</b></div></div>
          {dps && <Timeline title={(group !== 'boss' ? 'DPS' : meOnly ? 'Your DPS' : 'Party DPS') + ' over the fight' + (dps.runs > 1 ? ' · average of ' + dps.runs + ' runs' : '')} spanMs={dps.spanMs} bins={dps.bins} binMs={dps.binMs} fmt={v => number(v) + ' DPS'} tone="accent" labels={!!runFight && deathLanes(runFight, names).length > 0} />}
          {runFight &&<Timeline title={deathLanes(runFight, names).length ? 'Deaths in this run' : 'No deaths in this run'} spanMs={runFight.durationMs} lanes={deathLanes(runFight, names)} />}
          {deaths && <Timeline title={deaths.total ? 'When deaths happen · ' + deaths.total + ' in ' + deaths.runs + (deaths.runs === 1 ? ' run' : ' runs') : 'No deaths in these runs'} spanMs={deaths.spanMs} bins={deaths.total ? deaths.bins : []} binMs={deaths.binMs} describe={v => v + (v === 1 ? ' death' : ' deaths') + ' in ' + deaths.runs + (deaths.runs === 1 ? ' run' : ' runs')} />}
          {group !== 'run' && <><h3 className="pane-label">Best by {groupNames[other].toLowerCase()}</h3>{best.map(b => <div className="best-row" key={b.key}><span>{b.label}</span><small>{b.count} {b.count === 1 ? 'run' : 'runs'}</small><b>{number(b.bestDps)}</b></div>)}</>}
          {group === 'run' && <><h3 className="pane-label">Party</h3>{[...sel.runs].sort((a, b) => b.dps - a.dps).map(r => <div className="best-row" key={r.player}><span style={{ color: classColors[r.jobKey] ?? undefined, fontWeight: r.isMe ? 700 : 400 }}>{r.player}</span><small>{percent(r.share)}{r.deaths ? ' · ' + r.deaths + ' ✝' : ''}</small><b>{number(r.dps)}</b></div>)}</>}
          {group === 'player' && sel.runs[sel.runs.length - 1].gearScore > 0 && <p className="inline-note">Latest gear score {sel.runs[sel.runs.length - 1].gearScore.toLocaleString()}{sel.runs[sel.runs.length - 1].combatPower ? ' · CP ' + number(sel.runs[sel.runs.length - 1].combatPower) : ''}</p>}
          {group !== 'run' && <p className="inline-note">{keyOf(sel.runs[0], group) && 'Last seen ' + new Date(sel.start).toLocaleString()}</p>}
        </aside>}
      </div>}
  </>;
}

function PetsPage() {
  const { snapshot: s, preferences: p, updatePreferences } = useApp();
  const [search, setSearch] = useState(''), [genus, setGenus] = useState('all'), [filter, setFilter] = useState('needed'), [page, setPage] = useState(0);
  const rows = useMemo(() => collectionRows(petData.pets, s.pets, p.petPhase), [s.pets, p.petPhase]);
  const filtered = rows.filter(r => (genus === 'all' || r.genus === genus) && (filter === 'all' || filter === 'pinned' ? filter === 'all' || p.pinnedPets.includes(r.id) : !s.pets || r.needed) && (r.name.toLowerCase().includes(search.toLowerCase()) || r.drops.some(d => d.npc.toLowerCase().includes(search.toLowerCase())))).sort((a, b) => a.remaining - b.remaining || a.name.localeCompare(b.name));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 40) - 1));
  const toggle = (id: string) => updatePreferences({ pinnedPets: p.pinnedPets.includes(id) ? p.pinnedPets.filter(x => x !== id) : [...p.pinnedPets, id] });
  const collected = s.pets ? rows.filter(r => r.level >= 1).length : null;
  return <>
    <Heading title="A growing collection." note="Your pets, your progress, your next little victory." eyebrow="PET COLLECTION" action={<span className="tag accent">{p.pinnedPets.length} pinned for farming</span>} />
    <div className="stats"><Stat label="Collected" value={<>{collected ?? '—'} <em>/ {rows.length}</em></>} note={s.pets ? 'Server ' + s.pets.server : 'Awaiting game data'} icon={PawPrint} />{[1, 2, 3].map(l => <Stat key={l} label={'Level ' + l} value={s.pets ? rows.filter(r => r.level >= l).length : '—'} note="Pets at or above this level" icon={l === 3 ? ShieldCheck : Wind} />)}</div>
    {!s.pets && <p className="inline-note" style={{ marginBottom: 15 }}>Collection progress has not arrived yet. Log in or use a Kibelisk teleport with capture running. The catalog below is reference data.</p>}
    <div className="pet-layout"><aside className="card pet-filter"><h3>Farm toward</h3>{[1, 2, 3].map(l => <label key={l}><input type="radio" name="phase" checked={p.petPhase === l} onChange={() => updatePreferences({ petPhase: l })} />Level {l}</label>)}<hr /><h3>Genus insight</h3>{['all', 'cogni', 'fera', 'natura', 'varian', 'special'].map(g => <label key={g} style={{ textTransform: 'capitalize' }}><input type="radio" name="genus" checked={genus === g} onChange={() => { setGenus(g); setPage(0); }} />{g === 'all' ? 'All genuses' : g}</label>)}<hr /><p className="inline-note">Collect every pet first, then work toward the next level. Estimated levels are marked until the game confirms them.</p></aside>
    <div><div className="pet-toolbar"><input className="input" type="search" value={search} aria-label="Search pets or monsters" placeholder="Search pets or monsters…" onChange={e => { setSearch(e.target.value); setPage(0); }} /><select className="input" aria-label="Collection filter" value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }}><option value="needed">Needed for Lv. {p.petPhase}</option><option value="all">All pets</option><option value="pinned">Pinned pets</option></select></div>
      <div className="card table-wrap" style={{ padding: '6px 10px' }}><table className="table"><thead><tr><th>Pet</th><th>Level</th><th>Souls left</th><th className="region-col">Find in</th><th>Pin</th></tr></thead><tbody>{filtered.slice(currentPage * 40, currentPage * 40 + 40).map(r => <tr key={r.id}><td><div className="pet-name"><span className={'pet-orb ' + r.genus}><PawPrint size={15} /></span><div>{r.name}<small className="pet-genus" style={{ display: 'block', marginTop: 3 }}>{r.genus}</small></div></div></td><td>{s.pets ? 'Lv. ' + r.level : '—'}{r.estimated && <small> Est.</small>}</td><td>{s.pets ? number(r.remaining) : '—'}<div className="progress"><i style={{ width: (r.next ? Math.min(100, r.points / r.next * 100) : s.pets ? 100 : 0) + '%' }} /></div></td><td className="region-col muted" title={r.drop?.npc}>{r.drop?.region || 'Collection / special'}</td><td><button className={'icon-button ' + (p.pinnedPets.includes(r.id) ? 'selected' : '')} aria-label={(p.pinnedPets.includes(r.id) ? 'Unpin ' : 'Pin ') + r.name} aria-pressed={p.pinnedPets.includes(r.id)} onClick={() => toggle(r.id)}><Pin size={13} /></button></td></tr>)}</tbody></table>{!filtered.length && <p className="inline-note" style={{ padding: 20 }}>No pets match these filters.</p>}</div>
      <div className="pager"><span>{filtered.length} pets · {s.pets ? filtered.reduce((n, r) => n + r.remaining, 0).toLocaleString() + ' souls to Lv. ' + p.petPhase : 'Progress unknown'}</span><div className="row"><Button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ArrowLeft size={12} /></Button><span>{currentPage + 1} / {Math.max(1, Math.ceil(filtered.length / 40))}</span><Button disabled={(currentPage + 1) * 40 >= filtered.length} onClick={() => setPage(currentPage + 1)}><ArrowRight size={12} /></Button></div></div>
    </div></div>
  </>;
}

const widgetInfo: Record<WidgetId, { label: string; icon: typeof Activity; width: number; height: number }> = {
  meter: { label: 'Damage meter', icon: Activity, width: 27, height: 28 },
  boss: { label: 'Boss health', icon: Crosshair, width: 32, height: 12 },
  ping: { label: 'Latency', icon: Signal, width: 12, height: 10 },
  alert: { label: 'Event reminders', icon: Bell, width: 29, height: 13 },
  pvp: { label: 'PvP', icon: Flame, width: 25, height: 26 },
  kina: { label: 'Kina/s', icon: Coins, width: 24, height: 11 },
};
function OverlayPage() {
  const { snapshot: s, preferences: p, updatePreferences, command, now } = useApp();
  const canvas = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Widget | null>(null);
  const [opacityDraft, setOpacity] = useState<number | null>(null), [scaleDraft, setScale] = useState<number | null>(null);
  const opacity = opacityDraft ?? p.opacity, scale = scaleDraft ?? p.scale;
  const move = (widget: Widget, clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect(), info = widgetInfo[widget.id];
    return { ...widget, x: Math.max(0, Math.min(1, (clientX - rect.left) / (rect.width * (1 - info.width / 100)))), y: Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height * (1 - info.height / 100)))) };
  };
  const saveWidget = (widget: Widget) => updatePreferences({ widgets: p.widgets.map(w => w.id === widget.id ? widget : w) });
  return <>
    <Heading title="Your game. Your layout." note="Arrange native widgets, then lock them to pass clicks through to the game." eyebrow="OVERLAY STUDIO" action={<Button onClick={() => updatePreferences({ widgets: defaultWidgets })}><RotateCcw size={13} />Reset layout</Button>} />
    <div className="overlay-actions"><Switch label="Show native overlays" on={p.overlayVisible} change={overlayVisible => updatePreferences({ overlayVisible })} /><span className="muted" style={{ fontSize: 11 }}>Show overlays</span><span className="tag accent">{p.widgets.filter(w => w.enabled).length} widgets</span><div style={{ marginLeft: 'auto' }}><Button disabled={!p.overlayVisible || !s.overlayHotkey} onClick={() => send(command, { action: 'lockOverlay', locked: !s.overlayLocked })}><Lock size={13} />{s.overlayLocked ? 'Unlock overlays' : 'Lock / click-through'}</Button></div></div>
    <div className="overlay-layout"><div className="canvas" ref={canvas} aria-label="Overlay positioning canvas">
      {p.widgets.filter(w => w.enabled).map(widget => {
        const w = drag?.id === widget.id ? drag : widget, info = widgetInfo[w.id];
        return <div key={w.id} className="widget" role="group" tabIndex={0} aria-label={info.label + ' widget, drag or use arrow keys to move'}
          style={{ left: w.x * (100 - info.width) + '%', top: w.y * (100 - info.height) + '%', width: info.width + '%', height: info.height + '%', opacity: opacity / 100 }}
          onPointerDown={e => { const rect = e.currentTarget.getBoundingClientRect(); e.currentTarget.dataset.dx = String(e.clientX - rect.left); e.currentTarget.dataset.dy = String(e.clientY - rect.top); e.currentTarget.setPointerCapture(e.pointerId); setDrag(w); }}
          onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setDrag(move(w, e.clientX - Number(e.currentTarget.dataset.dx), e.clientY - Number(e.currentTarget.dataset.dy))); }}
          onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) { e.currentTarget.releasePointerCapture(e.pointerId); if (drag) saveWidget(drag); setDrag(null); } }}
          onKeyDown={e => { const d: Record<string, [number, number]> = { ArrowLeft: [-.01, 0], ArrowRight: [.01, 0], ArrowUp: [0, -.01], ArrowDown: [0, .01] }; if (d[e.key]) { e.preventDefault(); saveWidget({ ...w, x: Math.max(0, Math.min(1, w.x + d[e.key][0])), y: Math.max(0, Math.min(1, w.y + d[e.key][1])) }); } }}>
          <strong><info.icon size={12} /> {info.label}</strong>{w.id === 'meter' ? (s.state.players?.slice(0, 3).map(p => <div key={p.id} className="mini-bar" title={p.name} style={{ width: Math.max(5, p.share ?? 0) * 2 + '%' }} />) || <small>Waiting for combat</small>) : w.id === 'boss' ? <><small>{s.state.target?.name || 'Waiting for a target'}</small><div className="mini-bar" /></> : w.id === 'ping' ? <small>{s.state.pingMs ?? '—'} ms</small> : w.id === 'pvp' ? (s.pvp.length ? s.pvp.slice(0, 3).map(e => <div key={e.id}><small>{e.name}</small><div className="mini-bar pvp" style={{ width: (e.maxHp > 0 && e.hp >= 0 ? Math.max(5, e.hp / e.maxHp * 100) : 5) + '%' }} /></div>) : <small>Shows while enemies are around</small>) : w.id === 'kina' ? <small>{kinaView(s.kina, now).recent ? number(kinaView(s.kina, now).perSecond) + ' kina/s' : 'Shows while you farm'}</small> : <small>{s.notice?.text || 'Your reminders appear here'}</small>}
        </div>;
      })}<span className="canvas-hint">Primary display anchors · layout saved on this PC</span>
    </div><aside className="card overlay-settings"><div className="card-head"><h2>On this layout</h2><Layers size={14} /></div>{p.widgets.map(w => <div className="setting-row" key={w.id}><span>{widgetInfo[w.id].label}</span><Switch label={widgetInfo[w.id].label} on={w.enabled} change={enabled => saveWidget({ ...w, enabled })} /></div>)}
      <div className="range-row">Opacity<div className="row"><input aria-label="Overlay opacity" type="range" min="30" max="100" value={opacity} onChange={e => setOpacity(Number(e.target.value))} onPointerUp={() => { updatePreferences({ opacity }); setOpacity(null); }} onKeyUp={() => { updatePreferences({ opacity }); setOpacity(null); }} /><output>{opacity}%</output></div></div>
      <div className="range-row">Widget scale<div className="row"><input aria-label="Widget scale" type="range" min="75" max="150" step="5" value={scale} onChange={e => setScale(Number(e.target.value))} onPointerUp={() => { updatePreferences({ scale }); setScale(null); }} onKeyUp={() => { updatePreferences({ scale }); setScale(null); }} /><output>{scale}%</output></div></div>
      <p className="inline-note">In game: <kbd className="kbd">Ctrl+`</kbd> opens this studio with the widgets unlocked, <kbd className="kbd">Alt+`</kbd> hides or shows them (` is the key under Esc). <kbd className="kbd">Ctrl+Alt+M</kbd> unlocks click-through. {p.overlayVisible && !s.overlayHotkey ? 'Waiting for the overlay shortcut to register.' : 'Click-through starts unlocked every launch.'}</p>
    </aside></div><p className="inline-note">Use borderless or windowed game mode. Drag native widget headers while unlocked; use this studio to save anchors on the main display.</p>
  </>;
}

function HistoryPage() {
  const { snapshot: s, command } = useApp(), [selected, setSelected] = useState<string | null>(null), [actor, setActor] = useState<number | null>(null);
  const fight = selected && s.fight?.summary.id === selected ? s.fight : null;
  const focused = actor ?? fight?.summary.players[0]?.id ?? 0;
  const names = useMemo(() => myNames(s.characters, s.state.character), [s.characters, s.state.character]);
  return <>
    <Heading title="Every encounter tells a story." note="Saved on your PC. Ready when you want a closer look." eyebrow="FIGHT HISTORY" action={<Button disabled={!s.running} onClick={() => send(command, { action: 'history' })}><RotateCcw size={13} />Refresh</Button>} />
    {selected ? <><button className="history-back" onClick={() => setSelected(null)}><ArrowLeft size={14} />All encounters</button>{fight ? <><Heading title={fight.summary.bossName || 'Encounter'} eyebrow={fight.summary.killed ? 'CLEARED' : 'ENCOUNTER'} note={new Date(fight.summary.startTimeMs).toLocaleString() + ' · ' + duration(fight.summary.durationMs)} /><div className="grid combat-grid"><Party players={playerShares(fight.summary.players)} select={setActor} focused={focused} /><Card title="Skill breakdown"><SkillTable skills={savedSkills(fight.skills, focused, fight.summary.durationMs)} /></Card></div><FightTimelines fight={fight.summary} names={names} /></> : <Empty title="Loading encounter…" note="Reading the saved fight from the capture daemon." />}</> :
      s.fights.length ? <Card title="Recent encounters" action={<small>Top DPS</small>}>{s.fights.map(f => <button className="history-row" key={f.id} disabled={!s.running} onClick={() => { setSelected(f.id); setActor(null); send(command, { action: 'fight', id: f.id }); }}><span className="event-icon"><Swords size={15} /></span><span><b>{f.bossName || 'Encounter'}</b><small>{new Date(f.startTimeMs).toLocaleString()} · {f.players.length} players</small></span><span className={'tag ' + (f.killed ? 'green' : '')}>{f.killed ? 'Cleared' : 'Not cleared'}</span><span className="duration muted">{duration(f.durationMs)}</span><span className="right">{number(f.players.length ? Math.max(...f.players.map(p => p.dps)) : null)}</span></button>)}</Card> :
      <Empty title="Your story starts here." note="Boss encounters are saved automatically as they end. Start capture to load your saved history." />}
  </>;
}
function AlertsPage() {
  const { preferences: p, updatePreferences, command } = useApp();
  return <>
    <Heading title="Never miss the moment." note="A gentle reminder before your next adventure." eyebrow="EVENT ALERTS" action={<Button onClick={() => send(command, { action: 'testAlert' })}><Bell size={14} />Send test alert</Button>} />
    <div className="filters"><span className="tag accent">Hourly events</span><span className="muted" style={{ fontSize: 11 }}>Remind me</span><select className="input" aria-label="Reminder lead time" value={p.eventLead} onChange={e => updatePreferences({ eventLead: Number(e.target.value) })}>{[1, 3, 5, 10].map(n => <option key={n} value={n}>{n} minutes before</option>)}</select></div>
    <Card className="alert-table"><Events /><div className="setting-row"><span><Volume2 size={14} /> Play system reminder sound</span><Switch label="Play reminder sound" on={p.sound} change={sound => updatePreferences({ sound })} /></div><div className="setting-row"><span><Layers size={14} /> Show native overlay reminders</span><Switch label="Show native overlays" on={p.overlayVisible} change={overlayVisible => updatePreferences({ overlayVisible })} /></div></Card>
    <p className="community-note">Schedules follow the existing Linux companion’s hourly community timers (:00 / :30, UTC-aligned). These are not an official server feed. Automatic reminders run while the game is open; test alerts work at any time. Nearby cube notices come from captured game data.</p>
  </>;
}
function SettingsPage() {
  const { snapshot: s, preferences: p, updatePreferences, command } = useApp();
  const [ifaceDraft, setIface] = useState<string | null>(null), [replay, setReplay] = useState('');
  const iface = ifaceDraft ?? p.iface;
  return <>
    <Heading title="A companion that fits." note="A few thoughtful controls, right where you need them." eyebrow="PREFERENCES" />
    <div className="grid settings-grid"><Card title="Game & capture" action={<Signal size={16} />}><span className={'tag ' + (s.running ? 'green' : '')}>{connection(s.state, s.running, s.replay, s.replayComplete)}</span><p>Network adapter</p><select className="input" aria-label="Capture network adapter" value={iface} onChange={e => setIface(e.target.value)}><option value="">Automatic · default IPv4 route</option>{s.adapters.map(a => <option key={a.name} value={a.name}>{a.description || a.name} {a.addresses.join(', ')}</option>)}</select><p>For a VPN, choose the adapter carrying your game traffic. Npcap must be installed separately in WinPcap API-compatible mode.</p><div className="row wrap"><Button disabled={!native} onClick={() => send(command, { action: 'refreshAdapters' })}>Refresh adapters</Button><Button primary disabled={!native} onClick={() => { updatePreferences({ iface }); }}><Check size={13} />Save adapter</Button><Button primary disabled={!native} onClick={() => send(command, { action: 'start', replay: null })}><Play size={13} />{s.running ? 'Restart capture' : 'Start capture'}</Button>{s.running && <Button onClick={() => send(command, { action: 'stop' })}>Stop capture</Button>}</div><p>Save a changed adapter before starting capture.</p></Card>
    <Card title="Window & reminders" action={<Settings size={16} />}><div className="setting-row"><span>Start capture when Daevalog opens</span><Switch label="Start capture automatically" on={p.autoStart} change={autoStart => updatePreferences({ autoStart })} /></div><div className="setting-row"><span>Show native overlays</span><Switch label="Show native overlays" on={p.overlayVisible} change={overlayVisible => updatePreferences({ overlayVisible })} /></div><div className="setting-row"><span>Reminder sound</span><Switch label="Reminder sound preference" on={p.sound} change={sound => updatePreferences({ sound })} /></div><p>Closing the companion hides it to the tray while capture and widgets continue. Choose Quit in the tray menu to save and stop everything.</p><Button onClick={() => { void windowAction('quit'); }}>Quit Daevalog</Button></Card>
    <Card title="Replay a capture" action={<Play size={16} />}><p>Replay a .pcap file through the same Rust parser. Your live capture is stopped before replay starts.</p><input className="input" aria-label="Pcap file path" placeholder="C:\Captures\encounter.pcap" value={replay} onChange={e => setReplay(e.target.value)} /><Button disabled={!native || !replay.trim()} onClick={() => send(command, { action: 'start', replay: replay.trim() })}><Play size={13} />Start replay</Button><p>Clear the replay path and use Start capture above to return to the game.</p></Card>
    <Card title="Local by design" action={<ShieldCheck size={16} />}><p>Your combat data and pet collection stay on this PC. The Rust daemon handles packet decoding and aggregation; the companion receives only its compact state.</p><h3>Data and logs</h3><p style={{ overflowWrap: 'anywhere' }}>{s.dataDir || 'Available in the Windows app'}<br />Preferences: companion.json · Capture log: capture.log</p><p>Daevalog 0.1 · Tauri / React companion · Native Rust overlays</p></Card></div>
  </>;
}
