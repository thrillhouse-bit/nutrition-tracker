#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, linkSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve, sep } from 'node:path'

// Producers run from the repository root through npm. Keeping this injectable
// through normal module import lets tests replace only the subprocess boundary.
const root = process.cwd()
const artifactDirectory = resolve(root, 'control-tower-shift/artifacts')
const expectedSuites = Object.freeze([
  'test/rpg-account-save-api.test.js',
  'test/rpg-account-save-history.test.js',
  'control-tower-shift/test/rpg-account-save-client.test.js',
  'control-tower-shift/test/rpg-account-save-ui.test.jsx',
  'control-tower-shift/test/rpg-account-gate.test.jsx',
])

const pathHasSymlink = (path) => {
  let current = root
  for (const part of relative(root, path).split(sep)) {
    current = resolve(current, part)
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) return true
  }
  return false
}
export function produceAccountConflictEvidence({
  outputArgument,
  runCommand = spawnSync,
  // Test-only seams deliberately remain module injection, never CLI flags.
  beforeTempCreation,
  beforeFinalPublication,
} = {}) {
  if (typeof outputArgument !== 'string' || !outputArgument) throw new Error('Usage: --output control-tower-shift/artifacts/<proof>.json')
  const outputPath = resolve(root, outputArgument)
  if (!outputPath.startsWith(`${artifactDirectory}/`) || outputArgument.includes('..')) {
    throw new Error('--output must be a non-traversing path under control-tower-shift/artifacts/')
  }
  const assertFreshSafeOutput = () => {
    if (pathHasSymlink(dirname(outputPath)) || pathHasSymlink(outputPath)) {
      throw new Error('--output may not use a symlink path component')
    }
    if (existsSync(outputPath)) throw new Error('--output already exists; choose a fresh path so stale evidence cannot be reused')
  }
  assertFreshSafeOutput()
  mkdirSync(dirname(outputPath), { recursive: true })
  assertFreshSafeOutput()

  const resultDirectory = mkdtempSync(resolve(tmpdir(), 'aegean-account-conflict-vitest-'))
  const resultPath = resolve(resultDirectory, 'result.json')
  const commandArgs = ['vitest', 'run', ...expectedSuites, '--reporter=json', '--outputFile', resultPath]

  try {
  const run = runCommand('npx', commandArgs, { cwd: root, encoding: 'utf8' })
  if (run.error || run.status !== 0) throw new Error(`account-conflict test command failed${run.status == null ? '' : ` (exit ${run.status})`}`)
  let report
  try { report = JSON.parse(readFileSync(resultPath, 'utf8')) } catch { throw new Error('account-conflict test command did not produce valid machine-readable Vitest JSON') }
  const suites = Array.isArray(report.testResults) ? report.testResults : []
  const canonicalPath = (name) => relative(root, resolve(root, String(name || ''))).replaceAll('\\', '/')
  const matchingSuites = expectedSuites.map((expected) => suites.filter((suite) => canonicalPath(suite?.name) === expected))
  const missing = expectedSuites.filter((_, index) => matchingSuites[index].length !== 1)
  const assertions = matchingSuites.flatMap((matches) => matches[0]?.assertionResults || [])
  const passed = assertions.filter((assertion) => assertion?.status === 'passed')
  if (!(report.success === true && suites.length === expectedSuites.length && missing.length === 0
    && matchingSuites.every((matches) => Array.isArray(matches[0]?.assertionResults) && matches[0].assertionResults.length > 0)
    && assertions.length > 0 && passed.length === assertions.length
    && Number.isInteger(report.numTotalTests) && report.numTotalTests === passed.length
    && Number.isInteger(report.numPassedTests) && report.numPassedTests === passed.length
    && report.numFailedTests === 0)) {
    throw new Error(`account-conflict Vitest report is incomplete or failing${missing.length ? `; missing suites: ${missing.join(', ')}` : ''}`)
  }
  const temporaryOutput = `${outputPath}.${process.pid}.${Date.now()}.tmp`
  try {
    beforeTempCreation?.({ outputPath })
    // Recheck immediately before writing below the selected parent. Test-only
    // seam models a symlink swap after the initial preflight.
    assertFreshSafeOutput()
    writeFileSync(temporaryOutput, `${JSON.stringify({
    schemaVersion: 1,
    evidenceType: 'accountSaveConflictMatrix',
    measurements: { passed: true, caseCount: passed.length },
    reproducibility: {
      producer: 'produce-oathbearer-account-conflict-evidence', producerSchemaVersion: 1,
      generatedAt: new Date().toISOString(), suites: expectedSuites,
      scope: 'in-process and API contract coverage; not deployed Postgres or network proof',
      vitest: { totalTests: report.numTotalTests, passedTests: report.numPassedTests, failedTests: report.numFailedTests },
    },
    }, null, 2)}\n`, { flag: 'wx' })
    beforeFinalPublication?.({ outputPath })
    // `linkSync` is no-overwrite allocation; guard its parent immediately
    // beforehand too so it cannot publish through a swapped symlink.
    assertFreshSafeOutput()
    try {
      linkSync(temporaryOutput, outputPath)
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error('--output already exists; another producer won the exclusive allocation')
      throw error
    }
  } finally {
    rmSync(temporaryOutput, { force: true })
  }
  console.log(`Wrote account-conflict evidence (${passed.length} passing cases) to ${outputArgument}`)
  } finally {
    rmSync(resultDirectory, { recursive: true, force: true })
  }
}

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : null
}
const isCli = /(?:^|[/\\])produce-oathbearer-account-conflict-evidence\.mjs$/.test(process.argv[1] || '')
if (isCli) {
  if (process.argv.includes('--test-mode') || process.argv.includes('--test-runner')) {
    throw new Error('--test-mode and --test-runner are test-harness options and are not accepted by the production producer CLI')
  }
  produceAccountConflictEvidence({ outputArgument: valueAfter('--output') })
}
