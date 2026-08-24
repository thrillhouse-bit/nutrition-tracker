// Shared editorial primitives. Paper ground, cobalt primary, high-contrast
// serif numerals, crisp hairlines. Status is never color-only — every state
// carries a label or glyph too (accessibility).
import { fmt } from '../lib/nutrition.js'

export function Button({ variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold tracking-tight transition disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2'
  const variants = {
    primary: 'bg-cobalt text-oncobalt hover:brightness-110 active:brightness-95',
    outline: 'border border-line-strong text-ink hover:bg-black/5',
    ghost: 'text-ink hover:bg-black/5',
    quiet: 'text-muted hover:text-ink hover:bg-black/5',
    danger: 'border border-alert/40 text-alert hover:bg-alert/5',
  }
  return <button className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props} />
}

export const inputCls =
  'w-full rounded-md border border-line bg-card px-3 py-2.5 text-ink placeholder:text-faint outline-none focus:border-cobalt focus:ring-2 focus:ring-cobalt/20'

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      {label && <span className="eyebrow mb-1 block">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  )
}

// A white sheet slides up from the bottom — reserved for meaningful moments
// (confirm, save, a recommendation detail).
export function Sheet({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const width = size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className={`w-full ${width} max-h-[92vh] overflow-y-auto rounded-t-xl border border-line bg-card p-5 shadow-2xl sm:rounded-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="serif text-xl font-semibold text-ink">{title}</h2>
            <button onClick={onClose} className="rounded-md px-2 py-1 text-muted hover:bg-black/5" aria-label="Close">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}
export const Modal = Sheet // alias for existing call sites

export function Card({ className = '', children, as: Tag = 'div', ...props }) {
  return (
    <Tag className={`rounded-lg border border-line bg-card ${className}`} {...props}>
      {children}
    </Tag>
  )
}

export function SectionTitle({ children, right }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="eyebrow">{children}</h3>
      {right}
    </div>
  )
}

export function Rule({ className = '' }) {
  return <hr className={`border-0 border-t border-line ${className}`} />
}

// Big serif numeral with a small label — the editorial data mark.
export function Stat({ label, value, unit, decimals = 0, size = 'md' }) {
  const cls = size === 'lg' ? 'text-3xl' : 'text-xl'
  return (
    <div>
      <div className={`numeral ${cls} font-semibold leading-none text-ink`}>
        {typeof value === 'number' ? fmt(value, decimals) : value}
        {unit ? <span className="ml-0.5 font-sans text-xs font-medium text-muted">{unit}</span> : null}
      </div>
      {label && <div className="eyebrow mt-1">{label}</div>}
    </div>
  )
}

// Thin progress meter; over-target reads amber and is labelled, not just colored.
export function Meter({ value, target, over }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const isOver = over ?? (target > 0 && value > target)
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
      <div className={`h-full rounded-full ${isOver ? 'bg-warn' : 'bg-cobalt'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const STATUS = {
  connected: { text: 'Connected', dot: '●', cls: 'text-good' },
  syncing: { text: 'Syncing', dot: '◐', cls: 'text-cobalt' },
  stale: { text: 'Stale', dot: '◑', cls: 'text-warn' },
  demo: { text: 'Demo data', dot: '◇', cls: 'text-lavender' },
  disconnected: { text: 'Not connected', dot: '○', cls: 'text-faint' },
  error: { text: 'Error', dot: '▲', cls: 'text-alert' },
  fresh: { text: 'Fresh', dot: '●', cls: 'text-good' },
  unavailable: { text: 'No data', dot: '○', cls: 'text-faint' },
}

// Status pill that shows a glyph + word (never color alone).
export function StatusTag({ status, className = '' }) {
  const s = STATUS[status] || STATUS.disconnected
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.cls} ${className}`}>
      <span aria-hidden>{s.dot}</span>
      {s.text}
    </span>
  )
}

// Provenance line for any wearable-derived value: source + freshness + demo.
export function SourceLabel({ signal, className = '' }) {
  if (!signal) return null
  const provider = signal.provider ? signal.provider[0].toUpperCase() + signal.provider.slice(1) : 'Signal'
  const fresh = signal.demo ? 'demo' : signal.freshness
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] text-faint ${className}`}>
      <span className="font-medium text-muted">{provider}</span>
      <span aria-hidden>·</span>
      <StatusTag status={signal.demo ? 'demo' : signal.freshness} />
    </span>
  )
}

// Accessible on/off switch.
export function Toggle({ checked, onChange, label, id }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${checked ? 'border-cobalt bg-cobalt' : 'border-line bg-black/10'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-cobalt" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <div className="rounded-md border border-alert/30 bg-alert/5 px-3 py-2 text-sm text-alert">{children}</div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="rounded-lg border border-dashed border-line py-10 text-center">
      {title && <div className="serif text-lg text-ink">{title}</div>}
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  )
}

// A "Why?" disclosure for transparent recommendations/adjustments.
export function Why({ items = [], label = 'Why?' }) {
  if (!items.length) return null
  return (
    <details className="group mt-3">
      <summary className="cursor-pointer list-none text-sm font-semibold text-cobalt">
        {label} <span className="text-muted group-open:hidden">▸</span>
        <span className="hidden text-muted group-open:inline">▾</span>
      </summary>
      <ul className="mt-2 space-y-1.5 border-l-2 border-line pl-3 text-sm text-muted">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </details>
  )
}
