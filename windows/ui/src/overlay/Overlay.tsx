// The overlay over the game: every widget, as the Linux overlay's shell.qml.
// One full-screen transparent window; Rust lets it take the pointer only
// over what's reported here as taking clicks, or everywhere in Customize.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { overlayInput, useSettings, useSnapshot } from '../bridge';
import { Ctx, alignLines, placeAxis, type OverlayCtx, type Placed } from './frame';
import { CubeAlert, EventAlert } from './alerts';
import { EditorBackdrop, EditorPanel } from './editor';
import { HistoryPanel } from './history';
import { BossBar, KinaRate, Meter, PetFarm, PvpPanel, Skills, StatusPill } from './widgets';
import './overlay.css';

export default function Overlay() {
  const s = useSnapshot();
  const settings = useSettings();
  const edit = s.editMode;
  const [screen, setScreen] = useState({ w: innerWidth, h: innerHeight });
  const [now, setNow] = useState(Date.now());
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const placed = useRef(new Map<string, Placed>());

  useEffect(() => {
    const onResize = () => setScreen({ w: innerWidth, h: innerHeight });
    addEventListener('resize', onResize);
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => { removeEventListener('resize', onResize); clearInterval(timer); };
  }, []);

  // A test from the app's Notifications page: shown even while the game isn't focused.
  const test = s.testNotification;
  const testing = !!test && now - (lastTest.current?.seq === test.seq ? lastTest.current.at : (lastTest.current = { seq: test.seq, at: Date.now() }).at) < 15000;

  // As on Linux: alerts while the game is focused (or kept visible), widgets too unless hidden.
  const alertsShown = edit || s.gameFocused || settings.alwaysShow;
  const groups = { widget: alertsShown && (edit || !settings.hideWidgets), alert: alertsShown || testing, history: true };

  // Customize: a dragged widget's nearest edge or centre onto another's or the screen's, else the grid.
  const place = useCallback((id: string, x: number, y: number, free: boolean) => {
    if (free) { setGuides({ x: [], y: [] }); return { x, y }; }
    const self = placed.current.get(id);
    const others = [...placed.current.values()].filter(p => p.id !== id && p.movable);
    const snap = (v: number) => (settings.snapToGrid ? Math.round(v / settings.gridSize) * settings.gridSize : v);
    const [px, gx] = placeAxis(x, self?.w ?? 0, alignLines(others, screen.w, true), snap);
    const [py, gy] = placeAxis(y, self?.h ?? 0, alignLines(others, screen.h, false), snap);
    setGuides({ x: gx, y: gy });
    return { x: px, y: py };
  }, [settings.snapToGrid, settings.gridSize, screen.w, screen.h]);
  const endDrag = useCallback(() => setGuides({ x: [], y: [] }), []);

  // Where the window takes clicks, sent when it changes.
  const lastInput = useRef('');
  const frame = useRef(0);
  const relayout = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const all = [...placed.current.values()];
      const input = {
        rects: all.filter(p => p.interactive).map(p => [p.x, p.y, p.w, p.h]),
        all: edit,
        shown: edit || all.length > 0,
      };
      const key = JSON.stringify(input);
      if (key !== lastInput.current) { lastInput.current = key; overlayInput(input); }
    });
  }, [edit]);
  useLayoutEffect(relayout);

  const ctx: OverlayCtx = useMemo(() => ({
    s, settings, edit, screen, hud: screen.h / 1440, now, placed, place, endDrag, relayout, groups,
  }), [s, settings, edit, screen, now, place, endDrag, relayout, groups.widget, groups.alert]);

  const cubeTest = test && !test.event?.reminder ? test : null;
  const reminderTest = test?.event?.reminder ? { id: test.event.reminder as string, seq: test.seq } : null;

  return <Ctx.Provider value={ctx}>
    {edit && <EditorBackdrop guides={guides} />}
    <Meter />
    <Skills />
    <BossBar />
    <StatusPill />
    <PetFarm />
    <KinaRate />
    <PvpPanel />
    <CubeAlert test={cubeTest} />
    <EventAlert test={reminderTest} />
    <HistoryPanel />
    {edit && <EditorPanel />}
  </Ctx.Provider>;
}

const lastTest: { current: { seq: number; at: number } | null } = { current: null };
