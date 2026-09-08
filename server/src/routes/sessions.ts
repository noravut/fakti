import { execFile } from 'node:child_process'
import { Hono } from 'hono'
import { z } from 'zod'
import type { DirtyConflict, QaPromptPayload, TaskPromptPayload } from '@shared/types'
import { readWorkspaces } from '../core/config'
import * as git from '../core/git'
import { buildFeaturePrompt, buildPrompt } from '../core/prompt'
import { DirtyError, HttpError, type SessionManager } from '../core/session'
import { resolveDefects } from '../core/source/service'

const branchChoice = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new'), name: z.string().min(1), from: z.string().min(1) }),
  z.object({ kind: z.literal('existing'), name: z.string().min(1) }),
  z.object({ kind: z.literal('current') }),
])

const featureSpec = z.object({
  title: z.string().trim().min(1),
  context: z.string().optional(),
  requirements: z.array(z.object({ key: z.string().min(1), text: z.string().trim().min(1) })).min(1),
  nonGoals: z.array(z.string().trim().min(1)).optional(),
})

/** ต้องมีอย่างใดอย่างหนึ่ง: defect จาก tracker หรือ feature ที่พิมพ์เอง */
const hasWork = (v: { defectIds: string[]; feature?: unknown }) => v.defectIds.length > 0 || v.feature !== undefined

const createBody = z.object({
  workspaceId: z.string().min(1),
  defectIds: z.array(z.string().min(1)),
  feature: featureSpec.optional(),
  branch: branchChoice,
  dirtyStrategy: z.enum(['stash', 'keep']).optional(),
  prompt: z.string().trim().min(1).optional(),
}).refine(hasWork, { message: 'ไม่มีงาน' })

const previewBody = z.object({
  workspaceId: z.string().min(1),
  defectIds: z.array(z.string().min(1)),
  feature: featureSpec.optional(),
}).refine(hasWork, { message: 'ไม่มีงาน' })

const appendBody = z.object({
  defectIds: z.array(z.string().min(1)).min(1),
})

const renameBody = z.object({
  name: z.string().min(1),
})

const qaBody = z.object({
  prompt: z.string().trim().min(1),
})

export function sessionRoutes(manager: SessionManager): Hono {
  const app = new Hono()

  app.get('/', c => c.json(manager.list()))

  app.post('/', async c => {
    const parsed = createBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ครบ' }, 400)
    const { workspaceId, defectIds, feature, branch, dirtyStrategy } = parsed.data

    if (branch.kind !== 'current' && !git.isValidBranchName(branch.name)) {
      return c.json({ error: 'ชื่อ branch ใช้ได้แค่ a-z 0-9 . _ / -' }, 400)
    }

    const workspace = readWorkspaces().find(w => w.id === workspaceId)
    if (!workspace) return c.json({ error: 'ไม่พบ workspace' }, 404)

    try {
      // ดึงรายละเอียดเต็มตรงนี้ เพราะ prompt ที่ส่งให้ agent ต้องมี description
      // feature ไม่มี defect ให้ดึง — requirement มาครบในตัวอยู่แล้ว
      const defects = feature ? [] : await resolveDefects(workspace, defectIds)
      return c.json(
        await manager.create({ workspace, defects, feature, branch, dirtyStrategy, prompt: parsed.data.prompt }),
        201,
      )
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  // ร่าง prompt ที่จะเขียนลง .pat-task.md — ผู้ใช้อ่าน/แก้ใน dialog ก่อนกดเริ่ม
  app.post('/preview-prompt', async c => {
    const parsed = previewBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ครบ' }, 400)
    const workspace = readWorkspaces().find(w => w.id === parsed.data.workspaceId)
    if (!workspace) return c.json({ error: 'ไม่พบ workspace' }, 404)
    try {
      const { feature } = parsed.data
      const body: TaskPromptPayload = {
        prompt: feature ? buildFeaturePrompt(feature) : buildPrompt(await resolveDefects(workspace, parsed.data.defectIds)),
      }
      return c.json(body)
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

  app.post('/:id/rename', async c => {
    const parsed = renameBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'ต้องระบุชื่อ branch ใหม่' }, 400)
    try {
      return c.json(await manager.rename(c.req.param('id'), parsed.data.name))
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

    const session = manager.record(c.req.param('id'))
    if (!session) return c.json({ error: 'ไม่พบ session' }, 404)
    const workspace = readWorkspaces().find(w => w.id === session.workspaceId)

    try {
      const defects = await resolveDefects(workspace, parsed.data.defectIds)
      return c.json(await manager.append(c.req.param('id'), defects))
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  // QA Gate — GET เอาร่างที่เติมแล้วไปให้ผู้ใช้อ่าน POST ส่งฉบับที่ผู้ใช้ยืนยันเข้า pty
  app.get('/:id/qa-prompt', async c => {
    try {
      const body: QaPromptPayload = { prompt: await manager.qaPrompt(c.req.param('id')) }
      return c.json(body)
    } catch (err) {
      return errorResponse(c, err)
    }
  })

  app.post('/:id/qa', async c => {
    const parsed = qaBody.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'prompt ว่างเปล่า' }, 400)
    try {
      return c.json(manager.sendQa(c.req.param('id'), parsed.data.prompt))
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
