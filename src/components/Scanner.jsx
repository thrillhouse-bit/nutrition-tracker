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
const CAMERA_START_TIMEOUT_MS = 8000

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
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [permissionState, setPermissionState] = useState('unknown')
  const manualRef = useRef(null)

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
    const startupTimer = setTimeout(() => {
      if (cancelled) return
      setStarting(false)
      setError('The camera is taking longer than expected. Check browser permission, try again, or type the barcode below.')
    }, CAMERA_START_TIMEOUT_MS)

    async function start() {
      try {
        // The browser owns the durable grant for this origin. Read it before
        // opening the stream so a known denial gets a useful recovery path and
        // a previously granted camera is presented as ready instead of as a
        // new consent flow. Unsupported browsers simply fall through to the
        // normal getUserMedia path.
        let permission = null
        if (typeof navigator !== 'undefined' && typeof navigator.permissions?.query === 'function') {
          try { permission = await navigator.permissions.query({ name: 'camera' }) } catch { permission = null }
        }
        if (cancelled) return
        if (permission?.state) setPermissionState(permission.state)
        if (permission?.state === 'denied') {
          clearTimeout(startupTimer)
          setStarting(false)
          setError('Camera access is blocked for this site. Allow it in your browser settings, or type the barcode below.')
          return
        }
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
        clearTimeout(startupTimer)
        setStarting(false)
        setPermissionState('granted')
        setError('')
      } catch (err) {
        if (cancelled) return
        clearTimeout(startupTimer)
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
      clearTimeout(startupTimer)
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
  }, [cameraAttempt])

  const retryCamera = () => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setError('')
    setStarting(true)
    setCameraAttempt((attempt) => attempt + 1)
  }

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
      {permissionState === 'granted' && !error && <p className="text-center text-[11px] text-muted">Camera access is saved by your browser for this site.</p>}

      <ErrorNote>{error}</ErrorNote>
      {error && (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={retryCamera}>Try camera again</Button>
          <Button type="button" variant="subtle" onClick={() => manualRef.current?.focus()}>Type barcode</Button>
        </div>
      )}

      <form noValidate onSubmit={submitManual} className="space-y-1.5">
        <label htmlFor="manual-barcode" className="eyebrow text-ink">Barcode digits</label>
        <div className="flex gap-2">
        <input
          ref={manualRef}
          id="manual-barcode"
          aria-describedby="manual-barcode-help"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          placeholder="6–14 digits"
          className={inputCls}
        />
        <Button type="submit" variant="outline">
          Look up
        </Button>
        </div>
        <p id="manual-barcode-help" className="text-[11px] text-muted">Use the number printed directly below the barcode.</p>
      </form>
    </div>
  )
}
