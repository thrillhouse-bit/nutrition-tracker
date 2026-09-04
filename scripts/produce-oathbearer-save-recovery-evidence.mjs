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
  'control-tower-shift/test/rpg-save-systems-reliability.test.js',
  'control-tower-shift/test/rpg-account-save-client.test.js',
  'control-tower-shift/test/rpg-account-save-ui.test.jsx',
])

const pathHasSymlink = (path) => {
  let current = root
  for (const part of relative(root, path).split(sep)) {
    current = resolve(current, part)
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) return true
  }
  return false
}
export function produceSaveRecoveryEvidence({
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
  // Validate before mkdir: otherwise a nested path below an existing symlink
  // could create directories outside artifacts before being rejected.
  assertFreshSafeOutput()
  mkdirSync(dirname(outputPath), { recursive: true })
  assertFreshSafeOutput()

  const resultDirectory = mkdtempSync(resolve(tmpdir(), 'aegean-save-recovery-vitest-'))
  const resultPath = resolve(resultDirectory, 'result.json')
  const commandArgs = ['vitest', 'run', ...expectedSuites, '--reporter=json', '--outputFile', resultPath]

  try {
  const run = runCommand('npx', commandArgs, { cwd: root, encoding: 'utf8' })
  if (run.error || run.status !== 0) {
    throw new Error(`save-recovery test command failed${run.status == null ? '' : ` (exit ${run.status})`}`)
  }
  let report
  try {
    report = JSON.parse(readFileSync(resultPath, 'utf8'))
  } catch {
    throw new Error('save-recovery test command did not produce valid machine-readable Vitest JSON')
  }
  const suites = Array.isArray(report.testResults) ? report.testResults : []
  const canonicalPath = (name) => relative(root, resolve(root, String(name || ''))).replaceAll('\\', '/')
  const matchingSuites = expectedSuites.map((expected) => suites.filter((suite) => canonicalPath(suite?.name) === expected))
  const missingSuites = expectedSuites.filter((_, index) => matchingSuites[index].length !== 1)
  const suiteAssertions = matchingSuites.flatMap((matches) => matches[0]?.assertionResults || [])
  const assertions = suiteAssertions
  const passedCases = assertions.filter((assertion) => assertion?.status === 'passed')
  const complete = report.success === true
    && suites.length === expectedSuites.length
    && missingSuites.length === 0
    && matchingSuites.every((matches) => Array.isArray(matches[0]?.assertionResults) && matches[0].assertionResults.length > 0)
    && assertions.length > 0
    && passedCases.length === assertions.length
    && Number.isInteger(report.numTotalTests)
    && report.numTotalTests === passedCases.length
    && Number.isInteger(report.numPassedTests)
    && report.numPassedTests === passedCases.length
    && report.numFailedTests === 0
  if (!complete) {
    throw new Error(`save-recovery Vitest report is incomplete or failing${missingSuites.length ? `; missing suites: ${missingSuites.join(', ')}` : ''}`)
  }
  const temporaryOutput = `${outputPath}.${process.pid}.${Date.now()}.tmp`
  try {
    beforeTempCreation?.({ outputPath })
    // Recheck after all expensive work and immediately before creating a file
    // beneath the chosen directory: an attacker must not swap a parent for a
    // symlink between initial validation and publication.
    assertFreshSafeOutput()
    writeFileSync(temporaryOutput, `${JSON.stringify({
    schemaVersion: 1,
    evidenceType: 'saveRecoveryMatrix',
    measurements: { passed: true, caseCount: passedCases.length },
    reproducibility: {
      producer: 'produce-oathbearer-save-recovery-evidence',
      producerSchemaVersion: 1,
      generatedAt: new Date().toISOString(),
      suites: expectedSuites,
      scope: 'deterministic in-process save and account recovery test coverage; not deployed network or persistence proof',
      vitest: {
        totalTests: report.numTotalTests,
        passedTests: report.numPassedTests,
        failedTests: report.numFailedTests,
      },
    },
    }, null, 2)}\n`, { flag: 'wx' })
    // link(2) creates the final name only when it does not already exist. In
    // contrast with rename(2), it cannot overwrite a concurrent/stale proof.
    // The temp file is in the same directory, so POSIX local/CI filesystems
    // support this atomic allocation without a cross-device move.
    beforeFinalPublication?.({ outputPath })
    // The link allocation is exclusive, but still verify its parent directly
    // before it so a path swap cannot publish outside artifacts.
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
  console.log(`Wrote save-recovery evidence (${passedCases.length} passing cases) to ${outputArgument}`)
  } finally {
    rmSync(resultDirectory, { recursive: true, force: true })
  }
}

const valueAfter = (flag) => {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : null
}
const isCli = /(?:^|[/\\])produce-oathbearer-save-recovery-evidence\.mjs$/.test(process.argv[1] || '')
if (isCli) {
  if (process.argv.includes('--test-mode') || process.argv.includes('--test-runner')) {
    throw new Error('--test-mode and --test-runner are test-harness options and are not accepted by the production producer CLI')
  }
  produceSaveRecoveryEvidence({ outputArgument: valueAfter('--output') })
}
