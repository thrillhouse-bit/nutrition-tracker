// Small presentational primitives shared across views. Deliberately plain —
// this is the plumbing pass; Claude Design will restyle later.
import { fmt } from '../lib/nutrition.js'

export function Button({ variant = 'primary', className = '', ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
    ghost: 'bg-white/5 text-slate-100 hover:bg-white/10',
    danger: 'bg-red-500/90 text-white hover:bg-red-500',
    outline: 'border border-white/15 text-slate-100 hover:bg-white/5',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}

export function Modal({ open, onClose, title, children, wide = false }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? 'sm:max-w-lg' : 'sm:max-w-md'} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-slate-900 p-5 shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-50">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-slate-200"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// Horizontal progress bar: consumed vs target for one nutrient.
export function TargetBar({ label, value, target, unit, decimals = 0 }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const over = target > 0 && value > target
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-200">{label}</span>
        <span className="tabular-nums text-slate-400">
          <span className={over ? 'text-amber-400' : 'text-slate-100'}>{fmt(value, decimals)}</span>
          {target ? <span className="text-slate-500"> / {fmt(target, decimals)} {unit}</span> : <span className="text-slate-500"> {unit}</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-amber-400' : 'bg-emerald-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function Stat({ label, value, unit }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2 text-center">
      <div className="text-base font-bold tabular-nums text-slate-50">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
        {unit ? <span className="lowercase"> ({unit})</span> : null}
      </div>
    </div>
  )
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-slate-400">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-emerald-400" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
      {children}
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20'
