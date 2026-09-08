import { readAccountJson, writeAccountJson } from './privateStorage.js'

export const TODAY_BACKDROP_NAMESPACE = 'today-backdrop'
export const DEFAULT_TODAY_BACKDROP = Object.freeze({ kind: 'scene', scene: 'tide' })
export const TODAY_BACKDROP_SCENES = Object.freeze([
  { id: 'tide', label: 'Alpine', description: 'An original high-alpine current at first light' },
  { id: 'ridge', label: 'Ridge', description: 'Layered contours with a quieter horizon' },
  { id: 'dawn', label: 'Dawn', description: 'A warmer field for the start of the day' },
])
export const TODAY_BACKDROP_ACCEPT = 'image/jpeg,image/png,image/webp'
export const TODAY_BACKDROP_MAX_SOURCE_BYTES = 10 * 1024 * 1024
export const TODAY_BACKDROP_MAX_STORED_BYTES = 2 * 1024 * 1024

const SCENE_IDS = new Set(TODAY_BACKDROP_SCENES.map((scene) => scene.id))
const PHOTO_TYPES = new Set(TODAY_BACKDROP_ACCEPT.split(','))

export function normalizeTodayBackdrop(value) {
  if (value?.kind === 'scene' && SCENE_IDS.has(value.scene)) return { kind: 'scene', scene: value.scene }
  if (
    value?.kind === 'photo'
    && typeof value.dataUrl === 'string'
    && value.dataUrl.startsWith('data:image/webp;base64,')
    && value.dataUrl.length <= TODAY_BACKDROP_MAX_STORED_BYTES
  ) {
    return {
      kind: 'photo',
      dataUrl: value.dataUrl,
      name: typeof value.name === 'string' ? value.name.slice(0, 160) : 'Personal photo',
      originalBytes: Number(value.originalBytes) || 0,
      encodedBytes: Number(value.encodedBytes) || 0,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    }
  }
  return { ...DEFAULT_TODAY_BACKDROP }
}

export function loadTodayBackdrop(userId) {
  return normalizeTodayBackdrop(readAccountJson(TODAY_BACKDROP_NAMESPACE, userId, DEFAULT_TODAY_BACKDROP))
}

export function saveTodayBackdrop(userId, value) {
  return writeAccountJson(TODAY_BACKDROP_NAMESPACE, userId, normalizeTodayBackdrop(value))
}

export function validateTodayBackdropFile(file) {
  if (!file || Number(file.size) === 0) return 'Choose a JPEG, PNG, or WebP image that is not empty.'
  if (!PHOTO_TYPES.has(String(file.type || '').toLowerCase())) return 'That file type is not supported. Choose a JPEG, PNG, or WebP image.'
  if (Number(file.size) > TODAY_BACKDROP_MAX_SOURCE_BYTES) return 'That image is larger than 10 MB. Choose a smaller image.'
  return ''
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Body Current could not read the prepared image.'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(blob)
  })
}

function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Body Current could not decode that image. Try a different file.')) }
    image.src = objectUrl
  })
}

async function decodePhoto(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file)
    } catch {
      // Some Safari versions expose createImageBitmap but cannot decode every
      // camera-produced JPEG through it. The Image fallback keeps selection
      // useful while still revoking its temporary object URL.
    }
  }
  return loadImageElement(file)
}

function canvasWebp(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== 'image/webp') {
        reject(new Error('This browser cannot prepare a private WebP backdrop. Try a curated scene instead.'))
        return
      }
      resolve(blob)
    }, 'image/webp', quality)
  })
}

// Every candidate is rendered onto a fresh canvas. That intentionally drops
// EXIF/location metadata and bounds both dimensions and localStorage pressure.
// The last two candidates are recovery paths for unusually detailed photos;
// the prior backdrop is not replaced unless one fully passes the stored-size
// gate and the caller successfully persists it.
const ENCODE_CANDIDATES = [
  { maxDimension: 1600, quality: 0.82 },
  { maxDimension: 1280, quality: 0.74 },
  { maxDimension: 960, quality: 0.68 },
  { maxDimension: 720, quality: 0.62 },
]

export async function prepareTodayBackdropPhoto(file) {
  const validationError = validateTodayBackdropFile(file)
  if (validationError) throw new Error(validationError)

  let decoded
  try {
    decoded = await decodePhoto(file)
    const sourceWidth = Number(decoded.width || decoded.naturalWidth)
    const sourceHeight = Number(decoded.height || decoded.naturalHeight)
    if (!sourceWidth || !sourceHeight) throw new Error('Body Current could not read that image’s dimensions. Try a different file.')

    for (const candidate of ENCODE_CANDIDATES) {
      const scale = Math.min(1, candidate.maxDimension / Math.max(sourceWidth, sourceHeight))
      const width = Math.max(1, Math.round(sourceWidth * scale))
      const height = Math.max(1, Math.round(sourceHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new Error('This browser cannot prepare that image. Try a curated scene instead.')
      context.drawImage(decoded, 0, 0, width, height)
      const blob = await canvasWebp(canvas, candidate.quality)
      const dataUrl = await blobToDataUrl(blob)
      if (dataUrl.startsWith('data:image/webp;base64,') && dataUrl.length <= TODAY_BACKDROP_MAX_STORED_BYTES) {
        return {
          kind: 'photo',
          dataUrl,
          name: String(file.name || 'Personal photo').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'Personal photo',
          originalBytes: Number(file.size) || 0,
          encodedBytes: Number(blob.size) || 0,
          updatedAt: new Date().toISOString(),
        }
      }
    }
  } finally {
    decoded?.close?.()
  }
  throw new Error('That image is still too detailed to store privately on this device. Choose a smaller image or a curated scene.')
}
