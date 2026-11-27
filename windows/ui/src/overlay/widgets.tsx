// The widgets over the game, as the Linux overlay draws them: DpsMeter,
// SkillBreakdown, BossBar, StatusPill, PetFarm, KinaRate and PvpPanel.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, type ReactNode } from 'react';
import { send } from '../bridge';
import { maxLevel, needed, petName, pets as petCatalog, soulsLeft } from '../petData';
import { alpha, classIcon, compact, duration, genusColor, jobColor, percent, Theme } from '../theme';
import { usePortraits } from '../portraits';
import { Panel, T, useOverlay, Widget } from './frame';

// ── what the Linux MeterClient derives from the daemon's state ──
export function useClient() {
  const { s } = useOverlay();
  const state = s.state;
  const players: any[] = state?.players ?? [];
  return {
    connected: s.running,
    state,
    players,
    skills: (state?.skills ?? []) as any[],
    target: state?.target ?? null,
    capture: state?.capture ?? null,
    totalDps: players.reduce((t, p) => t + p.dps, 0),
    totalDamage: players.reduce((t, p) => t + p.damage, 0),
    totalDeaths: players.reduce((t, p) => t + (p.deaths || 0), 0),
  };
}

const num = { fontVariantNumeric: 'tabular-nums' } as const;

// ── small controls ──

/** A small toggle/button (Chip.qml). */
export function Chip({ label, checked = false, onClick }: { label: string; checked?: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return <button data-click onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
    border: '1px solid ' + (checked ? 'transparent' : Theme.panelEdge), borderRadius: 999,
    padding: `${Theme.pad / 2}px ${Theme.pad}px`, cursor: 'pointer', font: 'inherit', fontSize: Theme.fontSmall,
    background: checked ? Theme.accent : hover ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)',
    color: checked ? '#1b1b1b' : Theme.text,
  }}>{label}</button>;
}

/** Damage | DPS | Both: which numbers a player list shows (MetricSwitch.qml). */
export function MetricSwitch({ value, picked }: { value: string; picked: (m: string) => void }) {
  return <span style={{ display: 'inline-flex', gap: 2 }}>
    {[['damage', 'Damage'], ['dps', 'DPS'], ['both', 'Both']].map(([v, l]) => <Chip key={v} label={l} checked={value === v} onClick={() => picked(v)} />)}
  </span>;
}

/** The ✕ that closes a notification (CloseX.qml). */
export function CloseX({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return <span data-click onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    style={{ width: 16, textAlign: 'right', alignSelf: 'flex-start', cursor: 'pointer', fontSize: Theme.fontSmall, color: hover ? Theme.text : Theme.dim, padding: 6, margin: -6 }}>✕</span>;
}

function ClassIcon({ jobKey, size = 16 }: { jobKey?: string; size?: number }) {
  const src = classIcon(jobKey);
  return <span style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center', flexShrink: 0 }}>
    {src ? <img src={src} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />
      // Unknown class: the old colour stripe.
      : <span style={{ width: 4, height: 12, borderRadius: 2, background: jobColor(jobKey) }} />}
  </span>;
}

/** A bar's fill, behind its row. */
function Fill({ fraction, color, radius = 4 }: { fraction: number; color: string; radius?: number }) {
  return <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `max(2px, ${Math.min(1, Math.max(0, fraction)) * 100}%)`, borderRadius: radius, background: color, transition: 'width 180ms cubic-bezier(.33,1,.68,1)' }} />;
}

/** Text over a bar, outlined so it reads over both halves. */
function BarText({ children }: { children: ReactNode }) {
  return <span style={{ position: 'relative', fontSize: Theme.fontSmall, color: Theme.text, ...num, textShadow: '0 0 2px rgba(0,0,0,.8), 0 0 1px rgba(0,0,0,.8)' }}>{children}</span>;
}

// ── meter ──

const COLUMNS: [string, number][] = [['CP', Theme.colCp], ['Damage', Theme.colDamage], ['DPS', Theme.colDps], ['%', Theme.colShare], ['Crit', Theme.colCrit]];
const columnsFor = (metric: string) => COLUMNS.filter(c => !(metric === 'dps' && c[0] === 'Damage') && !(metric === 'damage' && c[0] === 'DPS'));

/** Column labels above PlayerBar rows (MeterHeader.qml). */
export function MeterHeader({ metric }: { metric: string }) {
  return <div style={{ height: 14, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: Theme.colSpacing, paddingRight: 6 }}>
    {columnsFor(metric).map(([label, w]) => <span key={label} style={{ width: w, textAlign: 'right', color: Theme.faint, fontSize: 10 }}>{label}</span>)}
  </div>;
}

/** One meter row: a class-coloured bar behind rank, name, CP, damage, DPS, share, crit (PlayerBar.qml). */
export function PlayerBar({ player, rank, fraction, focused = false, metric, onClick }: {
  player: any; rank: number; fraction: number; focused?: boolean; metric: string; onClick?: () => void;
}) {
  const color = jobColor(player?.jobKey);
  const cell = (text: ReactNode, w: number, size: number = Theme.fontSmall) =>
    <span style={{ width: w, textAlign: 'right', fontSize: size, color: Theme.text, ...num }}>{text}</span>;
  return <div data-click={onClick ? true : undefined} onClick={onClick} style={{
    position: 'relative', height: Theme.rowHeight, borderRadius: 4, background: Theme.rowBg, cursor: onClick ? 'pointer' : undefined,
    boxShadow: `inset 0 0 0 1px ${player?.isLocal ? 'rgba(255,255,255,0.35)' : focused ? Theme.accent : 'transparent'}`,
    display: 'flex', alignItems: 'center',
  }}>
    <Fill fraction={fraction} color={alpha(color, 0.42)} />
    <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 6, flex: 1, minWidth: 0 }}>
      <span style={{ width: 12, color: Theme.dim, fontSize: Theme.fontSmall, ...num }}>{rank}</span>
      <ClassIcon jobKey={player?.jobKey} />
      <span style={{ fontSize: Theme.fontNormal, color: Theme.text, fontWeight: player?.isLocal ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player?.name}</span>
    </span>
    <span style={{ position: 'relative', display: 'flex', gap: Theme.colSpacing, paddingRight: 6, flexShrink: 0 }}>
      {/* Combat power: yours, and party members' from the roster; blank for others. */}
      {cell(player?.combatPower > 0 ? compact(player.combatPower) : '', Theme.colCp)}
      {metric !== 'dps' && cell(compact(player?.damage), Theme.colDamage, Theme.fontNormal)}
      {metric !== 'damage' && cell(compact(player?.dps), Theme.colDps, metric === 'dps' ? Theme.fontNormal : Theme.fontSmall)}
      {cell(percent((player?.share ?? 0) / 100, 0), Theme.colShare)}
      {cell(player?.critRate > 0 ? percent(player.critRate, 0) : '–', Theme.colCrit)}
    </span>
  </div>;
}

const modeNames: Record<string, string> = {
  bossTargets: 'Boss', lastHitByMe: 'My target', mostDamage: 'Most damaged',
  mostRecent: 'Most recent', allTargets: 'All targets', trainTargets: 'Training dummy',
};

/** Ranked players on the current target (DpsMeter.qml). */
export function Meter() {
  const { settings, screen, hud, s, edit } = useOverlay();
  const c = useClient();
  const width = 390;
  // A row picked in Customize (or in game with "Drag widgets in game") shows that player's skills.
  const pick = edit || settings.moveInGame;
  const metric = settings.meterMetric;
  const rows = c.players.slice(0, settings.maxRows);
  const top = rows.length ? rows[0].damage : 1;
  const local = c.players.find(p => p.isLocal);
  const focus = (p: any) => send({ action: 'focus', id: p.isLocal ? null : p.id });
  const empty = !c.connected ? (s.error ? 'Capture stopped: ' + s.error : 'Capture stopped — start it in the app')
    : c.capture?.error ? 'Capture error — see the status widget'
      : c.capture && !c.capture.gameRunning ? 'Waiting for AION 2…'
        : c.capture && !c.capture.locked ? 'Waiting for game traffic…' : 'No damage yet';
  return <Widget id="meter" title="DPS meter" wanted={true}
    // Lifted on short screens so the skills widget still fits under it (556 = gap + its height).
    defaultPos={() => ({ x: 24, y: Math.min(Math.round(544 * hud), screen.h - 556) })}>
    <Panel width={width}>
      <div style={{ height: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: Theme.pad }}>
        <T bold style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {!c.connected ? 'Capture not running' : c.target?.name ? c.target.name : modeNames[c.state?.targetMode] ?? 'Meter'}
        </T>
        <T color={Theme.dim} style={num}>{c.state ? duration(c.state.battleTimeMs) : '-:--'}</T>
      </div>
      {rows.length > 0 && <>
        {/* Party total, the headline number: DPS big, damage and deaths beside it. */}
        <div style={{ height: 30, display: 'flex', alignItems: 'baseline', gap: Theme.pad }}>
          <T size={24} bold style={num}>{metric === 'damage' ? compact(c.totalDamage) : compact(c.totalDps) + '/s'}</T>
          <T size={Theme.fontSmall} color={Theme.faint}>party {metric === 'damage' ? 'damage' : 'DPS'}</T>
          <T size={Theme.fontSmall} color={Theme.dim} style={{ marginLeft: 'auto', ...num, whiteSpace: 'pre' }}>
            {c.totalDeaths + (c.totalDeaths === 1 ? ' death' : ' deaths') + (metric === 'damage' ? '' : '   ' + compact(c.totalDamage) + ' total')}
          </T>
        </div>
        <MeterHeader metric={metric} />
      </>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map((p, i) => <PlayerBar key={p.id} player={p} rank={i + 1} fraction={p.damage / top} metric={metric}
          focused={c.state?.skillsOf === p.id && !p.isLocal} onClick={pick ? () => focus(p) : undefined} />)}
        {/* You, when you are below the cut. */}
        {local && !rows.some(r => r.isLocal) && <PlayerBar player={local} rank={c.players.indexOf(local) + 1} fraction={local.damage / top} metric={metric} />}
        {rows.length === 0 && <T size={Theme.fontSmall} color={Theme.faint}>{empty}</T>}
      </div>
    </Panel>
  </Widget>;
}

/** One player's skills (SkillTable.qml): the live widget and past fights. */
export function SkillTable({ rows, title, titleColor = Theme.text, barColor = Theme.accent }: {
  rows: any[]; title: string; titleColor?: string; barColor?: string;
}) {
  const top = rows.length ? rows[0].damage : 1;
  const cols: [string, number][] = [['DPS', 48], ['Hits', 30], ['Crit', 32], ['Back', 32]];
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <div style={{ height: 18, display: 'flex', alignItems: 'center' }}>
      <T bold color={titleColor}>{title}</T>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, paddingRight: 6 }}>
        {cols.map(([l, w]) => <span key={l} style={{ width: w, textAlign: 'right', color: Theme.faint, fontSize: Theme.fontSmall }}>{l}</span>)}
      </span>
    </div>
    {rows.map((r, i) => <div key={(r.code ?? 'x') + (r.isDot ? 'd' : '') + i} style={{ position: 'relative', height: Math.round(Theme.rowHeight * 0.9), borderRadius: 3, background: Theme.rowBg, display: 'flex', alignItems: 'center' }}>
      <Fill fraction={r.damage / top} color={alpha(barColor, r.isDot ? 0.22 : 0.34)} radius={3} />
      {/* The slot stays when there's no icon (basic attacks) so names line up. */}
      <span style={{ position: 'relative', width: 16, height: 16, marginLeft: 3, flexShrink: 0 }}>
        {r.icon && <img src={r.icon} alt="" style={{ width: 16, height: 16 }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />}
      </span>
      <span style={{ position: 'relative', marginLeft: 5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: Theme.fontSmall, color: Theme.text }}>
        {(r.name || '#' + r.code) + (r.isDot ? ' (DoT)' : '') + '  ' + percent(r.share, 0)}
      </span>
      <span style={{ position: 'relative', display: 'flex', gap: 8, paddingRight: 6, flexShrink: 0 }}>
        {([[compact(r.dps), 48, Theme.text], [r.hits, 30, Theme.dim], [r.isDot ? '–' : percent(r.critRate, 0), 32, Theme.dim], [r.isDot ? '–' : percent(r.backRate, 0), 32, Theme.dim]] as [ReactNode, number, string][])
          .map(([t, w, color], j) => <span key={j} style={{ width: w, textAlign: 'right', fontSize: Theme.fontSmall, color, ...num }}>{t}</span>)}
      </span>
    </div>)}
    {rows.length === 0 && <T size={Theme.fontSmall} color={Theme.faint}>No skills yet</T>}
  </div>;
}

/** The focused player's skills, yours unless you picked someone in the meter (SkillBreakdown.qml). */
export function Skills() {
  const { settings, screen, hud } = useOverlay();
  const c = useClient();
  const owner = c.state && c.state.skillsOf !== null ? c.players.find(p => p.id === c.state.skillsOf) ?? null : null;
  const meterY = Math.min(Math.round(544 * hud), screen.h - 556);
  return <Widget id="skills" title="Skills" wanted={true}
    // Right under the meter, by pixels: scaling the gap would overlap them on small screens.
    defaultPos={() => ({ x: 24, y: meterY + 256 })}>
    <Panel width={360}>
      <SkillTable rows={c.skills.slice(0, settings.skillRows)}
        title={owner ? owner.name + (owner.job ? '  ·  ' + owner.job : '') : 'Skills'}
        titleColor={owner ? jobColor(owner.jobKey) : Theme.text} barColor={owner ? jobColor(owner.jobKey) : Theme.accent} />
    </Panel>
  </Widget>;
}

/** The current target's HP, the fight timer and the time to kill at the party's DPS (BossBar.qml). */
export function BossBar() {
  const { screen, hud } = useOverlay();
  const c = useClient();
  const width = 460;
  const t = c.target;
  const hasHp = t !== null && t.maxHp > 0;
  const hp = !hasHp ? 0 : t.currentHp >= 0 ? t.currentHp : Math.max(0, t.maxHp - t.damageTaken);
  const fraction = hasHp ? Math.max(0, Math.min(1, hp / t.maxHp)) : 0;
  const ttk = c.totalDps > 0 && hasHp ? hp / c.totalDps * 1000 : -1;
  let right = c.state ? duration(c.state.battleTimeMs) : '-:--';
  if (t) right = compact(t.damageTaken) + ' dealt   ' + right;
  if (ttk > 0) right += '   ~' + duration(ttk) + ' left';
  return <Widget id="boss" title="Boss HP" wanted={t !== null && (t.isBoss || hasHp)}
    // Centred a third of the way across a 16:9 screen; on wider ones it stays put relative to the centre.
    defaultPos={() => ({ x: Math.round(screen.w / 2 - 426 * hud - width / 2), y: Math.round(272 * hud) })}>
    <Panel width={width}>
      <div style={{ height: 18, display: 'flex', alignItems: 'center', gap: Theme.pad }}>
        <T bold style={{ maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t ? t.name : 'No target'}</T>
        <T size={Theme.fontSmall} color={Theme.dim} style={{ marginLeft: 'auto', ...num, whiteSpace: 'pre' }}>{right}</T>
      </div>
      <div style={{ position: 'relative', height: 16, borderRadius: 4, background: Theme.hpBack, display: 'grid', placeItems: 'center' }}>
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fraction * 100 + '%', borderRadius: 4, background: Theme.hp, transition: 'width 250ms cubic-bezier(.33,1,.68,1)' }} />
        <BarText>{hasHp ? percent(fraction, 1) + '   ' + compact(hp) + ' / ' + compact(t.maxHp) : t ? compact(t.damageTaken) + ' dealt' : ''}</BarText>
      </div>
    </Panel>
  </Widget>;
}

/** Ping (four bars) and the capture's state; problems show here in words (StatusPill.qml). */
export function StatusPill() {
  const { screen, hud, s } = useOverlay();
  const c = useClient();
  const ping: number | null = c.state?.pingMs ?? null;
  const problem = !c.connected ? 'capture not running — start it in the app'
    : c.capture?.error ? (/npcap|wpcap/i.test(c.capture.error) ? 'Npcap is missing — install it (WinPcap mode)' : c.capture.error) : '';
  const stateText = problem || (!c.capture || !c.capture.gameRunning ? 'game not running'
    : !c.capture.locked ? 'finding game traffic…' : ping !== null ? ping + ' ms' : 'connected');
  const pingColor = ping === null ? Theme.faint : ping < 80 ? Theme.good : ping < 160 ? Theme.warn : Theme.bad;
  const bars = ping === null ? 0 : ping < 60 ? 4 : ping < 110 ? 3 : ping < 180 ? 2 : 1;
  void s;
  return <Widget id="status" title="Ping" wanted={true} defaultPos={() => ({ x: screen.w - 96, y: Math.round(80 * hud) })}>
    <Panel padding={5}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!problem && <span style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 13 }}>
          {[0, 1, 2, 3].map(i => <span key={i} style={{ width: 3, height: 4 + i * 3, borderRadius: 1, background: i < bars ? pingColor : 'rgba(255,255,255,0.15)' }} />)}
        </span>}
        {problem && <T size={Theme.fontSmall} color={Theme.bad}>⚠</T>}
        <T size={Theme.fontSmall} style={num}
          color={problem ? Theme.bad : c.capture?.locked && ping !== null ? pingColor : Theme.dim}>{stateText}</T>
      </div>
    </Panel>
  </Widget>;
}

/** Kina a second while you farm (KinaRate.qml); the session is counted in Rust. */
export function KinaRate() {
  const { screen, now, s } = useOverlay();
  const k = s.kina;
  const recent = k.lastMs > 0 && now - k.lastMs < 5 * 60 * 1000;
  const ms = Math.max(now, k.lastMs) - k.startMs;
  // From the second gain on; the first opens the session, so it isn't timed.
  const perSecond = ms > 0 ? (k.gained - k.first) / (ms / 1000) : 0;
  const left = Math.max(0, 1000000 - k.daily);
  return <Widget id="kina" title="Kina/s" wanted={recent} defaultPos={() => ({ x: 24, y: Math.round(screen.h * 0.52) })}>
    <Panel>
      <T size={recent ? Theme.fontLarge : Theme.fontSmall} bold={recent} color={recent ? Theme.text : Theme.dim} style={num}>
        {recent ? (perSecond < 10 ? perSecond.toFixed(1) : compact(perSecond)) + ' kina/s' : 'Kina/s: shows while you farm'}
      </T>
      {recent && <T size={Theme.fontSmall} color={Theme.dim} style={{ ...num, whiteSpace: 'pre' }}>
        {'Counting ' + duration(ms) + '  ·  +' + compact(k.gained) + '  ·  ' + compact(perSecond * 3600) + '/hour'}
      </T>}
      {recent && k.daily >= 0 && <T size={Theme.fontSmall} color={left <= 0 ? Theme.good : Theme.dim} style={{ ...num, whiteSpace: 'pre' }}>
        {'Daily ' + compact(k.daily) + ' / 1M  ·  ' + (left <= 0 ? 'capped' : 'cap in ' + (perSecond > 0 ? '~' + duration(left / perSecond * 1000) : '–'))}
      </T>}
    </Panel>
  </Widget>;
}

/** The enemy players around you (PvpPanel.qml). */
export function PvpPanel() {
  const { screen, hud, s } = useOverlay();
  const width = 300;
  const enemies: any[] = s.pvp ?? [];
  return <Widget id="pvp" title="PvP" wanted={enemies.length > 0} defaultPos={() => ({ x: Math.round(screen.w / 2 + 300 * hud), y: Math.round(272 * hud) })}>
    <Panel width={width}>
      {/* Something to place in Customize while nobody is fighting you. */}
      {!enemies.length && <T size={Theme.fontSmall} color={Theme.dim}>PvP: shows while enemies are around</T>}
      {enemies.map(e => {
        const hasHp = e.hp >= 0 && e.maxHp > 0;
        const fraction = hasHp ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
        return <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: e.fought ? 1 : 0.6 }}>
          <div style={{ height: 18, display: 'flex', alignItems: 'center', gap: 5 }}>
            <ClassIcon jobKey={e.jobKey} />
            <T bold={e.targeted} color={e.jobKey ? jobColor(e.jobKey) : Theme.text} style={{ maxWidth: width * 0.35, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</T>
            <T size={Theme.fontSmall} color={Theme.dim}>{e.job}</T>
            {e.combatPower > 0 && <T size={Theme.fontSmall} color={Theme.accent} bold style={num}>{compact(e.combatPower)}</T>}
            <T size={Theme.fontSmall} bold color={e.hittingYou ? Theme.bad : Theme.accent} style={{ marginLeft: 'auto' }}>
              {[e.targeted ? 'target' : '', e.hittingYou ? 'hitting you' : ''].filter(Boolean).join(' · ')}
            </T>
          </div>
          <div style={{ position: 'relative', height: 12, borderRadius: 3, background: Theme.hpBack, display: 'grid', placeItems: 'center' }}>
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fraction * 100 + '%', borderRadius: 3, background: Theme.hp, transition: 'width 200ms cubic-bezier(.33,1,.68,1)' }} />
            <BarText>{e.hp === 0 ? 'down' : hasHp ? compact(e.hp) + ' / ' + compact(e.maxHp) : 'HP unknown'}</BarText>
          </div>
        </div>;
      })}
    </Panel>
  </Widget>;
}

/** The pets whose souls you're picking up, up to 5, the last farmed first (PetFarm.qml). */
export function PetFarm() {
  const { screen, now, s } = useOverlay();
  const portraits = usePortraits();
  const width = 300;
  const face = 40;
  const pets = s.pets;
  const farming: any[] = pets?.farming ? pets.farming.filter((f: any) => now - f.lastMs < 5 * 60 * 1000) : [];
  return <Widget id="petFarm" title="Pet souls" wanted={farming.length > 0} defaultPos={() => ({ x: 24, y: Math.round(screen.h * 0.62) })}>
    <Panel width={width}>
      {/* Something to place in Customize while nothing is farmed. */}
      {!farming.length && <T size={Theme.fontSmall} color={Theme.dim}>Pet souls: shows while you farm</T>}
      {farming.map((f, i) => {
        const name = petName(f.pet);
        const genus = petCatalog[f.pet]?.genus ?? '';
        const level: number = pets.levels?.[f.pet] || 0;
        const points: number = pets.points?.[f.pet] || 0;
        const full = level >= maxLevel;
        const target = full ? 0 : needed[level];
        const left = soulsLeft(level, points);
        // Souls a minute since its first one; from the second soul on.
        const ms = Math.max(f.lastMs, now) - f.startedMs;
        const perMinute = f.gained < 2 || ms <= 0 ? 0 : f.gained / (ms / 60000);
        const eta = (souls: number) => (perMinute > 0 ? '~' + duration(souls / perMinute * 60000) : '–');
        const inner = width - Theme.pad * 3 - face;
        const portrait = portraits[name];
        return <div key={f.pet} style={{ display: 'flex', gap: Theme.pad, alignItems: 'center', paddingTop: i ? Theme.pad : 0 }}>
          {/* The portrait, framed in its genus's colour; its initial until it loads. */}
          <span style={{ width: face, height: face, borderRadius: 6, flexShrink: 0, overflow: 'hidden', background: alpha(genusColor(genus), 0.2), border: '1px solid ' + genusColor(genus), display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
            {portrait ? <img src={portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <T size={Theme.fontLarge} bold color={genusColor(genus)}>{name.charAt(0)}</T>}
          </span>
          <div style={{ width: inner, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ height: 18, display: 'flex', alignItems: 'center' }}>
              <T bold style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</T>
              <T size={Theme.fontSmall} color={full ? Theme.good : Theme.dim} style={{ marginLeft: 'auto' }}>{full ? 'Level 3 · full' : 'Level ' + level}</T>
            </div>
            <div style={{ position: 'relative', height: 14, borderRadius: 4, background: 'rgba(92, 214, 138, 0.16)', display: 'grid', placeItems: 'center' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4, background: Theme.good, width: (full ? 1 : Math.min(1, points / target)) * 100 + '%', transition: 'width 250ms cubic-bezier(.33,1,.68,1)' }} />
              <BarText>{full ? 'Full' : points + ' / ' + target + ' to level ' + (level + 1)}</BarText>
            </div>
            {!full && <span style={{ fontSize: Theme.fontSmall, color: Theme.dim, ...num, whiteSpace: 'pre-wrap' }}>
              {left + ' to level 3   ·   ' + (perMinute > 0 ? (perMinute < 10 ? perMinute.toFixed(1) : Math.round(perMinute)) + '/minute' : '–/minute')
                + '   ·   next ' + eta(target - points) + '   full ' + eta(left)}
            </span>}
          </div>
        </div>;
      })}
    </Panel>
  </Widget>;
}
