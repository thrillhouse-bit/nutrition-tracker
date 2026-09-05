export const ACCENT_PALETTES = {
  cobalt: { label: 'Cobalt', color: '#1f35c4', ink: '#16289b', soft: '#e9ecf9', progressStart: '#e9ecf9', progressMid: '#7185f6', progressEnd: '#16289b' },
  emerald: { label: 'Emerald', color: '#087a5a', ink: '#056247', soft: '#dff4eb', progressStart: '#dff4eb', progressMid: '#42ad88', progressEnd: '#056247' },
  ruby: { label: 'Ruby', color: '#a82945', ink: '#831d35', soft: '#f8e4e9', progressStart: '#f8e4e9', progressMid: '#cf6680', progressEnd: '#831d35' },
}
export const validAccent = (value) => Object.hasOwn(ACCENT_PALETTES, value) ? value : 'cobalt'
export function applyAccentTheme(value) {
  const accent = validAccent(value)
  if (typeof document !== 'undefined') {
    const p = ACCENT_PALETTES[accent]
    const r = document.documentElement
    r.dataset.accent = accent
    r.style.setProperty('--color-cobalt', p.color)
    r.style.setProperty('--color-cobalt-ink', p.ink)
    r.style.setProperty('--color-cobalt-soft', p.soft)
    r.style.setProperty('--color-progress-start', p.progressStart)
    r.style.setProperty('--color-progress-mid', p.progressMid)
    r.style.setProperty('--color-progress-end', p.progressEnd)
    r.style.setProperty('--color-oncobalt', '#fff')
  }
  return accent
}
