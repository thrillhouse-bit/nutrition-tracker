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

  // App.jsx passes an inline handler, so `onDetected` gets a new identity on
  // every App re-render — including one that lands *after* the camera is
  // already starting (openAdd() kicks off a recentFoods() fetch alongside
  // opening the scan sheet; that fetch resolving mid-startup is one way this
  // fires, but any App state change while the sheet is open does it). Read
  // the callback through a ref instead of depending on it directly below, so
  // the camera's start/stop effect only reruns on mount/unmount, never on a
  // caller re-render.
  const onDetectedRef = useRef(onDetected)
  useEffect(() => { onDetectedRef.current = onDetected }, [onDetected])

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
              onDetectedRef.current(result.getText())
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
    // Mount/unmount only — see onDetectedRef above for why `onDetected` is
    // deliberately not a dependency here. A prior version restarted the
    // camera (tearing down a live stream and racing a second
    // getUserMedia/attach against the teardown) on every caller re-render;
    // measured headless with a fake camera, that race left <video> with
    // srcObject=null / readyState=0 / videoWidth=0 in 2 of 3 runs, even
    // though both getUserMedia calls succeeded and permission was granted —
    // the restart itself was 100% reproducible, only the corruption's exact
    // timing was a race.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitManual = (e) => {
    e.preventDefault()
    const code = manual.trim()
    if (/^\d{6,14}$/.test(code)) onDetected(code)
    else setError('Enter a valid 6–14 digit barcode.')
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden border border-line bg-ink">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {/* Aiming guide */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-24 w-4/5 border-2 border-cobalt shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        {starting && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-oncobalt">
            Starting camera…
          </div>
        )}
      </div>

      <p className="text-center text-xs text-faint">Point the camera at a product barcode.</p>

      <ErrorNote>{error}</ErrorNote>

      <form noValidate onSubmit={submitManual} className="flex gap-2">
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
