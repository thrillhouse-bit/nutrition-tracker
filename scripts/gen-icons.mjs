// Generate every shipped raster icon from the approved Body Current master.
// The source stays intact at public/body-current-master.png; this script only
// derives deterministic platform sizes with macOS's built-in `sips`.
//
//   npm run gen:icons
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(__dirname, '..', 'public')

const run = promisify(execFile)
const master = path.join(pub, 'body-current-master.png')
await fs.access(master)
const targets = [
  { name: 'pwa-192.png', size: 192 },
  { name: 'pwa-512.png', size: 512 },
  { name: 'pwa-maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: '../garmin-connectiq/resources/drawables/launcher_icon.png', size: 80 },
]

for (const t of targets) {
  const output = path.resolve(pub, t.name)
  await run('sips', ['-z', String(t.size), String(t.size), master, '--out', output])
  console.log('wrote', t.name)
}
