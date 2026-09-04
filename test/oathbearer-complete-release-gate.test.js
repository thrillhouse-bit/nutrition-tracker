import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evidenceArtifactFromGit, releaseEvidenceAttestationFromGit, releaseWorkingTreeFromGit } from '../scripts/oathbearer-release-evidence.mjs'
import {
  hasNoDuplicateSkillEvidenceRecords,
  validateCompleteSkillLoopCapability,
  validateCompleteSkillLoopCapabilityShape,
} from '../control-tower-shift/src/rpg/skillLoopCapabilities.js'

const runGate = (contractPath) => JSON.parse(execFileSync(process.execPath, [
  'scripts/verify-oathbearer-complete-game.mjs',
  '--report',
  '--json',
  ...(contractPath ? ['--test-contract', '--contract', contractPath] : []),
], { encoding: 'utf8' }))
const currentCommit = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const trackedArtifact = 'control-tower-shift/artifacts/premium-audit.json'
const playthroughProof = (artifactPath, bytes, overrides = {}) => ({
  id: 'playthrough-proof', artifactPath, artifactCommit: currentCommit(),
  createdAt: '2026-09-01T00:00:00.000Z', sha256: digest(bytes),
  measurements: { completed: true, completedActs: 5 }, ...overrides,
})

const withMutatedContract = (mutate, assertion) => {
  const directory = mkdtempSync(join(tmpdir(), 'aegean-release-gate-'))
  const path = join(directory, 'full-game-release.json')
  try {
    const contract = JSON.parse(readFileSync('control-tower-shift/full-game-release.json', 'utf8'))
    mutate(contract)
    writeFileSync(path, JSON.stringify(contract))
    assertion(runGate(path))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('Oathbearer complete-game release gate', () => {
  it('requires distinct production-derived skill-loop steps, bands, and mastery reward', () => {
    const survey = (entityId, surveyContractId, level) => ({
      action: 'SURVEY_WAYFINDING', mapId: entityId.includes('pelagos') || entityId.includes('breakwater') ? 'chartwright-hall' : 'submerged-signal-shoal',
      entityId, surveyContractId, level,
    })
    const capability = {
      learn: survey('survey-pelagos-harbor-soundings', 'pelagos-harbor-soundings', 1),
      practice: survey('survey-breakwater-tide-bearing', 'breakwater-tide-bearing', 10),
      mastery: survey('survey-archive-return-bearing', 'archive-return-bearing', 70),
      durableRewardId: 'covenant-return-chart',
      bands: [
        survey('survey-pelagos-harbor-soundings', 'pelagos-harbor-soundings', 1),
        survey('survey-breakwater-tide-bearing', 'breakwater-tide-bearing', 10),
        survey('survey-nereid-boundary-soundings', 'nereid-boundary-soundings', 25),
        survey('survey-anchorage-storm-line', 'anchorage-storm-line', 45),
        survey('survey-archive-return-bearing', 'archive-return-bearing', 70),
      ],
      tests: ['control-tower-shift/test/rpg-act2-ianthe-conversation.test.js'],
    }
    const artifact = {
      schemaVersion: 1, evidenceType: 'completeSkillLoop', skillId: 'wayfinding',
      measurements: { learn: true, practice: true, mastery: true }, capability,
    }

    expect(validateCompleteSkillLoopCapabilityShape(artifact, { testPaths: capability.tests })).toBe(true)
    expect(validateCompleteSkillLoopCapability(artifact, { testPaths: capability.tests })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: { ...capability, practice: capability.learn } }, { testPaths: capability.tests })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: { ...capability, bands: capability.bands.map((band, index) => index === 2 ? { ...band, level: 24 } : band) } }, { testPaths: capability.tests })).toBe(false)
    expect(validateCompleteSkillLoopCapabilityShape({ ...artifact, capability: { ...capability, durableRewardId: 'barley-flatbread' } }, { testPaths: capability.tests })).toBe(false)
  })

  it('identifies duplicate skill records for verifier-level rejection', () => {
    expect(hasNoDuplicateSkillEvidenceRecords([{ skillId: 'wayfinding' }, { skillId: 'wayfinding' }])).toBe(false)
    expect(hasNoDuplicateSkillEvidenceRecords([{ skillId: 'wayfinding' }, { skillId: 'devotion' }])).toBe(true)
  })

  it('blocks duplicate skill-loop records rather than collapsing them into one count', () => {
    withMutatedContract((contract) => {
      contract.evidence.technical.completeSkillLoops = [{ skillId: 'wayfinding' }, { skillId: 'wayfinding' }]
    }, (report) => {
      expect(report.actual.completeSkillLoops).toBe(0)
      expect(report.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'DUPLICATE_SKILL_LOOP_EVIDENCE',
          metric: 'completeSkillLoops',
          actual: ['wayfinding'],
        }),
      ]))
    })
  })

  it('fails closed when skill-loop evidence lacks real targets, rewards, or tests', () => {
    const base = {
      schemaVersion: 1, evidenceType: 'completeSkillLoop', skillId: 'stewardship',
      measurements: { learn: true, practice: true, mastery: true },
      capability: {
        learn: { action: 'GATHER', mapId: 'beacon-overlook', entityId: 'fallow-field' },
        practice: { action: 'GATHER', mapId: 'beacon-overlook', entityId: 'fallow-field' },
        mastery: { action: 'GAIN_XP', mapId: 'beacon-overlook', entityId: 'fallow-field' },
        durableRewardId: 'barley-flatbread',
        bands: Array.from({ length: 5 }, (_, index) => ({ action: 'GATHER', mapId: 'beacon-overlook', entityId: 'fallow-field', level: index + 1 })),
        tests: ['control-tower-shift/test/rpg-stewardship-fallow-field.test.js'],
      },
    }
    expect(validateCompleteSkillLoopCapability(base, { testPaths: base.capability.tests })).toBe(false)
    expect(validateCompleteSkillLoopCapability({ ...base, capability: { ...base.capability, mastery: { action: 'GATHER', mapId: 'missing', entityId: 'fallow-field' } } }, { testPaths: base.capability.tests })).toBe(false)
    expect(validateCompleteSkillLoopCapability({ ...base, capability: { ...base.capability, mastery: { action: 'GATHER', mapId: 'beacon-overlook', entityId: 'fallow-field' }, durableRewardId: 'missing', tests: ['missing.test.js'] } }, { testPaths: base.capability.tests })).toBe(false)
  })

  it('keeps live skill-loop counting fail-closed until production declares a complete capability', () => {
    const report = runGate()
    expect(report.actual.completeSkillLoops).toBe(0)
  })
  it('accepts an immutable artifact committed before its later manifest registration', () => {
    const root = mkdtempSync(join(tmpdir(), 'aegean-evidence-history-'))
    const artifactPath = 'control-tower-shift/artifacts/full-ui-proof.json'
    const artifact = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      evidenceType: 'fullNormalUiPlaythrough',
      measurements: { completed: true, completedActs: 5 },
    }))
    try {
      mkdirSync(join(root, 'control-tower-shift/artifacts'), { recursive: true })
      writeFileSync(join(root, artifactPath), artifact)
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify({
        schemaVersion: 2,
        product: 'Aegean Frontier: The Unwritten Age',
        releaseStatus: 'blocked',
        minimums: { maps: 60 },
        evidence: { schemaVersion: 2, technical: { completeSkillLoops: [] }, release: { fullNormalUiPlaythrough: [] } },
      }))
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
      execFileSync('git', ['config', 'user.email', 'evidence-test@example.invalid'], { cwd: root })
      execFileSync('git', ['config', 'user.name', 'Evidence Test'], { cwd: root })
      execFileSync('git', ['add', artifactPath, 'control-tower-shift/full-game-release.json'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'produce evidence artifact'], { cwd: root, stdio: 'ignore' })
      const artifactCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify({
        schemaVersion: 2,
        product: 'Aegean Frontier: The Unwritten Age',
        releaseStatus: 'ready',
        minimums: { maps: 60 },
        evidence: { schemaVersion: 2, technical: { completeSkillLoops: [] }, release: { fullNormalUiPlaythrough: [{ artifactCommit }] } },
      }))
      execFileSync('git', ['add', 'control-tower-shift/full-game-release.json'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'register evidence manifest'], { cwd: root, stdio: 'ignore' })

      const record = {
        id: 'full-ui-proof', artifactPath, artifactCommit,
        createdAt: '2026-09-01T00:00:00.000Z', sha256: digest(artifact),
      }
      const attestation = releaseEvidenceAttestationFromGit({ root, records: [record] })
      expect(attestation).toEqual({ valid: true, snapshotCommit: artifactCommit })
      expect(evidenceArtifactFromGit({
        root,
        evidenceType: 'fullNormalUiPlaythrough',
        record,
        expectedArtifactCommit: attestation.snapshotCommit,
      })).toMatchObject({ measurements: { completed: true, completedActs: 5 } })
      for (const createdAt of [
        '2026-09-01T00:00:00Z',
        '2026-09-01T00:00:00.000+00:00',
        '2026-09-01 00:00:00.000Z',
        '2026-02-30T00:00:00.000Z',
      ]) {
        expect(evidenceArtifactFromGit({
          root,
          evidenceType: 'fullNormalUiPlaythrough',
          record: { ...record, createdAt },
          expectedArtifactCommit: attestation.snapshotCommit,
        })).toBeNull()
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects product or release-floor mutation in the final manifest attestation', () => {
    const root = mkdtempSync(join(tmpdir(), 'aegean-attestation-contract-freeze-'))
    const artifactPath = 'control-tower-shift/artifacts/proof.json'
    const artifact = Buffer.from(JSON.stringify({ schemaVersion: 1, evidenceType: 'fullNormalUiPlaythrough', measurements: { completed: true, completedActs: 5 } }))
    const manifest = ({ product = 'Aegean Frontier: The Unwritten Age', minimums = { maps: 60 } } = {}) => ({
      schemaVersion: 2, product, releaseStatus: 'blocked', minimums,
      evidence: { schemaVersion: 2, technical: { completeSkillLoops: [] }, release: { fullNormalUiPlaythrough: [] } },
    })
    try {
      mkdirSync(join(root, 'control-tower-shift/artifacts'), { recursive: true })
      writeFileSync(join(root, artifactPath), artifact)
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify(manifest()))
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
      execFileSync('git', ['config', 'user.email', 'evidence-test@example.invalid'], { cwd: root })
      execFileSync('git', ['config', 'user.name', 'Evidence Test'], { cwd: root })
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'produce artifact and contract'], { cwd: root, stdio: 'ignore' })
      const artifactCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
      const record = { id: 'proof', artifactPath, artifactCommit, createdAt: '2026-09-01T00:00:00.000Z', sha256: digest(artifact) }

      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify(manifest({ product: 'Forged Frontier' })))
      execFileSync('git', ['add', 'control-tower-shift/full-game-release.json'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'forge product'], { cwd: root, stdio: 'ignore' })
      expect(releaseEvidenceAttestationFromGit({ root, records: [record] }).valid).toBe(false)

      execFileSync('git', ['reset', '--hard', 'HEAD^'], { cwd: root, stdio: 'ignore' })
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify(manifest({ minimums: { maps: 1 } })))
      execFileSync('git', ['add', 'control-tower-shift/full-game-release.json'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'lower floor'], { cwd: root, stdio: 'ignore' })
      expect(releaseEvidenceAttestationFromGit({ root, records: [record] }).valid).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('blocks a valid two-commit attestation when working manifest or source bytes diverge from HEAD', () => {
    const root = mkdtempSync(join(tmpdir(), 'aegean-working-tree-truth-'))
    const artifactPath = 'control-tower-shift/artifacts/proof.json'
    const artifact = Buffer.from(JSON.stringify({
      schemaVersion: 1, evidenceType: 'fullNormalUiPlaythrough', measurements: { completed: true, completedActs: 5 },
    }))
    const manifest = (releaseStatus, records) => ({
      schemaVersion: 2,
      product: 'Aegean Frontier: The Unwritten Age',
      releaseStatus,
      minimums: { maps: 60 },
      evidence: { schemaVersion: 2, technical: { completeSkillLoops: [] }, release: { fullNormalUiPlaythrough: records } },
    })
    try {
      mkdirSync(join(root, 'control-tower-shift/artifacts'), { recursive: true })
      mkdirSync(join(root, 'control-tower-shift/src'), { recursive: true })
      writeFileSync(join(root, artifactPath), artifact)
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify(manifest('blocked', [])))
      writeFileSync(join(root, 'control-tower-shift/src/game.js'), 'export const ready = false\n')
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
      execFileSync('git', ['config', 'user.email', 'evidence-test@example.invalid'], { cwd: root })
      execFileSync('git', ['config', 'user.name', 'Evidence Test'], { cwd: root })
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'tested snapshot'], { cwd: root, stdio: 'ignore' })
      const artifactCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
      const record = { id: 'proof', artifactPath, artifactCommit, createdAt: '2026-09-01T00:00:00.000Z', sha256: digest(artifact) }
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify(manifest('ready', [record])))
      execFileSync('git', ['add', 'control-tower-shift/full-game-release.json'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'register evidence'], { cwd: root, stdio: 'ignore' })

      expect(releaseEvidenceAttestationFromGit({ root, records: [record] }).valid).toBe(true)
      expect(releaseWorkingTreeFromGit({ root })).toEqual({ clean: true, dirtyPaths: [] })

      mkdirSync(join(root, 'control-tower-shift/artifacts/hermes-dialogue'), { recursive: true })
      writeFileSync(join(root, 'CLAUDE-CONTINUOUS-CONTENT-EXECUTION.md'), 'governed quarantine\n')
      writeFileSync(join(root, 'control-tower-shift/artifacts/hermes-dialogue/session.json'), '{}\n')
      expect(releaseWorkingTreeFromGit({ root })).toEqual({ clean: true, dirtyPaths: [] })

      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), JSON.stringify(manifest('ready', [])))
      expect(releaseEvidenceAttestationFromGit({ root, records: [record] }).valid).toBe(true)
      expect(releaseWorkingTreeFromGit({ root })).toMatchObject({ clean: false, dirtyPaths: ['control-tower-shift/full-game-release.json'] })

      execFileSync('git', ['checkout', '--', 'control-tower-shift/full-game-release.json'], { cwd: root })
      writeFileSync(join(root, 'control-tower-shift/src/game.js'), 'export const ready = true\n')
      expect(releaseWorkingTreeFromGit({ root })).toMatchObject({ clean: false, dirtyPaths: ['control-tower-shift/src/game.js'] })

      execFileSync('git', ['checkout', '--', 'control-tower-shift/src/game.js'], { cwd: root })
      writeFileSync(join(root, 'untracked-release-input.txt'), 'must block\n')
      expect(releaseWorkingTreeFromGit({ root })).toMatchObject({ clean: false, dirtyPaths: ['untracked-release-input.txt'] })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects older, mixed, source-changing, and history-truncated attestations', () => {
    const root = mkdtempSync(join(tmpdir(), 'aegean-attestation-negative-'))
    const artifactPath = 'control-tower-shift/artifacts/proof.json'
    const record = (artifactCommit) => ({ id: 'proof', artifactPath, artifactCommit, createdAt: '2026-09-01T00:00:00.000Z', sha256: '0'.repeat(64) })
    try {
      mkdirSync(join(root, 'control-tower-shift/artifacts'), { recursive: true })
      writeFileSync(join(root, artifactPath), '{"schemaVersion":1,"evidenceType":"fullNormalUiPlaythrough","measurements":{}}')
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' })
      execFileSync('git', ['config', 'user.email', 'evidence-test@example.invalid'], { cwd: root })
      execFileSync('git', ['config', 'user.name', 'Evidence Test'], { cwd: root })
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'produce artifact'], { cwd: root, stdio: 'ignore' })
      const olderArtifactCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
      writeFileSync(join(root, 'snapshot-note'), 'tested snapshot\n')
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'tested snapshot'], { cwd: root, stdio: 'ignore' })
      const snapshotCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), '{}')
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'register manifest'], { cwd: root, stdio: 'ignore' })
      expect(releaseEvidenceAttestationFromGit({ root, records: [record(olderArtifactCommit)] }).valid).toBe(false)
      expect(releaseEvidenceAttestationFromGit({ root, records: [record(snapshotCommit), record(olderArtifactCommit)] }).valid).toBe(false)

      writeFileSync(join(root, 'source-change.js'), 'changed with manifest\n')
      writeFileSync(join(root, 'control-tower-shift/full-game-release.json'), '{"changed":true}')
      execFileSync('git', ['add', '.'], { cwd: root })
      execFileSync('git', ['commit', '-m', 'bad source change'], { cwd: root, stdio: 'ignore' })
      expect(releaseEvidenceAttestationFromGit({ root, records: [record(execFileSync('git', ['rev-parse', 'HEAD^'], { cwd: root, encoding: 'utf8' }).trim())] }).valid).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }

    const oneCommitRoot = mkdtempSync(join(tmpdir(), 'aegean-attestation-shallow-'))
    try {
      writeFileSync(join(oneCommitRoot, 'manifest'), '{}')
      execFileSync('git', ['init'], { cwd: oneCommitRoot, stdio: 'ignore' })
      execFileSync('git', ['config', 'user.email', 'evidence-test@example.invalid'], { cwd: oneCommitRoot })
      execFileSync('git', ['config', 'user.name', 'Evidence Test'], { cwd: oneCommitRoot })
      execFileSync('git', ['add', '.'], { cwd: oneCommitRoot })
      execFileSync('git', ['commit', '-m', 'shallow head'], { cwd: oneCommitRoot, stdio: 'ignore' })
      expect(releaseEvidenceAttestationFromGit({ root: oneCommitRoot, records: [record('0'.repeat(40))] }).valid).toBe(false)
    } finally {
      rmSync(oneCommitRoot, { recursive: true, force: true })
    }
  })

  it('reports the live content graph without pinning a future complete build as blocked', () => {
    const report = runGate()

    expect(report.product).toBe('Aegean Frontier: The Unwritten Age')
    expect(typeof report.ready).toBe('boolean')
    expect(report.actual.maps).toBeGreaterThan(0)
    expect(Number.isInteger(report.actual.completeSkillLoops)).toBe(true)
    expect(Number.isInteger(report.actual.usefulEquipmentSlots)).toBe(true)
  })

  it('blocks an intentionally incomplete release fixture without relying on live deficits', () => {
    withMutatedContract((contract) => {
      contract.releaseStatus = 'blocked'
      contract.evidence.technical.completeSkillLoops = []
      for (const name of Object.keys(contract.evidence.release)) contract.evidence.release[name] = []
    }, (report) => {
      expect(report.ready).toBe(false)
      expect(report.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'blindPlaytests' }),
        expect.objectContaining({ code: 'RELEASE_STATUS_BLOCKED' }),
      ]))
    })
  })

  it('does not accept editable counts, booleans, or a ready label as release proof', () => {
    withMutatedContract((contract) => {
      contract.releaseStatus = 'ready'
      contract.evidence.technical.completeSkillLoops = Array.from({ length: 22 }, (_, index) => ({ skillId: `invented-${index}` }))
      for (const name of Object.keys(contract.evidence.release)) contract.evidence.release[name] = [{
        id: 'invented-proof', artifactPath: 'control-tower-shift/artifacts/missing-proof.json', artifactCommit: '0'.repeat(40),
        createdAt: '2026-09-01T00:00:00.000Z', sha256: '0'.repeat(64), measurements: { passed: true, participants: 100, sampleCount: 100, medianHours: 40, completed: true, completedActs: 5, caseCount: 100, runCount: 100, reviewedRecords: 100 },
      }]
    }, (report) => {
      expect(report.ready).toBe(false)
      expect(report.actual.completeSkillLoops).toBe(0)
      expect(report.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'blindPlaytests' }),
        expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'fullNormalUiPlaythrough' }),
      ]))
      expect(report.blockers).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'RELEASE_STATUS_BLOCKED' }),
      ]))
    })
  })

  it('rejects malformed or wrong-type artifact content instead of trusting record measurements', () => {
    const bytes = readFileSync(trackedArtifact)
    withMutatedContract((contract) => {
      contract.evidence.release.fullNormalUiPlaythrough = [playthroughProof(trackedArtifact, bytes, {
        measurements: { completed: true, completedActs: 999 },
      })]
    }, (report) => {
      expect(report.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'fullNormalUiPlaythrough' }),
      ]))
    })
  })

  it('rejects untracked artifacts even when the record digest matches its working bytes', () => {
    const artifactPath = 'control-tower-shift/artifacts/release-gate-untracked-proof.json'
    const bytes = Buffer.from('{"real-looking":"but untracked"}\n')
    try {
      writeFileSync(artifactPath, bytes)
      withMutatedContract((contract) => {
        contract.evidence.release.fullNormalUiPlaythrough = [playthroughProof(artifactPath, bytes)]
      }, (report) => {
        expect(report.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'fullNormalUiPlaythrough' }),
        ]))
      })
    } finally {
      rmSync(artifactPath, { force: true })
    }
  })

  it('rejects locally modified tracked artifacts and future-dated records', () => {
    const original = readFileSync(trackedArtifact)
    const modified = Buffer.concat([original, Buffer.from('\n')])
    try {
      writeFileSync(trackedArtifact, modified)
      withMutatedContract((contract) => {
        contract.evidence.release.fullNormalUiPlaythrough = [playthroughProof(trackedArtifact, modified)]
      }, (report) => {
        expect(report.blockers).toEqual(expect.arrayContaining([
          expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'fullNormalUiPlaythrough' }),
        ]))
      })
    } finally {
      writeFileSync(trackedArtifact, original)
    }
    withMutatedContract((contract) => {
      contract.evidence.release.fullNormalUiPlaythrough = [playthroughProof(
        trackedArtifact,
        original,
        { createdAt: '2999-01-01T00:00:00.000Z' },
      )]
    }, (report) => {
      expect(report.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'EVIDENCE_MISSING', metric: 'fullNormalUiPlaythrough' }),
      ]))
    })
  })
})
