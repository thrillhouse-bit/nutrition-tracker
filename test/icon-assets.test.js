import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

function pngSize(file) {
  const bytes = fs.readFileSync(file)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('Body Current icon assets', () => {
  it('uses the approved raster master for browser, PWA, iOS, and Connect IQ icons', () => {
    const expected = {
      'public/pwa-192.png': 192,
      'public/pwa-512.png': 512,
      'public/pwa-maskable-512.png': 512,
      'public/apple-touch-icon.png': 180,
      'garmin-connectiq/resources/drawables/launcher_icon.png': 80,
    }
    expect(fs.existsSync(path.join(root, 'public/body-current-master.png'))).toBe(true)
    for (const [asset, size] of Object.entries(expected)) {
      expect(pngSize(path.join(root, asset))).toEqual({ width: size, height: size })
    }
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
    const config = fs.readFileSync(path.join(root, 'vite.config.js'), 'utf8')
    expect(html).toContain('href="/pwa-192.png"')
    expect(config).toContain("name: 'Body Current'")
    expect(config).toContain("src: 'pwa-maskable-512.png'")
    expect(config).not.toContain("src: 'icon.svg'")
  })
})
