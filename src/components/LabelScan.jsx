import { useRef, useState } from 'react'
import { api } from '../api/client.js'
import { Button, ErrorNote, Spinner } from './ui.jsx'

// Read a File into { base64, mediaType }, stripping the data: URL prefix.
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const base64 = result.slice(result.indexOf(',') + 1)
      resolve({ base64, mediaType: file.type || 'image/jpeg' })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function LabelScan({ onParsed }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onPick = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setPreview(URL.createObjectURL(file))
    setBusy(true)
    try {
      const { base64, mediaType } = await readImage(file)
      const { food } = await api.parseLabel(base64, mediaType)
      onParsed(food)
    } catch (err) {
      setError(
        err.status === 501
          ? 'Label OCR needs the Claude API key set on the server (ANTHROPIC_API_KEY).'
          : err.message || 'Could not read that label.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      <div
        className={`flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border ${
          preview ? 'border-line bg-black/5' : 'border-dashed border-line bg-card'
        }`}
      >
        {preview ? (
          <img src={preview} alt="Nutrition label" className="h-full w-full object-contain" />
        ) : (
          <div className="px-6 text-center">
            <div className="eyebrow mb-2 text-cobalt">Label scan</div>
            <p className="text-sm text-muted">
              Photograph the Nutrition Facts panel — Claude reads it into the fields for you.
            </p>
          </div>
        )}
      </div>

      {busy && <Spinner label="Reading label…" />}
      <ErrorNote>{error}</ErrorNote>

      <Button onClick={() => inputRef.current?.click()} disabled={busy} className="w-full">
        {preview ? 'Retake / choose another' : 'Take label photo'}
      </Button>
    </div>
  )
}
