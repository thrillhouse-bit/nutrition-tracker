import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { Button, ErrorNote, inputCls } from './ui.jsx'

// Retail products use these 1D symbologies. Restricting the hint set makes the
// decoder faster and cuts false reads from QR/other formats in the frame.
const RETAIL_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.ITF,
]

function makeReader() {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, RETAIL_FORMATS)
  return new BrowserMultiFormatReader(hints)
}

export default function Scanner({ onDetected }) {
  const videoRef = useRef(null)
  const controlsRef = useRef(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(true)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let cancelled = false
    const reader = makeReader()

    async function start() {
      try {
        // Prefer the rear camera on phones.
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              // Stop immediately so we don't fire twice for one scan.
              controlsRef.current?.stop()
              onDetected(result.getText())
            }
          },
        )
        if (cancelled) {
          controls.stop()
          return
        }
        controlsRef.current = controls
        setStarting(false)
      } catch (err) {
        if (cancelled) return
        setStarting(false)
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access, or type the barcode below.'
            : 'Could not start the camera. Type the barcode below instead.',
        )
      }
    }
    start()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
    }
  }, [onDetected])

  const submitManual = (e) => {
    e.preventDefault()
    const code = manual.trim()
    if (/^\d{6,14}$/.test(code)) onDetected(code)
    else setError('Enter a valid 6–14 digit barcode.')
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {/* Aiming guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-24 w-4/5 rounded-lg border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {starting && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
            Starting camera…
          </div>
        )}
      </div>

      <p className="text-center text-xs text-slate-400">Point the camera at a product barcode.</p>

      <ErrorNote>{error}</ErrorNote>

      <form onSubmit={submitManual} className="flex gap-2">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          inputMode="numeric"
          placeholder="…or enter barcode digits"
          className={inputCls}
        />
        <Button type="submit" variant="outline">
          Look up
        </Button>
      </form>
    </div>
  )
}
