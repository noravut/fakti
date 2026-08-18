import { execFile } from 'node:child_process'
import { Hono } from 'hono'
import { z } from 'zod'
import type { DirtyConflict } from '@shared/types'
import { readWorkspaces } from '../core/config'
import * as git from '../core/git'
import { DirtyError, HttpError, type SessionManager } from '../core/session'
import { allDefects } from './defects'

const createBody = z.object({
  workspaceId: z.string().min(1),
  defectIds: z.array(z.string().min(1)).min(1),
  branch: z.string().min(1),
  dirtyStrategy: z.enum(['stash', 'keep']).optional(),
})

const appendBody = z.object({
  defectIds: z.array(z.string().min(1)).min(1),
})

export function sessionRoutes(manager: SessionManager): Hono {
  const app = new Hono()

  app.get('/', c => c.json(manager.list()))

  app.post('/', async c => {
    const parsed = createBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ครบ' }, 400)
    const { workspaceId, defectIds, branch, dirtyStrategy } = parsed.data

    if (!git.isValidBranchName(branch)) {
      return c.json({ error: 'ชื่อ branch ใช้ได้แค่ a-z 0-9 . _ / -' }, 400)
    }

    const workspace = readWorkspaces().find(w => w.id === workspaceId)
    if (!workspace) return c.json({ error: 'ไม่พบ workspace' }, 404)

    const defects = allDefects().filter(d => defectIds.includes(d.id))
    if (defects.length !== defectIds.length) return c.json({ error: 'มี defect ที่หาไม่เจอ' }, 400)

    try {
      return c.json(await manager.create({ workspace, defects, branch, dirtyStrategy }), 201)
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  app.get('/:id', c => {
    const session = manager.record(c.req.param('id'))
    if (!session) return c.json({ error: 'ไม่พบ session' }, 404)
    return c.json({ ...session, live: manager.isLive(session.id) })
  })

  app.get('/:id/diff', async c => {
    try {
      return c.json(await manager.diff(c.req.param('id')))
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  app.post('/:id/close', async c => {
    try {
      return c.json(await manager.close(c.req.param('id')))
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  app.post('/:id/discard', async c => {
    try {
      return c.json(await manager.discard(c.req.param('id')))
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  app.post('/:id/reopen', async c => {
    try {
      return c.json(await manager.reopen(c.req.param('id')))
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  // ตัวเลือก "ต่อใน session ที่เปิดอยู่" ใน confirm dialog
  app.post('/:id/append', async c => {
    const parsed = appendBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ครบ' }, 400)

    const defects = allDefects().filter(d => parsed.data.defectIds.includes(d.id))
    if (defects.length !== parsed.data.defectIds.length) return c.json({ error: 'มี defect ที่หาไม่เจอ' }, 400)

    try {
      return c.json(await manager.append(c.req.param('id'), defects))
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  app.post('/:id/open-editor', async c => {
    const session = manager.record(c.req.param('id'))
    if (!session) return c.json({ error: 'ไม่พบ session' }, 404)
    const workspace = readWorkspaces().find(w => w.id === session.workspaceId)
    if (!workspace) return c.json({ error: 'ไม่พบ workspace' }, 404)

    try {
      await new Promise<void>((resolve, reject) => {
        execFile('code', [workspace.path], err => (err ? reject(err) : resolve()))
      })
      return c.json({ ok: true })
    } catch {
      return c.json({ error: 'เรียก code ไม่ได้ — ติดตั้ง shell command ของ VSCode หรือยัง' }, 500)
    }
  })

  return app
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorResponse(c: any, err: unknown) {
  if (err instanceof DirtyError) {
    const body: DirtyConflict = { error: 'dirty', dirtyCount: err.dirtyCount, branch: err.branch }
    return c.json(body, 409)
  }
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
  return c.json({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }, 500)
}
