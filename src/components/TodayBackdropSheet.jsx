import { useEffect, useRef, useState } from 'react'
import {
  DEFAULT_TODAY_BACKDROP,
  TODAY_BACKDROP_ACCEPT,
  TODAY_BACKDROP_SCENES,
  prepareTodayBackdropPhoto,
  saveTodayBackdrop,
  validateTodayBackdropFile,
} from '../lib/todayBackdrop.js'
import { Button, ErrorNote, Sheet } from './ui.jsx'

function formatBytes(bytes) {
  if (!bytes) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

function ScenePreview({ scene }) {
  return <span aria-hidden className="today-backdrop-preview block h-16 w-full border border-white/15" data-scene={scene} />
}

export default function TodayBackdropSheet({ open, onClose, userId, backdrop, onChange }) {
  const inputRef = useRef(null)
  const operationRef = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedScene = backdrop.kind === 'scene'
    ? TODAY_BACKDROP_SCENES.find((scene) => scene.id === backdrop.scene)
    : null
  useEffect(() => () => { operationRef.current += 1 }, [])

  const dismiss = () => {
    operationRef.current += 1
    setBusy(false)
    setError('')
    onClose()
  }

  const commit = (next) => {
    if (!userId || !saveTodayBackdrop(userId, next)) {
      setError('This browser could not save the backdrop. Storage may be full or unavailable; your current backdrop is unchanged.')
      return false
    }
    setError('')
    onChange(next)
    return true
  }

  const chooseScene = (scene) => commit({ kind: 'scene', scene })
  const choosePhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const validationError = validateTodayBackdropFile(file)
    if (validationError) { setError(validationError); return }
    const operation = operationRef.current + 1
    operationRef.current = operation
    setBusy(true)
    setError('')
    try {
      const prepared = await prepareTodayBackdropPhoto(file)
      if (operationRef.current !== operation) return
      commit(prepared)
    } catch (err) {
      if (operationRef.current !== operation) return
      setError(err.message || 'Body Current could not prepare that image. Your current backdrop is unchanged.')
    } finally {
      if (operationRef.current === operation) setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={dismiss} title="Change backdrop">
      <p className="text-sm leading-relaxed text-muted">Choose a real-world landscape or keep a personal photo on this device. Your personal backdrop is never uploaded.</p>

      <fieldset className="mt-5">
        <legend className="eyebrow mb-2">Current fields</legend>
        <div className="grid grid-cols-2 gap-2">
          {TODAY_BACKDROP_SCENES.map((scene) => {
            const selected = backdrop.kind === 'scene' && backdrop.scene === scene.id
            return (
              <button
                key={scene.id}
                type="button"
                aria-pressed={selected}
                onClick={() => chooseScene(scene.id)}
                disabled={busy}
                className={`min-h-11 cursor-pointer border p-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-cobalt bg-cobalt-soft' : 'border-line-strong hover:border-ink'}`}
              >
                <ScenePreview scene={scene.id} />
                <span className="mt-1.5 block text-xs font-bold text-ink">{scene.label}</span>
                <span className="mt-0.5 block text-[10px] leading-tight text-muted">{scene.credit ? `Photo · ${scene.credit}` : scene.description}</span>
              </button>
            )
          })}
        </div>
        {selectedScene?.credit && (
          <p className="mt-2 text-[11px] leading-relaxed text-muted" aria-live="polite">
            Selected photo by{' '}
            <a className="underline underline-offset-2 hover:text-ink" href={selectedScene.sourceUrl} target="_blank" rel="noreferrer">{selectedScene.credit}</a>
            {' '}on{' '}
            <a className="underline underline-offset-2 hover:text-ink" href={selectedScene.licenseUrl} target="_blank" rel="noreferrer">{selectedScene.sourceName}</a>.
          </p>
        )}
      </fieldset>

      <div className="mt-5 border-t border-line pt-4">
        <div className="eyebrow">Use my photo</div>
        <p id="today-backdrop-file-help" className="mt-1 text-xs leading-relaxed text-muted">JPEG, PNG, or WebP · 10 MB maximum. Body Current resizes it, removes embedded metadata, and stores at most 2 MB locally.</p>
        <input
          ref={inputRef}
          type="file"
          accept={TODAY_BACKDROP_ACCEPT}
          aria-label="Choose a personal backdrop photo"
          aria-describedby="today-backdrop-file-help"
          onChange={choosePhoto}
          className="sr-only"
          disabled={busy}
        />
        <Button variant="outline" className="mt-3 w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Preparing photo…' : backdrop.kind === 'photo' ? 'Choose a different photo' : 'Choose photo'}
        </Button>
        {backdrop.kind === 'photo' && (
          <div className="mt-3 border-l-2 border-cobalt pl-3">
            <div className="truncate text-sm font-bold text-ink">{backdrop.name}</div>
            <div className="mt-0.5 text-xs text-muted">{formatBytes(backdrop.encodedBytes)} · Stored on this device only</div>
            <Button variant="subtle" className="mt-3 w-full" disabled={busy} onClick={() => commit(DEFAULT_TODAY_BACKDROP)}>Remove photo and use Alpine</Button>
          </div>
        )}
      </div>
      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}
    </Sheet>
  )
}
