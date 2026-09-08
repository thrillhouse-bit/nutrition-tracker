export const ACCENT_PALETTES = {
  sapphire: { label: 'Sapphire', color: '#1f35c4', ink: '#16289b', soft: '#e9ecf9', progressStart: '#e9ecf9', progressMid: '#7185f6', progressEnd: '#16289b' },
  emerald: { label: 'Emerald', color: '#087a5a', ink: '#056247', soft: '#dff4eb', progressStart: '#dff4eb', progressMid: '#42ad88', progressEnd: '#056247' },
  ruby: { label: 'Ruby', color: '#a82945', ink: '#831d35', soft: '#f8e4e9', progressStart: '#f8e4e9', progressMid: '#cf6680', progressEnd: '#831d35' },
  silver: { label: 'Silver', color: '#66717d', ink: '#46505b', soft: '#edf0f2', progressStart: '#edf0f2', progressMid: '#9aa5af', progressEnd: '#46505b' },
  gold: { label: 'Gold', color: '#8a6200', ink: '#674900', soft: '#fbf2d8', progressStart: '#fbf2d8', progressMid: '#c79a2b', progressEnd: '#674900' },
  crystal: { label: 'Crystal', color: '#0a7180', ink: '#075663', soft: '#ddf3f6', progressStart: '#ddf3f6', progressMid: '#55b9c7', progressEnd: '#075663' },
  diamond: { label: 'Diamond', color: '#526d91', ink: '#3d5574', soft: '#e7edf5', progressStart: '#e7edf5', progressMid: '#8fa7c5', progressEnd: '#3d5574' },
  pearl: { label: 'Pearl', color: '#756579', ink: '#58495d', soft: '#f0e9f1', progressStart: '#f0e9f1', progressMid: '#aa98ae', progressEnd: '#58495d' },
}
export const validAccent = (value) => value === 'cobalt' ? 'sapphire' : Object.hasOwn(ACCENT_PALETTES, value) ? value : 'sapphire'
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
