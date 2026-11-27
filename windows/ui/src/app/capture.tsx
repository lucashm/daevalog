// Windows' own settings page: what the Linux installer and services set up.
// The Npcap adapter to capture on, starting capture with the app, a replay,
// and where the data is.
import { useState } from 'react';
import { native, send, useSnapshot } from '../bridge';
import { AppTheme } from '../theme';
import { Button, Card, Heading, Label, Option, TextField } from './ui';

export default function Capture() {
  const s = useSnapshot();
  const prefs = s.preferences;
  const [iface, setIface] = useState<string | null>(null);
  const [replay, setReplay] = useState('');
  const picked = iface ?? prefs.iface;
  const cap = s.state?.capture;
  const status = s.replay ? (s.running && !s.replayComplete ? 'Replaying a capture' : 'Replay finished')
    : !s.running ? 'Capture stopped' : cap?.locked ? 'Capturing game traffic' : cap?.gameRunning ? 'Finding game traffic' : 'Waiting for AION 2';
  const save = (p: Partial<typeof prefs>) => send({ action: 'preferences', preferences: { ...prefs, ...p } });
  return <>
    <Heading title="Capture" note="How Daevalog reads the game's traffic on this PC." />
    <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: s.running && cap?.locked ? AppTheme.good : AppTheme.faint }} />
        <Label bold>{status}</Label>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Button primary disabled={!native} label={s.running ? 'Restart capture' : 'Start capture'} onClick={() => send({ action: 'start', replay: null })} />
          {s.running && <Button label="Stop capture" onClick={() => send({ action: 'stop' })} />}
        </span>
      </div>
      {(s.error || cap?.error) && <Label size={AppTheme.small} color={AppTheme.warn}>{s.error || cap?.error}</Label>}
      <Option label="Start capture when Daevalog opens" note="Off: start it here when you want to." on={prefs.autoStart} toggled={() => save({ autoStart: !prefs.autoStart })} />
    </Card>

    <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Label size={AppTheme.large} bold>Network adapter</Label>
      <Label color={AppTheme.dim}>Automatic uses the adapter with the default route. With a VPN, pick the one carrying the game's traffic, then restart capture.</Label>
      <select value={picked} onChange={e => setIface(e.target.value)} style={{ height: 34, borderRadius: 6, background: AppTheme.card, color: AppTheme.text, border: '1px solid ' + AppTheme.cardEdge, padding: '0 10px', font: 'inherit' }}>
        <option value="">Automatic · default route</option>
        {s.adapters.map(a => <option key={a.name} value={a.name}>{(a.description || a.name) + (a.addresses.length ? '  ·  ' + a.addresses.join(', ') : '')}</option>)}
      </select>
      <span style={{ display: 'flex', gap: 8 }}>
        <Button label="Refresh adapters" onClick={() => send({ action: 'refreshAdapters' })} />
        <Button primary disabled={picked === prefs.iface} label="Save adapter" onClick={() => { save({ iface: picked }); setIface(null); }} />
      </span>
      <Label size={AppTheme.small} color={AppTheme.faint}>Capture needs Npcap, installed in WinPcap API-compatible Mode (npcap.com).</Label>
    </Card>

    <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Label size={AppTheme.large} bold>Replay a capture</Label>
      <Label color={AppTheme.dim}>Plays a .pcap file through the meter, as `aion2-meterd --pcap` does. Live capture stops while it plays; Start capture returns to the game.</Label>
      <span style={{ display: 'flex', gap: 8 }}>
        <TextField value={replay} onChange={setReplay} placeholder="C:\Captures\fight.pcap" width="100%" />
        <Button disabled={!native || !replay.trim()} label="Replay" onClick={() => send({ action: 'start', replay: replay.trim() })} />
      </span>
    </Card>

    <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label size={AppTheme.large} bold>Your data</Label>
      <Label color={AppTheme.dim} style={{ overflowWrap: 'anywhere' }}>{s.dataDir}</Label>
      <Label size={AppTheme.small} color={AppTheme.faint}>Saved fights in fights\, widget settings in overlay.json, the capture's log in capture.log.</Label>
    </Card>
  </>;
}
