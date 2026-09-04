#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const allowUntracked = process.argv.includes('--allow-untracked')
const failures = []
const warnings = []
const GOVERNED_QUARANTINE_MANIFEST = 'CLAUDE-CONTINUOUS-CONTENT-EXECUTION.md'
const GOVERNED_QUARANTINE_ARTIFACT_PREFIX = 'control-tower-shift/artifacts/hermes-dialogue/'

function requireFile(path) {
  if (!existsSync(join(root, path))) failures.push(`missing ${path}`)
}

function requireText(path, pattern, label) {
  requireFile(path)
  if (existsSync(join(root, path)) && !pattern.test(readFileSync(join(root, path), 'utf8'))) {
    failures.push(`${path} does not contain ${label}`)
  }
}

function walk(dir, visit) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, visit)
    else visit(path)
  }
}

const required = [
  'control-tower-shift/src/ControlTowerRPG.jsx',
  'control-tower-shift/src/rpg/index.js',
  'control-tower-shift/src/rpg/state.js',
  'control-tower-shift/src/rpg/locomotion.js',
  'control-tower-shift/src/rpg/pathfinding.js',
  'control-tower-shift/src/assets/environments/act1-beacon-overlook-v2.webp',
  'control-tower-shift/src/assets/characters/kallias-world-cutout-v1-384.webp',
  'control-tower-shift/test/five-act-playthrough.test.js',
  'control-tower-shift/test/rpg-locomotion.test.js',
  'control-tower-shift/DESIGN.md',
  'control-tower-shift/UX-CONTRACT.md',
  'Dockerfile',
  'render.yaml',
]
required.forEach(requireFile)

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
if (!packageJson.scripts?.['test:oathbearer']) failures.push('package.json is missing test:oathbearer')
if (!packageJson.scripts?.['verify:oathbearer']) failures.push('package.json is missing verify:oathbearer')

requireText('control-tower-shift/src/GameGate.jsx', /#control-tower-rpg/, 'the exact Aegean Frontier hash route')
requireText('render.yaml', /runtime:\s*docker/, 'the Docker runtime')
requireText('render.yaml', /healthCheckPath:\s*\/api\/health/, 'the production health check')

const duplicates = []
walk(join(root, 'control-tower-shift'), (path) => {
  const relativePath = relative(root, path).replaceAll('\\', '/')
  const governedQuarantine = relativePath === GOVERNED_QUARANTINE_MANIFEST
    || relativePath.startsWith(GOVERNED_QUARANTINE_ARTIFACT_PREFIX)
  if (!governedQuarantine && / (?:2|copy)\.[^/]+$/i.test(path)) duplicates.push(relativePath)
})
if (duplicates.length) failures.push(`stale duplicate files: ${duplicates.join(', ')}`)

for (const path of required.filter((item) => item.startsWith('control-tower-shift/'))) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', path], { cwd: root, stdio: 'ignore' })
  } catch {
    const message = `release-critical file is not tracked by Git: ${path}`
    if (allowUntracked) warnings.push(message)
    else failures.push(message)
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`)
for (const failure of failures) console.error(`FAIL ${failure}`)

if (failures.length) {
  console.error(`Aegean Frontier vertical-slice preview verification failed (${failures.length} issue${failures.length === 1 ? '' : 's'}).`)
  process.exit(1)
}

console.log(`Aegean Frontier vertical-slice preview surface verified${allowUntracked ? ' (pre-commit mode)' : ''}.`)
