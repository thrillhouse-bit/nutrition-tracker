// Shared primitives for the Fueling Intelligence visual system.
//
// Rules from the design: sharp rectangles (no rounded corners except true
// circles), hairline rules in ink, cobalt as the single accent, status shown by
// SHAPE + WORD (never color alone), Bodoni numerals, Archivo labels. White is a
// moment that matters. Every control has a visible focus ring and a real label.
import { useEffect, useRef, useState } from 'react'
import { fmt, num } from '../lib/nutrition.js'

/* --- buttons ------------------------------------------------------------- */
// Block CTA: uppercase, tracked, bold, sharp. The design's primary language.
export function Button({ variant = 'primary', className = '', type = 'button', onClick, ...props }) {
  const base =
    'inline-flex items-center justify-center gap-2 px-5 py-4 text-xs font-bold uppercase tracking-[0.13em] transition disabled:opacity-40 disabled:pointer-events-none'
  const variants = {
    primary: 'bg-cobalt text-oncobalt hover:bg-cobalt-ink',
    outline: 'border-[1.5px] border-ink text-ink hover:bg-fill',
    subtle: 'border-[1.5px] border-line-strong text-muted hover:bg-fill',
    danger: 'border-[1.5px] border-alert/60 text-alert hover:bg-alert/5',
    dangerSolid: 'border-[1.5px] border-alert bg-alert text-white hover:bg-alert/90',
  }
  return <button type={type} onClick={onClick} className={`${base} ${variants[variant] || variants.primary} ${className}`} {...props} />
}

// Inline text action — cobalt, sentence case, optional trailing chevron.
export function TextButton({ children, chevron = false, className = '', type = 'button', onClick, ...props }) {
  return (
    <button
      type={type}
      onClick={onClick}
      // min-h-11: every rendered TextButton measured 20-36px tall — under the
      // 44px touch floor. Call sites with tight rhythm compensate with
      // negative margins (the Toggle's hit-area pattern).
      className={`inline-flex min-h-11 items-center gap-1.5 text-cobalt font-semibold tracking-[0.02em] hover:text-cobalt-ink ${className}`}
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

// Bordered −/value/+ servings stepper — the one control every servings-editing
// surface uses (FoodConfirm confirming a new log, EntryEditor editing one
// already logged), so the same conceptual task looks and behaves identically
// everywhere. h-11/w-11 buttons meet the 44px touch floor.
export function ServingStepper({ value, onChange, min = 0.25, step = 0.5, className = '' }) {
  const bump = (delta) => onChange(Math.max(min, Math.round((num(value) + delta) * 100) / 100))
  return (
    // inline-flex, not flex: a plain `flex` box blockifies to its parent's full
    // width, which is invisible inside FoodConfirm's `justify-between` row (the
    // sibling eyebrow already constrains it) but stretched this control edge to
    // edge the moment it was dropped into EntryEditor's stacked block layout.
    <div className={`inline-flex items-stretch border-[1.5px] border-ink ${className}`}>
      <button
        type="button"
        onClick={() => bump(-step)}
        aria-label="Fewer servings"
        className="serif flex h-11 w-11 items-center justify-center border-r-[1.5px] border-ink text-[20px] text-muted hover:bg-fill"
      >
        −
      </button>
      <div className="numeral flex min-w-[78px] items-center justify-center px-2 text-[19px] text-ink">
        {fmt(value, 2)}
      </div>
      <button
        type="button"
        onClick={() => bump(step)}
        aria-label="More servings"
        className="serif flex h-11 w-11 items-center justify-center border-l-[1.5px] border-ink text-[20px] text-cobalt hover:bg-fill"
      >
        +
      </button>
    </div>
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

// Focusable-selector for the trap below — the same list every modal-focus
// implementation reaches for; deliberately excludes [tabindex="-1"] JS-only
// focus targets so Tab cycling never lands somewhere invisible.
const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Bottom sheet — a white moment that slides up. Sharp top edge, grabber bar,
// warm dim behind. Reserved for confirm / save / a recommendation detail.
//
// Keyboard/focus contract (audited — none of this existed before): opening
// moves focus onto the sheet's own close button (always rendered, so always a
// safe first stop, per the comment below); Tab/Shift+Tab is trapped inside
// the sheet while it's open (a background page has no business receiving
// keystrokes while a modal covers it); Escape closes it; closing — by
// Escape, the ✕, or the backdrop — returns focus to whatever had it before
// the sheet opened (the trigger button), so a keyboard user doesn't lose
// their place in the page underneath. Every open Sheet in the app (Why's
// disclosure, the add-food flow, FoodConfirm, the entry editor) inherits this
// from here rather than each carrying its own copy.
export function Sheet({ open, onClose, title, children, size = 'md', grabber = true, closeOnBackdrop = true }) {
  const panelRef = useRef(null)
  const closeBtnRef = useRef(null)
  const returnFocusRef = useRef(null)

  useEffect(() => {
    if (!open) return
    returnFocusRef.current = document.activeElement
    closeBtnRef.current?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll(FOCUSABLE)
      if (!focusables.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      returnFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  const width = size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 sm:items-center" onClick={closeOnBackdrop ? onClose : undefined}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || undefined}
        className={`w-full ${width} max-h-[92vh] overflow-y-auto border border-line bg-card p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-[0_-3px_14px_rgb(18_18_16/0.12)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {grabber && <div className="mx-auto mb-4 h-1 w-11 bg-line-strong" />}
        {/* The close button always renders, even with no title — a step
            that owns its own header (e.g. FoodConfirm) still needs a
            visible way out beyond "tap the dim backdrop". It's also always
            the first element in DOM order, which is what makes it a safe,
            simple initial-focus target above regardless of a step's content. */}
        <div className={`mb-4 flex items-center ${title ? 'justify-between' : 'justify-end'}`}>
          {title && <h2 className="serif text-xl text-ink">{title}</h2>}
          {/* 44px hit area around the small glyph, the Toggle's pattern —
              measured 29x32 before, the primary dismissal on every sheet */}
          <button ref={closeBtnRef} onClick={onClose} className="-mr-2 flex h-11 w-11 items-center justify-center text-muted hover:text-ink" aria-label="Close">✕</button>
        </div>
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
// Interpolates between two "#rrggbb" colors at t in [0, 1].
function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

// Design note (owner, 26 Aug 2026): this ONE bar is a deliberate, scoped
// exception to "cobalt as the single accent" above — each filled segment
// shades from pale cobalt to full cobalt-ink by its position in the FULL
// bar (not the filled count), so a given segment's color is stable through
// the day: early on, only a few pale segments show; by end of day the same
// positions read progressively darker. A ratio, not a literal color name,
// still drives every other reading of progress (Meter, etc.) — this is the
// one place the value itself is also encoded as a gradient.
const SEGMENT_LIGHT = '#e9ecf9' // --color-cobalt-soft
const SEGMENT_DARK = '#16289b' // --color-cobalt-ink

export function SegmentBar({ total = 15, filled = 0, height = 7, className = '' }) {
  const n = Math.max(0, Math.min(total, Math.round(filled)))
  return (
    <div className={`flex gap-0.5 ${className}`} style={{ height }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={i < n ? '' : 'bg-track'}
          style={i < n ? { flex: 1, backgroundColor: mixHex(SEGMENT_LIGHT, SEGMENT_DARK, total > 1 ? i / (total - 1) : 0) } : { flex: 1 }}
        />
      ))}
    </div>
  )
}

// Compact circular dial — a true circle (allowed under the "no rounded
// corners" rule), ink track + cobalt arc for a bounded 0..max reading. Added
// for Today's Daily Signals redesign (26 Aug 2026): the readiness score is
// the one signal here that's genuinely a bounded 0-100 gauge, so a dial reads
// as an instrument rather than a decorative flourish — the product ask's
// "one intentional signature visual treatment... a compact dial," used once,
// not stamped on all three signals (sleep and workout aren't 0..max scores,
// so they keep a plain typographic treatment instead of a forced dial).
// Purely decorative (aria-hidden) — the numeral rendered on top by the
// caller is what a screen reader gets, same division of labor as Meter/
// SegmentBar's bars vs. the numerals beside them elsewhere in this file.
// Raw hex (not var(--color-...)) matches Insights.jsx's own inline SVG charts
// (#1F35C4/#121210) rather than inventing a new pattern for this one shape.
// strokeLinecap 'butt' (not 'round') keeps the arc's ends sharp, matching the
// design's sharp-rectangle ethos even on this one circular exception.
export function Dial({ value, max = 100, size = 64, thickness = 6, className = '' }) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const pct = max > 0 ? Math.max(0, Math.min(1, num(value) / max)) : 0
  return (
    <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={className}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#121210" strokeOpacity="0.16" strokeWidth={thickness} />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1F35C4"
          strokeWidth={thickness}
          strokeLinecap="butt"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  )
}

// A small context swatch (recovery = mist, training = sand, neutral = ink).
// Legacy sage/lavender tones alias to mist/sand.
export function Swatch({ tone = 'ink', size = 9, className = '' }) {
  const bg =
    tone === 'mist' || tone === 'sage' ? 'bg-mist'
      : tone === 'sand' || tone === 'lavender' ? 'bg-sand'
        : tone === 'cobalt' ? 'bg-cobalt' : 'bg-ink'
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
    return <span aria-hidden className="flex shrink-0 items-center justify-center bg-alert text-[9px] font-bold leading-none text-white" style={box}>!</span>
  if (status === 'syncing')
    return <span aria-hidden className="shrink-0 border border-ink" style={{ ...box, backgroundImage: HATCH }} />
  if (status === 'stale' || status === 'unavailable')
    return <span aria-hidden className="shrink-0 border border-ink bg-paper" style={box} />
  if (status === 'demo')
    return <span aria-hidden className="flex shrink-0 items-center justify-center border border-ink bg-paper" style={box}><span className="bg-ink" style={{ width: 3, height: 3 }} /></span>
  // disconnected AND not-configured share this dashed "nothing active" shape
  // (same family as stale/unavailable sharing one hollow glyph above) — the
  // WORD is what tells them apart: "Not connected" (this user hasn't linked
  // an account) vs. "Not configured" (the server itself has no OAuth client
  // set up, so no user on this box could connect one).
  return <span aria-hidden className="shrink-0 border border-dashed border-line-heavy" style={box} />
}

const WORDS = {
  connected: 'Connected', syncing: 'Syncing', stale: 'Stale', disconnected: 'Not connected',
  'not-configured': 'Not configured', error: 'Error', demo: 'Demo data', fresh: 'Fresh', unavailable: 'No data',
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

// Short forms of the STATE REFERENCE words, for the <360px single-line chip
// below only — StatusMark's own defaults (WORDS above) stay the full words
// everywhere else in the app.
const SHORT_WORDS = { demo: 'Demo', unavailable: 'No data' }

// Provenance for any wearable-derived value: source + freshness (or demo).
//
// `compact`: the masthead's global sync line already discloses "SAMPLE
// SIGNALS · NOT A LIVE SYNC" once per screen when every present signal is
// demo (Today.jsx) — an audit found each ContextCell repeating "Demo data"
// underneath it, saying the same thing a 4th time on one all-demo screen.
// Callers pass this only from that exact state, and it only drops anything
// when THIS signal is itself demo — a live/stale/unavailable cell is never
// what the global line said, so it always keeps its own mark. A genuinely
// mixed live/demo screen never sets this (the global line names a live
// provider instead), so a demo cell there still carries full disclosure —
// the one screen state where the global line is silent about it.
export function SourceLabel({ signal, compact = false, className = '' }) {
  if (!signal) return null
  const provider = signal.provider ? signal.provider[0].toUpperCase() + signal.provider.slice(1) : 'Signal'
  const status = signal.demo ? 'demo' : signal.freshness || 'fresh'

  if (compact && status === 'demo') {
    return (
      <span className={`inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.1em] text-muted ${className}`}>
        {provider}
      </span>
    )
  }

  // A 3-column context strip leaves ~71px of inner width per cell at 320px
  // (measured) for the whole provider+status line — "Oura" beside a full
  // "Demo data"/"Stale" mark never fits there, so flex-wrap (below) put them
  // on two rows at EVERY width tested, 320 through 430 (measured: "Oura" at
  // y172, "Demo data" at y193, same left edge, unchanged from 320 to 430).
  // That two-line form is fine once the column has room to spare, but below
  // 360px it was landing right under "Readiness"/"Sleep"/"Workouts" and
  // breaking the three-column rhythm the audit flagged. Two sibling spans,
  // toggled by the same 360px line the audit named (max-[359px] / min-[360]
  // are exact complements, so exactly one ever renders) — a single-line,
  // shorter-worded chip under it, the original wrap-permitted form at and
  // above it. Still shape + word either way, per this file's own rule.
  return (
    <span className={`text-[11px] text-muted ${className}`}>
      <span className="hidden flex-wrap items-center gap-x-1.5 gap-y-1 min-[360px]:flex">
        <span className="font-semibold uppercase tracking-[0.1em]">{provider}</span>
        <StatusMark status={status} className="[&_.eyebrow]:text-muted" />
      </span>
      <span className="flex items-center gap-1 whitespace-nowrap max-[359px]:flex min-[360px]:hidden">
        <span className="shrink-0 font-semibold uppercase tracking-[0.03em]">{provider}</span>
        <StatusMark
          status={status}
          label={SHORT_WORDS[status] || WORDS[status]}
          className="shrink-0 [&_.eyebrow]:text-muted [&_.eyebrow]:text-[8.5px] [&_.eyebrow]:tracking-[0.02em]"
        />
      </span>
    </span>
  )
}

/* --- controls ------------------------------------------------------------ */
// Square on/off switch — cobalt when on, ink outline when off, labelled ON/OFF.
// The visible track is 50×28, but the button is 44px tall (a WCAG 2.5.5 target)
// with the track centred inside, so the hit area is comfortable on touch.
export function Toggle({ checked, onChange, label, id }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative flex h-11 w-[50px] shrink-0 items-center justify-center"
    >
      <span className={`relative block h-7 w-[50px] transition ${checked ? 'bg-cobalt' : 'border-[1.5px] border-line-heavy bg-transparent'}`}>
        <span
          className={`absolute top-1/2 h-[21px] w-[21px] -translate-y-1/2 ${checked ? 'right-[3px] bg-white' : 'left-[2px] bg-ink/30'}`}
        />
        <span
          aria-hidden
          className={`absolute top-1/2 -translate-y-1/2 text-[9px] font-bold tracking-[0.08em] ${checked ? 'left-2 text-oncobalt' : 'right-1.5 text-muted'}`}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
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
    <div role="alert" className="flex items-start gap-2 border border-alert/40 bg-alert/5 px-3 py-2 text-sm text-alert">
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

// A "Why?" disclosure — a circled ? that opens the rationale as a bottom
// Sheet. Used to be a native <details>/<summary>: real, keyboard-reachable,
// but not a button (no role, Enter/Space activation only by accident of the
// element, no aria-expanded) and its content was locked to plain strings
// inline in the page flow. A real button plus the app's own Sheet gets
// the semantics for free and gives call sites room to pass richer content —
// `items` can be plain strings (Plan.jsx's "why did my target change") or
// any React node (Today.jsx mixes in StatusMark/SourceLabel for signal
// freshness) — a <li> renders either the same way.
export function Why({ items = [], label = 'Why this?' }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="flex h-[19px] w-[19px] items-center justify-center rounded-full border-[1.5px] border-cobalt text-[11px] font-bold text-cobalt">?</span>
          <span className="text-sm font-semibold tracking-[0.02em] text-cobalt">{label}</span>
        </span>
        <span aria-hidden className="text-cobalt">›</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <ul className="space-y-2.5 border-l-2 border-line pl-3 text-sm text-muted">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
