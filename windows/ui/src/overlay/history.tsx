// Saved boss fights over the game (HistoryPanel.qml). Opened from the tray, a
// command or the app's Analytics; while open it takes the pointer (only over itself).
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from 'react';
import { send, updateSettings } from '../bridge';
import { compact, dayTime, duration, jobColor, Theme } from '../theme';
import { Panel, T, useOverlay, Widget } from './frame';
import { Chip, MeterHeader, MetricSwitch, PlayerBar, SkillTable, useClient } from './widgets';

/** A player's skills in a saved fight, totalled like the live skills widget. */
export function playerSkills(fight: any, actorId: number) {
  if (!fight) return [];
  const seconds = Math.max(1, fight.summary.durationMs / 1000);
  const byKey: Record<string, any> = {};
  for (const s of fight.skills) {
    if (s.actorId !== actorId) continue;
    const key = s.code + (s.isDot ? 'd' : '');
    const r = (byKey[key] ??= { code: s.code, name: s.name, isDot: s.isDot, icon: s.icon, damage: 0, hits: 0, crit: 0, back: 0 });
    r.damage += s.damage;
    r.hits += s.hits;
    r.crit += s.crit;
    r.back += s.back;
  }
  const rows = Object.values(byKey);
  const total = rows.reduce((t, r) => t + r.damage, 0);
  for (const r of rows) {
    const n = Math.max(1, r.hits);
    r.critRate = r.isDot ? 0 : r.crit / n;
    r.backRate = r.isDot ? 0 : r.back / n;
    r.share = total > 0 ? r.damage / total : 0;
    r.dps = r.damage / seconds;
  }
  return rows.sort((a, b) => b.damage - a.damage || a.code - b.code);
}

/** A player's crit rate in a saved fight, over non-DoT hits. */
export function critRate(fight: any, actorId: number) {
  if (!fight) return 0;
  let crit = 0, hits = 0;
  for (const s of fight.skills) {
    if (s.actorId !== actorId || s.isDot) continue;
    crit += s.crit;
    hits += s.hits;
  }
  return hits > 0 ? crit / hits : 0;
}

export function HistoryPanel() {
  const { s, settings, screen } = useOverlay();
  const c = useClient();
  const width = 440;
  const open = s.historyOpen;
  const [selected, setSelected] = useState('');
  const [player, setPlayer] = useState<any>(null);
  const metric = settings.historyMetric;
  const fight = selected && s.fight?.summary?.id === selected ? s.fight : null;
  const summary = fight?.summary ?? null;
  const localName = c.players.find(p => p.isLocal)?.name ?? '';
  const skills = useMemo(() => (player && fight ? playerSkills(fight, player.id) : []), [player, fight]);

  const openFight = (id: string) => { send({ action: 'fight', id }); setSelected(id); setPlayer(null); };
  // Opened: the list afresh. Opened on a fight (from Analytics): that fight.
  useEffect(() => { if (open) { setSelected(''); setPlayer(null); } }, [open]);
  useEffect(() => { if (s.historyRequest) { setSelected(s.historyRequest.id); setPlayer(null); } }, [s.historyRequest?.seq]);

  const close = () => send({ action: 'historyPanel', open: false });
  const back = () => (player ? setPlayer(null) : setSelected(''));
  const rate = (dmg: number, ms: number) => compact(dmg / Math.max(1, ms / 1000)) + '/s';

  return <Widget id="history" title="History" group="history" wanted={open} interactive={open} layout={false}
    defaultPos={() => ({ x: Math.round((screen.w - width * settings.scale) / 2), y: Math.round(screen.h * 0.22) })}>
    {/* Solid, ignoring the opacity setting: it's read over the game. */}
    <Panel width={width} solid>
      <div style={{ height: 20, display: 'flex', alignItems: 'center' }}>
        <span data-click onClick={selected ? back : undefined} style={{ cursor: selected ? 'pointer' : undefined }}>
          <T bold>{player && summary ? '‹ ' + (summary.bossName || 'Unknown') : selected ? '‹ Fights' : 'Fight history'}</T>
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <MetricSwitch value={metric} picked={m => updateSettings({ historyMetric: m as typeof metric })} />
          <span style={{ width: Theme.pad }} />
          <Chip label="Close" onClick={close} />
        </span>
      </div>

      {/* ── list ── */}
      {!selected && s.history.length > 0 && <div style={{ maxHeight: 520, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {s.history.map(f => <HistoryRow key={f.id} f={f} metric={metric} onClick={() => openFight(f.id)} rate={rate} />)}
      </div>}
      {!selected && s.history.length === 0 && <T size={Theme.fontSmall} color={Theme.faint}>No saved fights yet. Boss fights are saved when they end.</T>}

      {/* ── one fight ── */}
      {summary && !player && <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <T size={Theme.fontLarge} bold color={summary.killed ? Theme.good : Theme.text}>{(summary.killed ? '✓ ' : '') + (summary.bossName || 'Unknown')}</T>
        <T size={Theme.fontSmall} color={Theme.dim} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {compact(summary.totalDamage) + ' damage  ·  ' + rate(summary.totalDamage, summary.durationMs) + ' party DPS  ·  ' + duration(summary.durationMs)}
        </T>
        <MeterHeader metric={metric} />
        {summary.players.map((p: any, i: number) => <PlayerBar key={p.id + ':' + i} metric={metric} rank={i + 1}
          fraction={p.damage / Math.max(1, summary.players[0].damage)}
          player={{ name: p.name, jobKey: p.jobKey, damage: p.damage, dps: p.dps, combatPower: p.combatPower,
            share: summary.totalDamage > 0 ? p.damage / summary.totalDamage * 100 : 0, critRate: critRate(fight, p.id), isLocal: p.name === localName }}
          onClick={() => setPlayer(p)} />)}
      </div>}

      {/* ── one player's skills ── */}
      {player && summary && <SkillTable rows={skills} title={player.name + (player.job ? '  ·  ' + player.job : '')}
        titleColor={jobColor(player.jobKey)} barColor={jobColor(player.jobKey)} />}
      {selected && !summary && <T size={Theme.fontSmall} color={Theme.faint}>Loading…</T>}
    </Panel>
  </Widget>;
}

function HistoryRow({ f, metric, onClick, rate }: { f: any; metric: string; onClick: () => void; rate: (d: number, ms: number) => string }) {
  const [hover, setHover] = useState(false);
  const dmg = compact(f.totalDamage), dps = rate(f.totalDamage, f.durationMs);
  return <div data-click onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
    height: 34, borderRadius: 4, background: hover ? 'rgba(255,255,255,0.10)' : Theme.rowBg, cursor: 'pointer', flexShrink: 0,
    display: 'flex', alignItems: 'center', padding: `0 ${Theme.pad}px`,
  }}>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <T color={f.killed ? Theme.good : Theme.text}>{(f.killed ? '✓ ' : '') + (f.bossName || 'Unknown')}</T>
      <T size={Theme.fontSmall} color={Theme.faint}>{dayTime(f.startTimeMs) + '  ·  ' + duration(f.durationMs) + '  ·  ' + f.players.length + ' players'}</T>
    </div>
    <T color={Theme.dim} style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', whiteSpace: 'pre' }}>
      {metric === 'damage' ? dmg : metric === 'dps' ? dps : dmg + '   ' + dps}
    </T>
  </div>;
}
