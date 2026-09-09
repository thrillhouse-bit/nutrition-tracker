import { readAccountJson, writeAccountJson } from './privateStorage.js'

export const TODAY_BACKDROP_NAMESPACE = 'today-backdrop'
export const DEFAULT_TODAY_BACKDROP = Object.freeze({ kind: 'scene', scene: 'tide' })
export const TODAY_BACKDROP_SCENES = Object.freeze([
  { id: 'tide', label: 'Alpine', description: 'An original high-alpine current at first light' },
  {
    id: 'laguna',
    label: 'Laguna',
    description: 'A palm-lined Laguna Beach shoreline at golden hour',
    credit: 'Dan Begel',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/palm-trees-overlook-a-serene-beach-and-ocean-at-sunset-3WWZItF7GBU?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  {
    id: 'manhattan',
    label: 'Central Park South',
    description: 'A hazy, bird’s-eye view across Midtown toward Central Park South',
    credit: 'Freddie Marriage',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/aerial-photo-of-central-park-new-york-utwYoEu9SU8?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  {
    id: 'big-sur',
    label: 'Big Sur',
    description: 'The misty Big Sur coastline above the Pacific',
    credit: 'Matthew Mentley',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/a-scenic-view-of-the-ocean-and-cliffs-LTbr4muSCRU?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  {
    id: 'joshua-tree',
    label: 'Joshua Tree',
    description: 'A warm desert horizon in Joshua Tree',
    credit: 'Kevin Schmid',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/joshua-tree-in-a-desert-landscape-at-sunset-y982inoyNyY?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  {
    id: 'lake-tahoe',
    label: 'Lake Tahoe',
    description: 'Pastel evening light over Lake Tahoe and the Sierra Nevada',
    credit: 'Robert Ritchie',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/a-view-of-a-mountain-range-from-a-body-of-water-O1STETnsdBc?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  {
    id: 'webb-deep-field',
    label: 'Webb · Deep Field',
    description: 'Thousands of distant galaxies in the SMACS 0723 deep field',
    credit: 'NASA · ESA · CSA · STScI',
    sourceName: 'NASA Webb',
    sourceUrl: 'https://science.nasa.gov/mission/webb/webbs-first-images/',
    licenseUrl: 'https://science.nasa.gov/mission/webb/multimedia/images/',
  },
  {
    id: 'webb-southern-ring',
    label: 'Webb · Southern Ring',
    description: 'A planetary nebula revealed in infrared light',
    credit: 'NASA · ESA · CSA · STScI',
    sourceName: 'NASA Webb',
    sourceUrl: 'https://science.nasa.gov/mission/webb/webbs-first-images/',
    licenseUrl: 'https://science.nasa.gov/mission/webb/multimedia/images/',
  },
  {
    id: 'webb-cosmic-cliffs',
    label: 'Webb · Cosmic Cliffs',
    description: 'The Carina Nebula’s sculpted edge of star birth',
    credit: 'NASA · ESA · CSA · STScI',
    sourceName: 'NASA Webb',
    sourceUrl: 'https://science.nasa.gov/mission/webb/webbs-first-images/',
    licenseUrl: 'https://science.nasa.gov/mission/webb/multimedia/images/',
  },
  {
    id: 'webb-stephans-quintet',
    label: 'Webb · Stephan’s Quintet',
    description: 'Interacting galaxies in a deep-field cosmic dance',
    credit: 'NASA · ESA · CSA · STScI',
    sourceName: 'NASA Webb',
    sourceUrl: 'https://science.nasa.gov/mission/webb/webbs-first-images/',
    licenseUrl: 'https://science.nasa.gov/mission/webb/multimedia/images/',
  },
  {
    id: 'washington-lincoln',
    label: 'Washington · Lincoln',
    description: 'The Lincoln Memorial, quiet and architectural',
    credit: 'Fan Yang',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/lincoln-memorial-washington-dc-n-U6Ze7QKzs?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  {
    id: 'washington-capitol',
    label: 'Washington · Capitol',
    description: 'The Capitol dome under a restrained, dramatic sky',
    credit: 'Sebastian Schuster',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/united-states-capitol-building-under-dramatic-sky-HckWxkLYcAQ?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  {
    id: 'washington-monument-bw',
    label: 'Washington · Monument (B&W)',
    description: 'The Washington Monument in winter fog, rendered in grayscale',
    credit: 'Laura Zanotti',
    sourceName: 'Unsplash',
    sourceUrl: 'https://unsplash.com/photos/a-black-and-white-photo-of-a-tall-building-JcVC7ANulx0?utm_source=body_current&utm_medium=referral',
    licenseUrl: 'https://unsplash.com/license',
  },
  { id: 'ridge', label: 'Ridge', description: 'Layered contours with a quieter horizon' },
  { id: 'dawn', label: 'Dawn', description: 'A warmer field for the start of the day' },
])
export const TODAY_BACKDROP_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'
export const TODAY_BACKDROP_MAX_SOURCE_BYTES = 10 * 1024 * 1024
export const TODAY_BACKDROP_MAX_STORED_BYTES = 2 * 1024 * 1024

const SCENE_IDS = new Set(TODAY_BACKDROP_SCENES.map((scene) => scene.id))
const PHOTO_TYPES = new Set(TODAY_BACKDROP_ACCEPT.split(','))

export function normalizeTodayBackdrop(value) {
  if (value?.kind === 'scene' && SCENE_IDS.has(value.scene)) return { kind: 'scene', scene: value.scene }
  if (
    value?.kind === 'photo'
    && typeof value.dataUrl === 'string'
    && /^data:image\/(?:webp|jpeg);base64,/.test(value.dataUrl)
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
  if (!file || Number(file.size) === 0) return 'Choose a JPEG, PNG, WebP, HEIC, or HEIF image that is not empty.'
  const type = String(file.type || '').toLowerCase()
  const extension = String(file.name || '').toLowerCase().match(/\.(?:jpe?g|png|webp|heic|heif)$/)?.[0] || ''
  // iOS can omit MIME metadata when a photo comes from the library,
  // especially for HEIC/HEIF. Let a recognized extension reach the decoder;
  // decoding below remains the final authority for the actual file contents.
  if (!PHOTO_TYPES.has(type) && !PHOTO_TYPES.has(extension) && !['.jpg', '.jpeg', '.png', '.webp'].includes(extension)) {
    return 'That file type is not supported. Choose a JPEG, PNG, WebP, HEIC, or HEIF image.'
  }
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

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.type !== type) {
        reject(new Error(`This browser could not encode ${type === 'image/webp' ? 'WebP' : 'JPEG'}.`))
        return
      }
      resolve(blob)
    }, type, quality)
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
      // WebP is preferred for storage efficiency, but Safari/WebKit support
      // has varied across devices and embedded browser versions. JPEG is the
      // truthful recovery path; the chosen image remains local either way.
      for (const type of ['image/webp', 'image/jpeg']) {
        try {
          const blob = await canvasBlob(canvas, type, type === 'image/webp' ? candidate.quality : Math.max(0.58, candidate.quality - 0.08))
          const dataUrl = await blobToDataUrl(blob)
          if (dataUrl.startsWith(`data:${type};base64,`) && dataUrl.length <= TODAY_BACKDROP_MAX_STORED_BYTES) {
            return {
              kind: 'photo',
              dataUrl,
              format: type,
              name: String(file.name || 'Personal photo').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 160) || 'Personal photo',
              originalBytes: Number(file.size) || 0,
              encodedBytes: Number(blob.size) || 0,
              updatedAt: new Date().toISOString(),
            }
          }
        } catch {
          // Try the next encoding, then the next smaller candidate.
        }
      }
    }
  } finally {
    decoded?.close?.()
  }
  throw new Error('That image is still too detailed to store privately on this device. Choose a smaller image or a curated scene.')
}
