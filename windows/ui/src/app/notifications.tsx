// The Notifications page (NotificationsPage.qml): each kind of in-game alert,
// with a switch and a test shown over the game.
import { send, updateSettings, useSettings } from '../bridge';
import { AppTheme } from '../theme';
import { Button, Card, Heading, Label, Option, Switch } from './ui';

const test = (event: Record<string, unknown>) => send({ action: 'testNotification', event });

export default function Notifications() {
  const s = useSettings();
  const events = s.notifyShugo || s.notifyInvasion;
  return <>
    <Heading title="Notifications" note="Alerts drawn over the game. Turn each one on or off here." />

    {/* Hidden cubes. */}
    <Card style={{ padding: 20, display: 'flex', gap: 20 }}>
      <span style={{ width: 22, height: 22, marginTop: 4, flexShrink: 0, background: AppTheme.cube, transform: 'rotate(45deg)' }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label size={AppTheme.large} bold>Hidden cubes</Label>
        <Label color={AppTheme.dim}>An alert at the top of the screen when a hidden cube comes within about 100 m of you, and when someone else starts opening it or opens it. It shows how far away the cube is when the game has sent your position lately: often in a fight, less while just walking. Move it in Customize.</Label>
        <div style={{ paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 8, opacity: s.notifyCubes ? 1 : 0.4 }}>
          <Option label="Only when I have a key" note="Counts your Hidden Cube Keys from your bag at login, less the ones you use. Until it has seen your bag, it alerts anyway."
            on={s.cubesNeedKey} toggled={() => updateSettings({ cubesNeedKey: !s.cubesNeedKey })} />
          <Option label="Play a sound" note="A short chime when a cube is nearby." on={s.cubeSound} toggled={() => updateSettings({ cubeSound: !s.cubeSound })} />
        </div>
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <Button label="Test: cube nearby" onClick={() => test({ event: 'near', id: -1, distance: 64, keys: 41 })} />
          <Button label="Test: opened by someone" onClick={() => test({ event: 'opened', id: -2, by: 'Somebody' })} />
        </div>
      </div>
      <Switch on={s.notifyCubes} toggled={() => updateSettings({ notifyCubes: !s.notifyCubes })} label="Hidden cube alerts" />
    </Card>

    {/* Hourly events. */}
    <Card style={{ padding: 20, display: 'flex', gap: 20 }}>
      <span style={{ width: 22, height: 22, marginTop: 4, flexShrink: 0, borderRadius: 11, background: AppTheme.accent }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Label size={AppTheme.large} bold>Event reminders</Label>
        <Label color={AppTheme.dim}>A countdown over the game before each hourly event starts, by the server's clock. Move it in Customize.</Label>
        <div style={{ paddingTop: 4 }}>
          <Option label="Shugo Festival" note="Every hour on the hour." on={s.notifyShugo} toggled={() => updateSettings({ notifyShugo: !s.notifyShugo })} />
        </div>
        <Option label="Dimensional Invasion" note="Every hour at half past: Beritra Air Raid, Accursed Sword or Incursion of the Spirits. Level 45 and up."
          on={s.notifyInvasion} toggled={() => updateSettings({ notifyInvasion: !s.notifyInvasion })} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: events ? 1 : 0.4 }}>
          <Label style={{ paddingRight: 4 }}>Remind me</Label>
          {[1, 3, 5, 10].map(m => <Button key={m} label={m + ' min'} checked={s.eventLead === m} onClick={() => updateSettings({ eventLead: m })} />)}
          <Label style={{ paddingLeft: 4 }}>before</Label>
        </div>
        <Option dim={!events} label="Play a sound" note="A short chime when a reminder shows." on={s.eventSound} toggled={() => updateSettings({ eventSound: !s.eventSound })} />
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <Button label="Test: Shugo Festival" onClick={() => test({ reminder: 'shugo' })} />
          <Button label="Test: Dimensional Invasion" onClick={() => test({ reminder: 'invasion' })} />
        </div>
      </div>
    </Card>
  </>;
}
