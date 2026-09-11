import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, mock } from 'node:test'
import type { IPty } from 'node-pty'
import type { Defect, Session, SessionAgent, Workspace } from '@shared/types'

// Keep persistence and git operations inside a disposable directory.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fakti-agents-'))
const homeMock = mock.method(os, 'homedir', () => root)
const config = require('./config') as typeof import('./config')
homeMock.mock.restore()
const { SessionManager, loadPty } = require('./session') as typeof import('./session')
const { sessionRoutes } = require('../routes/sessions') as typeof import('../routes/sessions')

test('agent selection survives creation, follow-up tasks and reopening', async t => {
  const repo = path.join(root, 'repo')
  fs.mkdirSync(repo)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
  git('init', '-b', 'task')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-m', 'initial')
  const workspace: Workspace = { id: 'test', name: 'Test', path: repo, baseBranch: 'task', color: 'blue' }
  config.writeWorkspaces([workspace])

  const calls: { command: string; args: string[]; writes: string[]; cwd: string | undefined }[] = []
  const spawnMock = mock.method(loadPty(), 'spawn', (command: string, args: string[], options: { cwd?: string }) => {
    // Task must exist before the CLI can begin reading its initial argument.
    assert.ok(fs.existsSync(path.join(repo, '.pat-task.md')))
    const call = { command, args, writes: [] as string[], cwd: options.cwd }
    calls.push(call)
    const exitHandlers: (() => void)[] = []
    return {
      write: (data: string) => call.writes.push(data),
      onData: () => ({ dispose() {} }),
      onExit: (fn: (event: { exitCode: number }) => void) => {
        exitHandlers.push(() => fn({ exitCode: 0 }))
        return { dispose() {} }
      },
      kill: () => exitHandlers.forEach(fn => fn()),
      resize() {},
    } as unknown as IPty
  })
  const manager = new SessionManager(() => [workspace])
  t.after(async () => {
    await manager.shutdown()
    spawnMock.mock.restore()
    fs.rmSync(root, { recursive: true, force: true })
  })

  const defect: Defect = {
    id: '1', key: 'BUG-1', title: 'Broken button', description: 'Fix it',
    severity: 'low', status: 'open', createdAt: new Date().toISOString(),
  }
  let codexSession: Session
  for (const agent of ['claude', 'codex'] as SessionAgent[]) {
    await t.test(`${agent}: create, append, QA, persist and reopen`, async () => {
      const session = await manager.create({
        workspace, defects: [defect], branch: { kind: 'current' },
        // Omission must preserve the existing Claude Code API behavior.
        agent: agent === 'claude' ? undefined : agent, prompt: 'Custom task\nรายละเอียดภาษาไทย',
      })
      assert.equal(session.agent, agent)
      const call = calls.at(-1)!
      assert.equal(call.command, agent)
      assert.equal(call.cwd, repo)
      assert.deepEqual(call.args, agent === 'codex' ? ['--no-alt-screen', 'อ่าน .pat-task.md แล้วทำตามนั้น'] : [])
      assert.deepEqual(call.writes, agent === 'codex' ? [] : ['อ่าน .pat-task.md แล้วทำตามนั้น\r'])
      assert.match(fs.readFileSync(path.join(repo, '.pat-task.md'), 'utf8'), /Custom task\nรายละเอียดภาษาไทย/)
      assert.equal(config.readSessions().find(s => s.id === session.id)?.agent, agent)

      await manager.append(session.id, [{ ...defect, id: '2', key: 'BUG-2' }])
      assert.equal(call.writes.at(-1), 'อ่าน .pat-task.md แล้วทำตามนั้น\r')
      assert.match(fs.readFileSync(path.join(repo, '.pat-task.md'), 'utf8'), /BUG-2/)
      manager.sendQa(session.id, 'ตรวจงาน QA')
      assert.equal(call.writes.at(-1), 'อ่าน .pat-qa.md แล้วทำตามนั้น\r')
      manager.input(session.id, '\x03')
      assert.equal(call.writes.at(-1), '\x03')
      await manager.close(session.id)
      assert.equal(session.state, 'closed')
      await manager.reopen(session.id)
      assert.equal(calls.at(-1)?.command, agent)
      await manager.close(session.id)
      if (agent === 'codex') codexSession = session
    })
  }

  await t.test('saved legacy sessions default to Claude; Codex survives server restart', () => {
    const { agent: _agent, ...legacy } = codexSession!
    fs.writeFileSync(path.join(config.PAT_DIR, 'sessions.json'), JSON.stringify([
      { ...legacy, id: 'legacy' }, codexSession!,
    ]))
    const restarted = new SessionManager(() => [workspace])
    assert.equal(restarted.record('legacy')?.agent, 'claude')
    assert.equal(restarted.record(codexSession!.id)?.agent, 'codex')
  })

  await t.test('HTTP API passes Codex through for feature sessions and rejects unknown commands', async () => {
    const app = sessionRoutes(manager)
    const body = {
      workspaceId: workspace.id, agent: 'codex', defectIds: [], branch: { kind: 'current' },
      feature: { title: 'New feature', requirements: [{ key: 'REQ-1', text: 'Works' }] },
    }
    const request = (agent: string) => app.request('/', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, agent }),
    })
    const response = await request('codex')
    assert.equal(response.status, 201)
    const session = await response.json() as Session
    assert.equal(session.agent, 'codex')
    assert.equal(session.kind, 'feature')
    assert.equal(calls.at(-1)?.command, 'codex')
    await manager.close(session.id)
    const count = calls.length
    assert.equal((await request('bash')).status, 400)
    assert.equal(calls.length, count)
  })

  await t.test('spawn failure names the selected CLI', async () => {
    spawnMock.mock.mockImplementation(() => { throw new Error('ENOENT') })
    await assert.rejects(manager.create({
      workspace, agent: 'codex', defects: [defect], branch: { kind: 'current' },
    }), /เปิด codex ไม่ได้: ENOENT[\s\S]*codex อยู่ใน PATH/)
  })
})
