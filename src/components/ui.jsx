// Shared primitives for the Fueling Intelligence visual system.
//
// Rules from the design: sharp rectangles (no rounded corners except true
// circles), hairline rules in ink, cobalt as the single accent, status shown by
// SHAPE + WORD (never color alone), Bodoni numerals, Archivo labels. White is a
// moment that matters. Every control has a visible focus ring and a real label.
import { fmt } from '../lib/nutrition.js'

/* --- buttons ------------------------------------------------------------- */
// Block CTA: uppercase, tracked, bold, sharp. The design's primary language.
export function Button({ variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 px-5 py-4 text-xs font-bold uppercase tracking-[0.13em] transition disabled:opacity-40 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-cobalt text-oncobalt hover:bg-cobalt-ink',
    outline: 'border-[1.5px] border-ink text-ink hover:bg-fill',
    subtle: 'border-[1.5px] border-line-strong text-muted hover:bg-fill',
    danger: 'border-[1.5px] border-alert/60 text-alert hover:bg-alert/5',
  }
  return <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props} />
}

// Inline text action — cobalt, sentence case, optional trailing chevron.
export function TextButton({ children, chevron = false, className = '', ...props }) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 text-cobalt font-semibold tracking-[0.02em] hover:text-cobalt-ink ${className}`}
      {...props}
    >
      {children}
      {chevron && <span aria-hidden className="text-[1.1em] leading-none">›</span>}
    </button>
  )
}

/* --- inputs -------------------------------------------------------------- */
export const inputCls =
  'w-full border border-line bg-card px-3 py-3 text-ink placeholder:text-faint outline-none focus:border-cobalt'

export function Field({ label, children, hint, right }) {
  return (
    <label className="block">
      {(label || right) && (
        <span className="mb-1.5 flex items-baseline justify-between">
          {label && <span className="eyebrow">{label}</span>}
          {right}
        </span>
      )}
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  )
}

/* --- surfaces ------------------------------------------------------------ */
// Sharp panel. `white` for a moment that matters; otherwise a hairline frame.
export function Card({ className = '', children, as: Tag = 'div', white = false, ...props }) {
  const skin = white ? 'bg-card border border-line shadow-[0_1px_0_rgb(18_18_16/0.06)]' : 'bg-card border border-line'
  return (
    <Tag className={`${skin} ${className}`} {...props}>
      {children}
    </Tag>
  )
}

export function Rule({ className = '' }) {
  return <hr className={`border-0 border-t border-line ${className}`} />
}

export function SectionTitle({ children, right, className = '' }) {
  return (
    <div className={`mb-2 flex items-baseline justify-between ${className}`}>
      <h3 className="eyebrow">{children}</h3>
      {right}
    </div>
  )
}

// Bottom sheet — a white moment that slides up. Sharp top edge, grabber bar,
// warm dim behind. Reserved for confirm / save / a recommendation detail.
export function Sheet({ open, onClose, title, children, size = 'md', grabber = true }) {
  if (!open) return null
  const width = size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 sm:items-center" onClick={onClose}>
      <div
        className={`w-full ${width} max-h-[92vh] overflow-y-auto border border-line bg-card p-5 shadow-[0_-3px_14px_rgb(18_18_16/0.12)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {grabber && <div className="mx-auto mb-4 h-1 w-11 bg-line-strong" />}
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="serif text-xl text-ink">{title}</h2>
            <button onClick={onClose} className="px-2 py-1 text-muted hover:text-ink" aria-label="Close">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
export const Modal = Sheet // alias for existing call sites

/* --- data marks ---------------------------------------------------------- */
// Big serif numeral with a small label — the editorial data mark.
export function Stat({ label, value, unit, decimals = 0, size = 'md', className = '' }) {
  const cls = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl'
  return (
    <div className={className}>
      <div className={`numeral ${cls} leading-none text-ink`}>
        {typeof value === 'number' ? fmt(value, decimals) : value}
        {unit ? <span className="ml-1 font-sans text-xs font-medium text-muted">{unit}</span> : null}
      </div>
      {label && <div className="eyebrow mt-2">{label}</div>}
    </div>
  )
}

// Thin rectangular meter — ink fill on a faint track. Over-target reads cobalt
// and is labelled by the caller, not by color alone.
export function Meter({ value, target, over, height = 3, className = '' }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const isOver = over ?? (target > 0 && value > target)
  return (
    <div className={`w-full bg-track ${className}`} style={{ height }}>
      <div className={isOver ? 'h-full bg-cobalt' : 'h-full bg-ink'} style={{ width: `${pct}%` }} />
    </div>
  )
}

// Segmented progress — N cells, `filled` of them inked, a fixed-width language
// for the day's calorie budget.
export function SegmentBar({ total = 15, filled = 0, height = 7, className = '' }) {
  const n = Math.max(0, Math.min(total, Math.round(filled)))
  return (
    <div className={`flex gap-0.5 ${className}`} style={{ height }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`flex-1 ${i < n ? 'bg-ink' : 'bg-track'}`} />
      ))}
    </div>
  )
}

// A small context swatch (recovery = sage, training = lavender, neutral = ink).
export function Swatch({ tone = 'ink', size = 9, className = '' }) {
  const bg = tone === 'sage' ? 'bg-sage' : tone === 'lavender' ? 'bg-lavender' : tone === 'cobalt' ? 'bg-cobalt' : 'bg-ink'
  return <span aria-hidden className={`inline-block border border-line-strong ${bg} ${className}`} style={{ width: size, height: size }} />
}

/* --- status: shape + word, never color alone ----------------------------- */
const HATCH = 'repeating-linear-gradient(45deg,#121210 0 1.5px,transparent 1.5px 4px)'

// The connection/state marks from the design's STATE REFERENCE.
function MarkGlyph({ status }) {
  const box = { width: 11, height: 11 }
  if (status === 'connected' || status === 'fresh')
    return <span aria-hidden className="flex shrink-0 items-center justify-center bg-ink text-[8px] font-bold leading-none text-oncobalt" style={box}>✓</span>
  if (status === 'error')
    return <span aria-hidden className="flex shrink-0 items-center justify-center bg-ink text-[9px] font-bold leading-none text-oncobalt" style={box}>!</span>
  if (status === 'syncing')
    return <span aria-hidden className="shrink-0 border border-ink" style={{ ...box, backgroundImage: HATCH }} />
  if (status === 'stale' || status === 'unavailable')
    return <span aria-hidden className="shrink-0 border border-ink bg-paper" style={box} />
  if (status === 'demo')
    return <span aria-hidden className="flex shrink-0 items-center justify-center border border-ink bg-paper" style={box}><span className="bg-ink" style={{ width: 3, height: 3 }} /></span>
  // disconnected
  return <span aria-hidden className="shrink-0 border border-dashed border-line-heavy" style={box} />
}

const WORDS = {
  connected: 'Connected', syncing: 'Syncing', stale: 'Stale', disconnected: 'Not connected',
  error: 'Error', demo: 'Demo data', fresh: 'Fresh', unavailable: 'No data',
}

// Shape + word status mark. Word carries the meaning so color is never the only
// signal. `label` overrides the default word.
export function StatusMark({ status, label, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <MarkGlyph status={status} />
      <span className="eyebrow text-ink/80">{label || WORDS[status] || WORDS.disconnected}</span>
    </span>
  )
}
export const StatusTag = StatusMark // compat alias

// Provenance for any wearable-derived value: source + freshness (or demo).
export function SourceLabel({ signal, className = '' }) {
  if (!signal) return null
  const provider = signal.provider ? signal.provider[0].toUpperCase() + signal.provider.slice(1) : 'Signal'
  const status = signal.demo ? 'demo' : signal.freshness || 'fresh'
  // flex-wrap + no dot separator so this degrades to two clean lines
  // ("OURA" / "▣ DEMO DATA") in a narrow column instead of overflowing it.
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted ${className}`}>
      <span className="font-semibold uppercase tracking-[0.1em]">{provider}</span>
      <StatusMark status={status} className="[&_.eyebrow]:text-muted" />
    </span>
  )
}

/* --- controls ------------------------------------------------------------ */
// Square on/off switch — cobalt when on, ink outline when off, labelled ON/OFF.
export function Toggle({ checked, onChange, label, id }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-[50px] shrink-0 transition ${checked ? 'bg-cobalt' : 'border-[1.5px] border-line-heavy bg-transparent'}`}
    >
      <span
        className={`absolute top-1/2 h-[21px] w-[21px] -translate-y-1/2 ${checked ? 'right-[3px] bg-white' : 'left-[2px] bg-ink/30'}`}
      />
      <span
        aria-hidden
        className={`absolute top-1/2 -translate-y-1/2 text-[9px] font-bold tracking-[0.08em] ${checked ? 'left-2 text-oncobalt' : 'right-1.5 text-muted'}`}
      >
        {checked ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

/* --- feedback ------------------------------------------------------------ */
export function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-muted">
      <span className="h-4 w-4 animate-spin border-2 border-line border-t-cobalt" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <div className="flex items-start gap-2 border border-alert/40 bg-alert/5 px-3 py-2 text-sm text-alert">
      <span aria-hidden className="mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center bg-alert text-[9px] font-bold leading-none text-white">!</span>
      <span>{children}</span>
    </div>
  )
}

// Dashed hairline panel — the design's insufficient-data / empty language.
export function EmptyState({ title, children, className = '' }) {
  return (
    <div className={`border border-dashed border-line-strong px-4 py-10 text-center ${className}`}>
      {title && <div className="serif text-lg text-ink">{title}</div>}
      {children && <div className="mt-1.5 text-sm text-muted">{children}</div>}
    </div>
  )
}

// A "Why?" disclosure — a circled ? that opens a transparent rationale list.
export function Why({ items = [], label = 'Why this?' }) {
  if (!items.length) return null
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3">
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="flex h-[19px] w-[19px] items-center justify-center rounded-full border-[1.5px] border-cobalt text-[11px] font-bold text-cobalt">?</span>
          <span className="text-sm font-semibold tracking-[0.02em] text-cobalt">{label}</span>
        </span>
        <span aria-hidden className="text-cobalt transition group-open:rotate-90">›</span>
      </summary>
      <ul className="mb-1 space-y-1.5 border-l-2 border-line pl-3 text-sm text-muted">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </details>
  )
}
