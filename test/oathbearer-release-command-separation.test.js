import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const text = (path) => readFileSync(path, 'utf8')

const temporaryReleaseRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'aegean-complete-release-'))
  const project = join(root, 'project')
  const bin = join(project, 'bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(project, 'deploy.sh'), text('deploy.sh'))
  chmodSync(join(project, 'deploy.sh'), 0o755)
  writeFileSync(join(project, 'tracked.txt'), 'clean\n')
  writeFileSync(join(bin, 'npm'), '#!/usr/bin/env bash\nprintf reached > "$DEPLOY_MARKER"\nexit 42\n')
  chmodSync(join(bin, 'npm'), 0o755)
  execFileSync('git', ['init'], { cwd: project, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'release-test@example.invalid'], { cwd: project })
  execFileSync('git', ['config', 'user.name', 'Release Test'], { cwd: project })
  execFileSync('git', ['add', '.'], { cwd: project })
  execFileSync('git', ['commit', '-m', 'clean fixture'], { cwd: project, stdio: 'ignore' })
  return { root, project, bin, marker: join(root, 'gate-reached') }
}

const runCompleteRelease = ({ project, bin, marker }) => spawnSync('bash', ['deploy.sh', '--complete-release'], {
  cwd: project,
  encoding: 'utf8',
  env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, DEPLOY_MARKER: marker },
})

describe('Aegean Frontier release command separation', () => {
  it('keeps a compatibility beta alias but names the non-release verification honestly', () => {
    const scripts = JSON.parse(text('package.json')).scripts
    expect(scripts['verify:oathbearer:vertical-slice']).toContain('verify-oathbearer-beta.mjs')
    expect(scripts['verify:oathbearer:beta']).toBe('npm run verify:oathbearer:vertical-slice')
    expect(scripts['verify:oathbearer:complete']).toContain('verify-oathbearer-complete-game.mjs')
  })

  it('excludes only governed Hermes quarantine from preview duplicate detection', () => {
    const duplicate = 'control-tower-shift/preview-verifier-regression 2.txt'
    try {
      const quarantined = spawnSync(process.execPath, ['scripts/verify-oathbearer-beta.mjs', '--allow-untracked'], { encoding: 'utf8' })
      expect(quarantined.status).toBe(0)
      writeFileSync(duplicate, 'ordinary duplicate\n')
      const ordinaryDuplicate = spawnSync(process.execPath, ['scripts/verify-oathbearer-beta.mjs', '--allow-untracked'], { encoding: 'utf8' })
      expect(ordinaryDuplicate.status).toBe(1)
      expect(ordinaryDuplicate.stderr).toContain(`stale duplicate files: ${duplicate}`)
    } finally {
      rmSync(duplicate, { force: true })
    }
  })

  it('uses a manual, non-deploy complete-game workflow with a retained report', () => {
    const workflow = text('.github/workflows/complete-game-release.yml')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toMatch(/fetch-depth:\s*0/)
    expect(workflow).toContain('npm run verify:oathbearer:complete')
    expect(workflow).toContain('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4')
    expect(workflow).not.toMatch(/^\s*uses:\s*actions\/upload-artifact@v4(?:\s*(?:#.*)?)?\s*$/m)
    expect(workflow).toContain('complete-game-report.json')
    expect(workflow).not.toMatch(/deploy|secrets/i)
  })

  it('does not allow automatic Render deployment and gates explicit complete deploys', () => {
    expect(text('render.yaml')).toMatch(/autoDeploy:\s*false/)
    const deploy = text('deploy.sh')
    expect(deploy).toContain('--complete-release')
    expect(deploy).toContain('npm run verify:oathbearer:complete')
    expect(deploy).toContain('General/preview deploy only')
  })

  it.each([
    ['staged or unstaged tracked changes', (fixture) => writeFileSync(join(fixture.project, 'tracked.txt'), 'dirty\n')],
    ['untracked changes', (fixture) => writeFileSync(join(fixture.project, 'untracked.txt'), 'dirty\n')],
  ])('rejects %s before reaching the complete-game gate seam', (_label, dirty) => {
    const fixture = temporaryReleaseRepo()
    try {
      dirty(fixture)
      const result = runCompleteRelease(fixture)
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('requires a clean Git working tree at HEAD')
      expect(existsSync(fixture.marker)).toBe(false)
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })

  it('reaches the complete-game gate seam from a clean tree without invoking Docker', () => {
    const fixture = temporaryReleaseRepo()
    try {
      const result = runCompleteRelease(fixture)
      expect(result.status).toBe(42)
      expect(readFileSync(fixture.marker, 'utf8')).toBe('reached')
      expect(result.stderr).toContain('Running complete-game release gate before deploy')
    } finally {
      rmSync(fixture.root, { recursive: true, force: true })
    }
  })
})
