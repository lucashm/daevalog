// The app window's controls, as the Linux pages draw them (AppTheme).
import { useState, type CSSProperties, type ReactNode } from 'react';
import { AppTheme } from '../theme';

export function Label({ children, size = AppTheme.normal, color = AppTheme.text, bold = false, style }: {
  children: ReactNode; size?: number; color?: string; bold?: boolean; style?: CSSProperties;
}) {
  return <span style={{ fontSize: size, color, fontWeight: bold ? 700 : 400, ...style }}>{children}</span>;
}

export const Section = ({ children }: { children: ReactNode }) =>
  <Label size={AppTheme.small} color={AppTheme.dim} bold style={{ letterSpacing: 0.5 }}>{children}</Label>;

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: AppTheme.card, borderRadius: AppTheme.radius, border: '1px solid ' + AppTheme.cardEdge, ...style }}>{children}</div>;
}

/** A page's title and the line under it. */
export function Heading({ title, note, children }: { title: string; note: string; children?: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <Label size={AppTheme.title} bold>{title}</Label>
      <Label color={AppTheme.dim}>{note}</Label>
    </div>
    {children}
  </div>;
}

export function Switch({ on, toggled, label }: { on: boolean; toggled: () => void; label?: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} onClick={toggled} style={{
    width: 44, height: 24, borderRadius: 12, flexShrink: 0, position: 'relative', cursor: 'pointer', padding: 0,
    background: on ? AppTheme.accent : AppTheme.row, border: '1px solid ' + (on ? AppTheme.accent : AppTheme.cardEdge),
  }}>
    <span style={{ position: 'absolute', top: 2, left: on ? 22 : 2, width: 18, height: 18, borderRadius: 9, background: 'white', transition: 'left 120ms' }} />
  </button>;
}

export function Button({ label, checked = false, primary = false, onClick, disabled = false }: {
  label: ReactNode; checked?: boolean; primary?: boolean; onClick: () => void; disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const strong = checked || primary;
  return <button disabled={disabled} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{
    height: primary ? 34 : 32, padding: '0 14px', borderRadius: 6, cursor: disabled ? 'default' : 'pointer', font: 'inherit',
    fontSize: primary ? AppTheme.normal : AppTheme.small, fontWeight: primary ? 700 : 400, opacity: disabled ? 0.4 : 1,
    background: strong ? (hover && primary ? '#5A9DFF' : AppTheme.accent) : hover ? AppTheme.rowHover : AppTheme.row,
    border: '1px solid ' + (strong ? AppTheme.accent : AppTheme.cardEdge), color: strong ? 'white' : AppTheme.text,
  }}>{label}</button>;
}

/** A check box with its label and a note on the right. */
export function Check({ label, note, checked, toggled }: { label: string; note?: string; checked: boolean; toggled: () => void }) {
  return <div onClick={toggled} style={{ height: 26, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
    <span style={{ width: 16, height: 16, borderRadius: 4, boxSizing: 'border-box', display: 'grid', placeItems: 'center', flexShrink: 0,
      background: checked ? AppTheme.accent : 'transparent', border: '1px solid ' + (checked ? AppTheme.accent : AppTheme.faint), color: 'white', fontSize: 11, fontWeight: 700 }}>{checked ? '✓' : ''}</span>
    <Label>{label}</Label>
    {note && <Label size={AppTheme.small} color={AppTheme.dim} style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{note}</Label>}
  </div>;
}

export function Bar({ value, width, color = AppTheme.accent }: { value: number; width?: number | string; color?: string }) {
  return <span style={{ display: 'inline-block', width, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', position: 'relative', flexShrink: 0 }}>
    <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, background: color, width: Math.max(0, Math.min(1, value)) * 100 + '%' }} />
  </span>;
}

/** A switch with a name and a line under it. */
export function Option({ label, note, on, toggled, dim = false }: { label: string; note: string; on: boolean; toggled: () => void; dim?: boolean }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: dim ? 0.4 : 1 }}>
    <Switch on={on} toggled={toggled} label={label} />
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Label>{label}</Label>
      <Label size={AppTheme.small} color={AppTheme.faint}>{note}</Label>
    </div>
  </div>;
}

export function TextField({ value, onChange, placeholder, width, background = AppTheme.card }: {
  value: string; onChange: (v: string) => void; placeholder: string; width?: number | string; background?: string;
}) {
  const [focus, setFocus] = useState(false);
  return <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
    style={{ width, height: 34, boxSizing: 'border-box', padding: '0 12px', borderRadius: 6, background, color: AppTheme.text, font: 'inherit', fontSize: AppTheme.normal,
      border: '1px solid ' + (focus ? AppTheme.accent : AppTheme.cardEdge), outline: 'none' }} />;
}
