import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { produceSaveRecoveryEvidence } from '../scripts/produce-oathbearer-save-recovery-evidence.mjs'

const outputPath = 'control-tower-shift/artifacts/save-recovery-producer-test.json'
const expectedSuites = [
  'control-tower-shift/test/rpg-save-systems-reliability.test.js',
  'control-tower-shift/test/rpg-account-save-client.test.js',
  'control-tower-shift/test/rpg-account-save-ui.test.jsx',
]

const runner = (mode) => {
  const directory = mkdtempSync(join(tmpdir(), 'aegean-save-proof-runner-'))
  const path = join(directory, 'runner')
  const results = expectedSuites.map((name) => ({ name, assertionResults: [{ status: 'passed' }, { status: 'passed' }] }))
  if (mode === 'duplicate') results[results.length - 1] = { ...results[0] }
  if (mode === 'empty') results[0] = { ...results[0], assertionResults: [] }
  if (mode === 'misnamed') results[0] = { ...results[0], name: `not-the-allowlist/${results[0].name}` }
  const report = mode === 'success' || ['duplicate', 'empty', 'misnamed', 'passed-mismatch'].includes(mode)
    ? JSON.stringify({ success: true, numTotalTests: 6, numPassedTests: mode === 'passed-mismatch' ? 5 : 6, numFailedTests: 0, testResults: results })
    : mode === 'malformed' ? '{not-json' : mode === 'partial' ? JSON.stringify({ success: true }) : JSON.stringify({ success: false, numTotalTests: 1, numPassedTests: 0, numFailedTests: 1, testResults: [] })
  const exit = mode === 'failed' ? 1 : 0
  writeFileSync(path, `#!/usr/bin/env bash\nset -eu\nout=\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "--outputFile" ]; then out="$2"; shift 2; continue; fi\n  shift\ndone\nprintf '%s' '${report.replaceAll("'", "'\\''")}' > "$out"\nexit ${exit}\n`)
  chmodSync(path, 0o755)
  return { directory, path }
}

const produce = (runnerPath, output = outputPath, seams = {}) => {
  try {
    produceSaveRecoveryEvidence({ outputArgument: output, runCommand: (_command, args, options) => spawnSync(runnerPath, args, options), ...seams })
    return { status: 0, stderr: '' }
  } catch (error) {
    return { status: 1, stderr: String(error?.message || error) }
  }
}

describe('save-recovery evidence producer', () => {
  it('derives a proof case count from allowlisted passing Vitest assertions', () => {
    const fixture = runner('success')
    try {
      const result = produce(fixture.path)
      expect(result.status).toBe(0)
      const proof = JSON.parse(readFileSync(outputPath, 'utf8'))
      expect(proof).toMatchObject({
        schemaVersion: 1,
        evidenceType: 'saveRecoveryMatrix',
        measurements: { passed: true, caseCount: 6 },
        reproducibility: { suites: expectedSuites, vitest: { totalTests: 6, passedTests: 6, failedTests: 0 } },
      })
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
      rmSync(outputPath, { force: true })
    }
  })

  it.each(['failed', 'malformed'])('does not emit a proof from %s subprocess data', (mode) => {
    const fixture = runner(mode)
    try {
      const result = produce(fixture.path)
      expect(result.status).not.toBe(0)
      expect(existsSync(outputPath)).toBe(false)
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
      rmSync(outputPath, { force: true })
    }
  })

  it.each(['duplicate', 'empty', 'misnamed', 'passed-mismatch', 'partial'])('does not emit a proof from %s suite data', (mode) => {
    const fixture = runner(mode)
    try {
      expect(produce(fixture.path).status).not.toBe(0)
      expect(existsSync(outputPath)).toBe(false)
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
      rmSync(outputPath, { force: true })
    }
  })

  it('refuses a stale existing target and symlinked target directory', () => {
    const fixture = runner('success')
    const link = 'control-tower-shift/artifacts/save-recovery-producer-link'
    const external = mkdtempSync(join(tmpdir(), 'aegean-save-proof-external-'))
    try {
      writeFileSync(outputPath, 'stale')
      const stale = produce(fixture.path)
      expect(stale.status).not.toBe(0)
      expect(stale.stderr).toContain('--output already exists')
      expect(readFileSync(outputPath, 'utf8')).toBe('stale')
      rmSync(outputPath, { force: true })
      symlinkSync(external, link)
      const linked = produce(fixture.path, `${link}/nested/proof.json`)
      expect(linked.status).not.toBe(0)
      expect(linked.stderr).toContain('symlink')
      expect(existsSync(join(external, 'proof.json'))).toBe(false)
      expect(existsSync(join(external, 'nested'))).toBe(false)
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
      rmSync(outputPath, { force: true })
      rmSync(link, { force: true })
      rmSync(external, { recursive: true, force: true })
    }
  })

  it('allocates exactly one fresh final proof', () => {
    const fixture = runner('success')
    try {
      const results = [produce(fixture.path), produce(fixture.path)]
      expect(results.filter(({ status }) => status === 0)).toHaveLength(1)
      expect(results.filter(({ status }) => status !== 0)).toHaveLength(1)
      expect(JSON.parse(readFileSync(outputPath, 'utf8')).measurements).toMatchObject({ passed: true, caseCount: 6 })
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
      rmSync(outputPath, { force: true })
    }
  })

  it.each(['beforeTempCreation', 'beforeFinalPublication'])('rejects a parent symlink swap at %s', (seam) => {
    const fixture = runner('success')
    const parent = `control-tower-shift/artifacts/save-recovery-toctou-${seam}`
    const target = `${parent}/proof.json`
    const external = mkdtempSync(join(tmpdir(), 'aegean-save-proof-toctou-'))
    try {
      const result = produce(fixture.path, target, {
        [seam]: () => {
          rmSync(parent, { recursive: true, force: true })
          symlinkSync(external, parent)
        },
      })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('symlink')
      expect(existsSync(join(external, 'proof.json'))).toBe(false)
    } finally {
      rmSync(fixture.directory, { recursive: true, force: true })
      rmSync(parent, { recursive: true, force: true })
      rmSync(external, { recursive: true, force: true })
    }
  })

  it('rejects test-harness runner flags from the production CLI', () => {
    for (const flag of ['--test-mode', '--test-runner']) {
      const args = ['scripts/produce-oathbearer-save-recovery-evidence.mjs', '--output', outputPath, flag]
      if (flag === '--test-runner') args.push('/tmp/not-a-runner')
      const result = spawnSync(process.execPath, args, { encoding: 'utf8' })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('not accepted by the production producer CLI')
      expect(existsSync(outputPath)).toBe(false)
    }
  })
})
