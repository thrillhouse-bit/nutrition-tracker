import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

describe('Oathbearer complete-game release gate', () => {
  it('reports the live content graph and cannot silently pass an incomplete build', () => {
    const output = execFileSync(process.execPath, [
      'scripts/verify-oathbearer-complete-game.mjs',
      '--report',
      '--json',
    ], { encoding: 'utf8' })
    const report = JSON.parse(output)

    expect(report.product).toBe('Oathbearer')
    expect(report.ready).toBe(false)
    expect(report.actual.maps).toBeGreaterThan(0)
    expect(report.actual.skills).toBe(22)
    expect(report.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MINIMUM_NOT_MET' }),
      expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'blindPlaytestCount' }),
      expect.objectContaining({ code: 'RELEASE_STATUS_BLOCKED' }),
    ]))
  })
})
