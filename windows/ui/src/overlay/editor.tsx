// Customize: the screen dims, widgets are dragged by their outline (EditorLayer.qml).
// The panel in the middle holds the settings.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { monitors, send, updateSettings } from '../bridge';
import {
  clampGrid, clampOpacity, clampScale, loadLayout, resetLayout, saveLayout, setShortcut, setWidgetVisible, widgetVisible,
} from '../settings';
import { Theme } from '../theme';
import { useOverlay } from './frame';
import { useClient } from './widgets';

/** A key press as a combo ("ALT + Z"), or "" while it can't be one: a lone modifier, or a key without Ctrl, Alt or Super. */
export function comboOf(e: { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }) {
  let key = '';
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (/^F([1-9]|1[0-2])$/.test(e.code)) key = e.code;
  else if (e.code === 'Backquote') key = 'grave';
  if (!key) return '';
  const mods = [];
  if (e.ctrlKey) mods.push('CTRL');
  if (e.altKey) mods.push('ALT');
  if (e.shiftKey) mods.push('SHIFT');
  if (e.metaKey) mods.push('SUPER');
  // F-keys may stand alone; anything else needs Ctrl, Alt or Super.
  if (!/^F[0-9]+$/.test(key) && !mods.some(m => m !== 'SHIFT')) return '';
  return [...mods, key].join(' + ');
}
/** "CTRL + grave" → "Ctrl + `" */
export const prettyCombo = (c: string) =>
  c.split(' + ').map(p => (p === 'grave' ? '`' : p.length > 1 && p[0] !== 'F' ? p[0] + p.slice(1).toLowerCase() : p)).join(' + ');

const small = { fontSize: Theme.fontSmall, fontFamily: Theme.fontFamily } as const;

function Hoverable({ children, style, onClick, hoverBg = 'rgba(255,255,255,0.08)', disabled = false, title }: {
  children: ReactNode; style?: React.CSSProperties; onClick?: () => void; hoverBg?: string; disabled?: boolean; title?: string;
}) {
  const [hover, setHover] = useState(false);
  return <span title={title} onClick={disabled ? undefined : onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
    style={{ cursor: disabled ? 'default' : 'pointer', ...style, background: hover && !disabled ? hoverBg : style?.background }}>{children}</span>;
}

/** One of several options, joined into a single control. */
function Segmented<V extends string>({ options, value, picked }: { options: { value: V; label: string }[]; value: V; picked: (v: V) => void }) {
  return <span style={{ display: 'inline-flex', padding: 2, borderRadius: Theme.radius, background: 'rgba(255,255,255,0.06)', border: '1px solid ' + Theme.panelEdge, flexWrap: 'wrap' }}>
    {options.map(o => {
      const on = value === o.value;
      return <Hoverable key={o.value} onClick={() => picked(o.value)} style={{ ...small, padding: `${Theme.pad * 0.375}px ${Theme.pad}px`, borderRadius: Theme.radius - 2,
        background: on ? Theme.accent : 'transparent', color: on ? '#1b1b1b' : Theme.text, fontWeight: on ? 700 : 400 }}>{o.label}</Hoverable>;
    })}
  </span>;
}

/** An on/off setting: a check box and its label. */
function Toggle({ label, checked, toggled }: { label: string; checked: boolean; toggled: () => void }) {
  return <Hoverable onClick={toggled} style={{ display: 'inline-flex', alignItems: 'center', gap: Theme.pad * 0.75, padding: `${Theme.pad * 0.375}px ${Theme.pad * 0.75}px`, borderRadius: Theme.radius }}>
    <span style={{ width: 14, height: 14, borderRadius: 3, boxSizing: 'border-box', display: 'grid', placeItems: 'center', fontSize: Theme.fontSmall, fontWeight: 700, color: '#1b1b1b',
      background: checked ? Theme.accent : 'transparent', border: '1px solid ' + (checked ? Theme.accent : Theme.dim) }}>{checked ? '✓' : ''}</span>
    <span style={{ ...small, color: checked ? Theme.text : Theme.dim }}>{label}</span>
  </Hoverable>;
}

/** − value +, for a number setting. */
function Stepper({ text, down, up, enabled = true }: { text: string; down: () => void; up: () => void; enabled?: boolean }) {
  const end = (label: string, on: () => void) => <Hoverable onClick={on} disabled={!enabled} hoverBg="rgba(255,255,255,0.1)"
    style={{ ...small, color: Theme.dim, width: 26, textAlign: 'center', padding: `${Theme.pad * 0.375}px 0`, borderRadius: Theme.radius - 2 }}>{label}</Hoverable>;
  return <span style={{ display: 'inline-flex', alignItems: 'center', padding: 2, borderRadius: Theme.radius, background: 'rgba(255,255,255,0.06)', border: '1px solid ' + Theme.panelEdge, opacity: enabled ? 1 : 0.4 }}>
    {end('−', down)}
    <span style={{ ...small, color: Theme.text, minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{text}</span>
    {end('+', up)}
  </span>;
}

function Button({ label, primary = false, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
  return <Hoverable onClick={onClick} hoverBg={primary ? '#F5CD70' : 'rgba(255,255,255,0.08)'} style={{ ...small, padding: `${Theme.pad / 2}px ${Theme.pad * (primary ? 1.5 : 1)}px`, borderRadius: Theme.radius,
    background: primary ? Theme.accent : 'transparent', color: primary ? '#1b1b1b' : Theme.dim, fontWeight: primary ? 700 : 400 }}>{label}</Hoverable>;
}

const Label = ({ children }: { children: ReactNode }) => <span style={{ ...small, color: Theme.dim, justifySelf: 'end', alignSelf: 'center' }}>{children}</span>;
const Section = ({ children }: { children: ReactNode }) => <span style={{ gridColumn: '1 / 3', marginTop: Theme.pad / 2, color: Theme.faint, fontSize: 10, fontWeight: 700, letterSpacing: 1.2 }}>{children}</span>;

/** The full-screen layer under the widgets: dim, grid, centre lines and the guides of a drag. */
export function EditorBackdrop({ guides }: { guides: { x: number[]; y: number[] } }) {
  const { settings, screen } = useOverlay();
  const grid = useRef<HTMLCanvasElement>(null);
  // The snap grid: faint lines, every fourth one a little brighter.
  useLayoutEffect(() => {
    const c = grid.current;
    if (!c) return;
    c.width = screen.w;
    c.height = screen.h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 1;
    const step = settings.gridSize;
    for (let i = 0, x = 0; x <= c.width; i++, x += step) {
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, c.height); ctx.stroke();
    }
    for (let i = 0, y = 0; y <= c.height; i++, y += step) {
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(c.width, y + 0.5); ctx.stroke();
    }
  }, [settings.gridSize, screen.w, screen.h, settings.snapToGrid]);
  const line = (style: React.CSSProperties, color: string) => <span style={{ position: 'absolute', background: color, pointerEvents: 'none', ...style }} />;
  return <>
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 0 }} />
    {settings.snapToGrid && <canvas ref={grid} style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />}
    {/* The screen's centre lines, always shown while editing. */}
    {line({ left: Math.round(screen.w / 2), top: 0, width: 1, height: screen.h, zIndex: 0 }, 'rgba(255,255,255,0.22)')}
    {line({ top: Math.round(screen.h / 2), left: 0, height: 1, width: screen.w, zIndex: 0 }, 'rgba(255,255,255,0.22)')}
    {guides.x.map(x => <span key={'x' + x}>{line({ left: Math.round(x), top: 0, width: 1, height: screen.h, zIndex: 3 }, '#FF5FD2')}</span>)}
    {guides.y.map(y => <span key={'y' + y}>{line({ top: Math.round(y), left: 0, height: 1, width: screen.w, zIndex: 3 }, '#FF5FD2')}</span>)}
  </>;
}

/** The settings panel and the reset confirmation, over everything. */
export function EditorPanel() {
  const { settings, placed } = useOverlay();
  const c = useClient();
  const [recording, setRecording] = useState<'' | 'edit' | 'hide'>('');
  const [confirming, setConfirming] = useState(false);
  const [screens, setScreens] = useState<string[]>([]);
  useEffect(() => { void monitors().then(setScreens); }, []);
  const done = () => send({ action: 'edit', on: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!recording) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        if (confirming) setConfirming(false);
        else done();
        return;
      }
      e.preventDefault();
      if (e.key === 'Escape') setRecording('');
      else if (e.key === 'Backspace' || e.key === 'Delete') { updateSettings(s => setShortcut(s, recording, '')); setRecording(''); }
      else {
        const combo = comboOf(e);
        if (!combo) return;
        updateSettings(s => setShortcut(s, recording, combo));
        setRecording('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, confirming]);

  // The widgets that can be placed, in the order the Linux editor lists them.
  const order = ['meter', 'skills', 'boss', 'status', 'petFarm', 'kina', 'pvp', 'cubeAlert', 'eventAlert'];
  const titles: Record<string, string> = { meter: 'DPS meter', skills: 'Skills', boss: 'Boss HP', status: 'Ping', petFarm: 'Pet souls', kina: 'Kina/s', pvp: 'PvP', cubeAlert: 'Hidden cube alerts', eventAlert: 'Event reminders' };
  void placed;

  const keyField = (name: 'edit' | 'hide', combo: string) => {
    const listening = recording === name;
    return <Hoverable onClick={() => setRecording(listening ? '' : name)} hoverBg="rgba(255,255,255,0.1)" style={{ ...small, minWidth: 110, textAlign: 'center', padding: `${Theme.pad * 0.375 + 2}px ${Theme.pad}px`, borderRadius: Theme.radius,
      background: listening ? 'rgba(242, 193, 90, 0.15)' : 'rgba(255,255,255,0.06)', border: '1px solid ' + (listening ? Theme.accent : Theme.panelEdge),
      color: listening ? Theme.accent : combo ? Theme.text : Theme.faint, fontWeight: combo && !listening ? 700 : 400 }}>
      {listening ? 'Press keys…' : combo ? prettyCombo(combo) : 'None'}</Hoverable>;
  };
  const layoutSlot = (i: number) => {
    const saved = settings.layouts[i] ?? null;
    // What is on screen now is this layout.
    const current = saved !== null && JSON.stringify(saved) === JSON.stringify(settings.widgets);
    return <span key={i} style={{ display: 'inline-flex', padding: 2, borderRadius: Theme.radius, background: 'rgba(255,255,255,0.06)', border: '1px solid ' + Theme.panelEdge }}>
      <Hoverable disabled={!saved} onClick={() => updateSettings(s => loadLayout(s, i))} hoverBg="rgba(255,255,255,0.1)" style={{ ...small, padding: `${Theme.pad * 0.375}px ${Theme.pad}px`, borderRadius: Theme.radius - 2,
        background: current ? Theme.accent : 'transparent', color: current ? '#1b1b1b' : saved ? Theme.text : Theme.faint, fontWeight: current ? 700 : 400 }}>Layout {i + 1}</Hoverable>
      <Hoverable onClick={() => updateSettings(s => saveLayout(s, i))} hoverBg="rgba(255,255,255,0.1)" style={{ ...small, padding: `${Theme.pad * 0.375}px ${Theme.pad}px`, borderRadius: Theme.radius - 2, color: Theme.dim }}>Save</Hoverable>
    </span>;
  };

  return <>
    <div data-panel style={{
      position: 'fixed', left: '50%', bottom: '12%', transform: 'translateX(-50%)', zIndex: 4, zoom: settings.scale,
      padding: `${Theme.pad * 1.5}px ${Theme.pad * 2}px`, borderRadius: Theme.radius * 1.5, background: 'rgba(15, 18, 26, 0.95)', border: '1px solid ' + Theme.panelEdge,
      display: 'flex', flexDirection: 'column', gap: Theme.pad, maxWidth: 720, color: Theme.text, fontFamily: Theme.fontFamily,
    }} onPointerDown={e => e.stopPropagation()}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: Theme.fontLarge, fontWeight: 700 }}>Customize</span>
        <span style={{ ...small, color: Theme.faint }}>Drag a widget to move it · Shift places freely · Click a player for their skills · Esc to finish</span>
      </div>
      <div style={{ height: 1, background: Theme.panelEdge }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: Theme.pad * 1.5, rowGap: Theme.pad * 0.75, alignItems: 'center' }}>
        <Section>WIDGETS</Section>
        <Label>Show</Label>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {order.map(id => <Toggle key={id} label={titles[id]} checked={widgetVisible(settings, id)} toggled={() => updateSettings(s => setWidgetVisible(s, id, !widgetVisible(s, id)))} />)}
        </span>
        <Label>Layouts</Label>
        <span style={{ display: 'flex', gap: Theme.pad / 2 }}>{[0, 1, 2].map(layoutSlot)}</span>
        <Label>Monitor</Label>
        <Segmented options={[{ value: '', label: 'Follow game' }, ...screens.map(n => ({ value: n, label: n.replace(/^\\\\\.\\/, '') }))]}
          value={settings.pinnedMonitor || ''} picked={v => updateSettings({ pinnedMonitor: v })} />
        <span />
        <Toggle label="Keep visible when the game isn't focused" checked={settings.alwaysShow} toggled={() => updateSettings({ alwaysShow: !settings.alwaysShow })} />
        <span />
        <Toggle label="Drag widgets in game (hold Alt)" checked={settings.moveInGame} toggled={() => updateSettings({ moveInGame: !settings.moveInGame })} />

        <Section>METER</Section>
        <Label>Target</Label>
        <Segmented options={[{ value: 'bossTargets', label: 'Boss' }, { value: 'lastHitByMe', label: 'My target' }, { value: 'mostDamage', label: 'Most damaged' }, { value: 'allTargets', label: 'All' }, { value: 'trainTargets', label: 'Dummy' }]}
          value={c.state?.targetMode ?? ''} picked={mode => send({ action: 'target', mode })} />
        <Label>Numbers</Label>
        <Segmented options={[{ value: 'damage', label: 'Damage' }, { value: 'dps', label: 'DPS' }, { value: 'both', label: 'Both' }]}
          value={settings.meterMetric} picked={v => updateSettings({ meterMetric: v })} />

        <Section>SHORTCUTS</Section>
        <Label>Customize</Label>
        <span style={{ display: 'flex', alignItems: 'center', gap: Theme.pad }}>
          {keyField('edit', settings.shortcutEdit)}
          <span style={{ ...small, color: Theme.faint }}>{recording ? 'Esc cancels · Backspace clears' : 'Only while the game has focus'}</span>
        </span>
        <Label>Hide / show</Label>
        <span>{keyField('hide', settings.shortcutHide)}</span>

        <Section>APPEARANCE</Section>
        <Label>Size</Label>
        <span style={{ display: 'flex', alignItems: 'center', gap: Theme.pad * 1.5 }}>
          <Stepper text={Math.round(settings.scale * 100) + '%'} down={() => updateSettings({ scale: clampScale(settings.scale - 0.1) })} up={() => updateSettings({ scale: clampScale(settings.scale + 0.1) })} />
          <Label>Opacity</Label>
          <Stepper text={Math.round(settings.opacity * 100) + '%'} down={() => updateSettings({ opacity: clampOpacity(settings.opacity - 0.1) })} up={() => updateSettings({ opacity: clampOpacity(settings.opacity + 0.1) })} />
        </span>
        <Label>Grid</Label>
        <span style={{ display: 'flex', alignItems: 'center', gap: Theme.pad }}>
          <Toggle label="Snap" checked={settings.snapToGrid} toggled={() => updateSettings({ snapToGrid: !settings.snapToGrid })} />
          <Stepper enabled={settings.snapToGrid} text={settings.gridSize + ' px'} down={() => updateSettings({ gridSize: clampGrid(settings.gridSize - 4) })} up={() => updateSettings({ gridSize: clampGrid(settings.gridSize + 4) })} />
        </span>
      </div>
      <div style={{ height: 1, background: Theme.panelEdge }} />
      {/* Footer: resets on the left, the way out on the right. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Button label="Reset layout" onClick={() => updateSettings(resetLayout)} />
        <Button label="Reset meter…" onClick={() => setConfirming(true)} />
        <span style={{ flex: 1 }} />
        <Button label="Done" primary onClick={done} />
      </div>
    </div>

    {confirming && <div data-panel onPointerDown={e => e.stopPropagation()} onClick={() => setConfirming(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 5, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ zoom: settings.scale, padding: Theme.pad * 2, borderRadius: Theme.radius * 1.5, background: 'rgba(15, 18, 26, 0.97)', border: '1px solid ' + Theme.panelEdge,
        display: 'flex', flexDirection: 'column', gap: Theme.pad, fontFamily: Theme.fontFamily, color: Theme.text }}>
        <span style={{ fontSize: Theme.fontLarge, fontWeight: 700 }}>Reset the meter?</span>
        <span style={{ ...small, color: Theme.dim }}>Boss fights on it are saved to history first. Other damage is lost, and kina/s starts over with the next kina.</span>
        <span style={{ display: 'flex', justifyContent: 'flex-end', gap: Theme.pad / 2 }}>
          <Button label="Cancel" onClick={() => setConfirming(false)} />
          <Button label="Reset" primary onClick={() => { send({ action: 'reset' }); setConfirming(false); }} />
        </span>
      </div>
    </div>}
  </>;
}
