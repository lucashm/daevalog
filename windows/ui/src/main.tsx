import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

// One bundle, two windows: the in-game overlay (Rust sets this before the page
// loads) and the app window.
const view = (window as unknown as { __DAEVALOG_VIEW__?: string }).__DAEVALOG_VIEW__
  ?? new URLSearchParams(location.search).get('view');
const Root = view === 'overlay' ? lazy(() => import('./overlay/Overlay')) : lazy(() => import('./app/App'));

class Boundary extends React.Component<{ children: React.ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (!this.state.error) return this.props.children;
    // The overlay draws nothing rather than an error over the game.
    if (view === 'overlay') return null;
    return <main style={{ padding: 40, color: '#E8EAED', fontFamily: 'Segoe UI, sans-serif' }}>
      <h1>Daevalog could not display this page.</h1><p>{this.state.error}</p>
      <button onClick={() => location.reload()}>Reload</button>
    </main>;
  }
}

createRoot(document.getElementById('root')!).render(<Boundary><Suspense fallback={null}><Root /></Suspense></Boundary>);
