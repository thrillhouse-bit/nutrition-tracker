// OPTIONAL: rasterize public/icon.svg into PNG app icons (for app stores and
// older iOS, which don't take SVG home-screen icons). Not part of the build.
//
//   npm i -D sharp
//   npm run gen:icons
//
// Then add the generated files to the manifest `icons` array in vite.config.js.
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '..', 'public')

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('sharp is not installed. Run:  npm i -D sharp')
  process.exit(1)
}

const svg = await fs.readFile(path.join(pub, 'icon.svg'))
const targets = [
  { name: 'pwa-192.png', size: 192 },
  { name: 'pwa-512.png', size: 512 },
  { name: 'pwa-maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const t of targets) {
  await sharp(svg).resize(t.size, t.size).png().toFile(path.join(pub, t.name))
  console.log('wrote', t.name)
}
