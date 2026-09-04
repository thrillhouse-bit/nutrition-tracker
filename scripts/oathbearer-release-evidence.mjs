import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'

const sha256 = (contents) => createHash('sha256').update(contents).digest('hex')
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isCanonicalUtcTimestamp = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const milliseconds = Date.parse(value)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
}
const RELEASE_MANIFEST_KEYS = Object.freeze(['schemaVersion', 'product', 'releaseStatus', 'minimums', 'evidence'])
const GOVERNED_QUARANTINE_PATHS = Object.freeze([
  'CLAUDE-CONTINUOUS-CONTENT-EXECUTION.md',
  'control-tower-shift/artifacts/hermes-dialogue/',
])

const git = (root, args) => {
  try {
    return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

const isGovernedQuarantinePath = (path) => path === GOVERNED_QUARANTINE_PATHS[0]
  || path.startsWith(GOVERNED_QUARANTINE_PATHS[1])

// Complete-release truth is evaluated from the bytes that would actually be
// shipped. The two governed quarantine paths are deliberately excluded; every
// other tracked, staged, or untracked path is a release blocker.
export function releaseWorkingTreeFromGit({ root }) {
  const output = git(root, ['status', '--porcelain=v1', '--untracked-files=all', '-z'])
  if (output == null) return { clean: false, dirtyPaths: ['<git-status-unavailable>'] }
  const records = output.toString('utf8').split('\0').filter(Boolean)
  const dirtyPaths = records
    .map((record) => record.length >= 4 ? record.slice(3) : record)
    .filter((path) => !isGovernedQuarantinePath(path))
  return { clean: dirtyPaths.length === 0, dirtyPaths }
}

const isSymlinkPath = (root, path) => {
  let current = root
  for (const part of relative(root, path).split(sep)) {
    current = resolve(current, part)
    if (lstatSync(current).isSymbolicLink()) return true
  }
  return false
}

const exactKeys = (value, keys) => isPlainObject(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key))

const readManifestAt = (root, revision) => {
  const bytes = git(root, ['show', `${revision}:control-tower-shift/full-game-release.json`])
  if (!bytes) return null
  try {
    const manifest = JSON.parse(bytes.toString('utf8'))
    return exactKeys(manifest, RELEASE_MANIFEST_KEYS)
      && typeof manifest.product === 'string'
      && manifest.product.length > 0
      && isPlainObject(manifest.minimums)
      ? manifest
      : null
  } catch {
    return null
  }
}

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const preservesFrozenContract = (snapshotManifest, finalManifest) => Boolean(snapshotManifest && finalManifest)
  && snapshotManifest.schemaVersion === finalManifest.schemaVersion
  && snapshotManifest.product === finalManifest.product
  && sameJson(snapshotManifest.minimums, finalManifest.minimums)

// A nonempty evidence manifest is a one-commit final attestation: HEAD^ is the
// tested immutable snapshot, and HEAD may only register the manifest. This is
// deliberately narrower than arbitrary ancestor provenance.
export function releaseEvidenceAttestationFromGit({ root, records }) {
  if (!Array.isArray(records) || records.length === 0) return { valid: true, snapshotCommit: null }
  const snapshotCommit = git(root, ['rev-parse', '--verify', 'HEAD^'])?.toString('utf8').trim()
  if (!snapshotCommit) return { valid: false, snapshotCommit: null }
  const changedPaths = git(root, ['diff', '--name-only', 'HEAD^', 'HEAD'])?.toString('utf8').trim().split('\n').filter(Boolean)
  if (!changedPaths || changedPaths.length !== 1 || changedPaths[0] !== 'control-tower-shift/full-game-release.json') {
    return { valid: false, snapshotCommit }
  }
  // The final attestation may register evidence and flip releaseStatus, but may
  // not rewrite the product identity or the approved release floors.
  const snapshotManifest = readManifestAt(root, 'HEAD^')
  const finalManifest = readManifestAt(root, 'HEAD')
  if (!preservesFrozenContract(snapshotManifest, finalManifest)) return { valid: false, snapshotCommit }
  if (!records.every((record) => isPlainObject(record) && record.artifactCommit === snapshotCommit)) {
    return { valid: false, snapshotCommit }
  }
  return { valid: true, snapshotCommit }
}

// artifactCommit is the tested snapshot immediately before the manifest commit.
// This avoids self-reference while ensuring the artifact has not changed since
// the exact snapshot reviewed for release.
export function evidenceArtifactFromGit({ root, record, evidenceType, expectedArtifactCommit = null, now = Date.now() }) {
  if (!isPlainObject(record)) return null
  if (typeof record.id !== 'string' || !record.id || typeof record.artifactPath !== 'string') return null
  if (typeof record.artifactCommit !== 'string' || !/^[a-f0-9]{40}$/i.test(record.artifactCommit)) return null
  if (expectedArtifactCommit && record.artifactCommit !== expectedArtifactCommit) return null
  if (typeof record.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sha256)) return null
  if (!isCanonicalUtcTimestamp(record.createdAt)) return null
  const createdAt = Date.parse(record.createdAt)
  if (createdAt > now) return null
  if (!record.artifactPath.startsWith('control-tower-shift/artifacts/') || record.artifactPath.includes('..')) return null

  const artifactDirectory = resolve(root, 'control-tower-shift/artifacts/')
  const artifactPath = resolve(root, record.artifactPath)
  if (!artifactPath.startsWith(artifactDirectory) || !existsSync(artifactPath)) return null
  if (isSymlinkPath(root, artifactPath)) return null
  if (!git(root, ['rev-parse', '--verify', `${record.artifactCommit}^{commit}`])) return null
  if (git(root, ['merge-base', '--is-ancestor', record.artifactCommit, 'HEAD']) === null) return null

  const evidenceBytes = git(root, ['show', `${record.artifactCommit}:${record.artifactPath}`])
  const headBytes = git(root, ['show', `HEAD:${record.artifactPath}`])
  const workingBytes = readFileSync(artifactPath)
  if (!evidenceBytes || !headBytes || !evidenceBytes.equals(headBytes) || !workingBytes.equals(headBytes)) return null
  if (sha256(evidenceBytes) !== record.sha256) return null

  let artifact
  try {
    artifact = JSON.parse(evidenceBytes.toString('utf8'))
  } catch {
    return null
  }
  if (!isPlainObject(artifact) || artifact.schemaVersion !== 1 || artifact.evidenceType !== evidenceType || !isPlainObject(artifact.measurements)) return null
  return artifact
}
