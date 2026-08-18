import { Hono } from 'hono'
import { z } from 'zod'
import type { ValidateResult, Workspace, WorkspaceColor } from '@shared/types'
import { WORKSPACE_COLORS } from '@shared/types'
import { readSettings, readWorkspaces, writeSettings, writeWorkspaces } from '../core/config'
import * as git from '../core/git'

const colorEnum = z.enum(WORKSPACE_COLORS as [WorkspaceColor, ...WorkspaceColor[]])

const createBody = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  baseBranch: z.string().min(1),
  color: colorEnum,
})

const patchBody = createBody.partial()

function slugify(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

export const workspaceRoutes = new Hono()

workspaceRoutes.get('/', c => c.json(readWorkspaces()))

workspaceRoutes.post('/validate', async c => {
  const body = await c.req.json().catch(() => ({}))
  const p = typeof body?.path === 'string' ? body.path.trim() : ''

  const fail = (error: string) => c.json<ValidateResult>({ ok: false, error })

  if (!p) return fail('ใส่ path ของ repo')
  // pat รันฝั่ง WSL/Linux มองไม่เห็น path แบบ Windows — บอกไปตรงๆ ดีกว่าปล่อยให้งงว่าหาไม่เจอ
  if (/^(?:[A-Za-z]:[\\/]|\\\\)/.test(p)) {
    return fail('ใส่ path ฝั่ง Linux แทน เช่น /home/you/work/repo — pat รันใน WSL เลยมองไม่เห็น path แบบ Windows')
  }
  if (!git.isUsablePath(p)) {
    return fail(p.startsWith('/') ? 'ไม่พบโฟลเดอร์นี้' : 'ต้องเป็น absolute path')
  }
  if (!(await git.isGitRepo(p))) return fail('โฟลเดอร์นี้ไม่ใช่ git repo')

  const [remote, branches, currentBranch] = await Promise.all([
    git.getRemote(p),
    git.listBranches(p).catch(() => []),
    git.currentBranch(p).catch(() => undefined),
  ])

  return c.json<ValidateResult>({ ok: true, remote, branches, currentBranch })
})

workspaceRoutes.post('/', async c => {
  const parsed = createBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ครบ' }, 400)

  const { path: repoPath, name, baseBranch, color } = parsed.data
  if (!git.isUsablePath(repoPath)) return c.json({ error: 'ไม่พบโฟลเดอร์นี้' }, 400)
  if (!(await git.isGitRepo(repoPath))) return c.json({ error: 'โฟลเดอร์นี้ไม่ใช่ git repo' }, 400)
  if (!git.isValidBranchName(baseBranch)) return c.json({ error: 'ชื่อ base branch ไม่ถูกต้อง' }, 400)

  const list = readWorkspaces()
  if (list.some(w => w.path === repoPath)) return c.json({ error: 'repo นี้ถูกเพิ่มไว้แล้ว' }, 409)

  const workspace: Workspace = {
    id: slugify(name, list.map(w => w.id)),
    name,
    path: repoPath,
    baseBranch,
    color,
  }
  writeWorkspaces([...list, workspace])

  // ตัวแรกที่เพิ่ม = active ทันที ผู้ใช้จะได้ไม่ต้องไปกดเลือกอีกที
  const settings = readSettings()
  if (!settings.activeWorkspaceId) {
    writeSettings({ ...settings, activeWorkspaceId: workspace.id })
  }

  return c.json(workspace, 201)
})

workspaceRoutes.patch('/:id', async c => {
  const parsed = patchBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400)

  const list = readWorkspaces()
  const target = list.find(w => w.id === c.req.param('id'))
  if (!target) return c.json({ error: 'ไม่พบ workspace' }, 404)

  const next = { ...target, ...parsed.data }
  if (!git.isUsablePath(next.path)) return c.json({ error: 'ไม่พบโฟลเดอร์นี้' }, 400)
  if (!(await git.isGitRepo(next.path))) return c.json({ error: 'โฟลเดอร์นี้ไม่ใช่ git repo' }, 400)
  if (!git.isValidBranchName(next.baseBranch)) return c.json({ error: 'ชื่อ base branch ไม่ถูกต้อง' }, 400)

  writeWorkspaces(list.map(w => (w.id === next.id ? next : w)))
  return c.json(next)
})

workspaceRoutes.delete('/:id', c => {
  const id = c.req.param('id')
  const list = readWorkspaces()
  if (!list.some(w => w.id === id)) return c.json({ error: 'ไม่พบ workspace' }, 404)

  const rest = list.filter(w => w.id !== id)
  writeWorkspaces(rest)

  const settings = readSettings()
  if (settings.activeWorkspaceId === id) {
    writeSettings({ ...settings, activeWorkspaceId: rest[0]?.id ?? null })
  }
  return c.json({ ok: true })
})

workspaceRoutes.get('/:id/status', async c => {
  const workspace = readWorkspaces().find(w => w.id === c.req.param('id'))
  if (!workspace) return c.json({ error: 'ไม่พบ workspace' }, 404)
  if (!git.isUsablePath(workspace.path)) return c.json({ error: 'ไม่พบโฟลเดอร์ของ repo นี้' }, 410)

  try {
    return c.json(await git.status(workspace.path))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'อ่านสถานะ git ไม่ได้' }, 500)
  }
})
