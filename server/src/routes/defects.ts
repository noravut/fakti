import { Hono } from 'hono'
import type { FetchMode, Workspace } from '@shared/types'
import { readWorkspaces } from '../core/config'
import { HttpError } from '../core/session'
import { fillDetail, listDefects } from '../core/source/service'
import mock from '../mock/defects.json'

/** source "mock" ยิงกลับมาที่ตัวเอง จะได้เป็น source ธรรมดาตัวหนึ่ง ไม่ใช่ flag พิเศษ */
export const mockRoutes = new Hono()
mockRoutes.get('/defects', c => c.json(mock))

export const defectRoutes = new Hono()

/** ไม่ระบุ workspaceId = ใช้ตัวที่กำลังใช้อยู่ */
function workspaceFrom(id: string | undefined): Workspace | undefined {
  const list = readWorkspaces()
  if (!id) return undefined
  const found = list.find(w => w.id === id)
  if (!found) throw new HttpError(404, 'ไม่พบ workspace')
  return found
}

defectRoutes.get('/', async c => {
  const raw = c.req.query('mode')
  const mode: FetchMode = raw === 'cache' || raw === 'fresh' ? raw : 'auto'
  try {
    // mode=cache คืน null เมื่อยังไม่มี cache — ฝั่งเว็บเอาไปตัดสินใจว่าจะขึ้น skeleton ไหม
    return c.json(await listDefects(workspaceFrom(c.req.query('workspaceId')), mode))
  } catch (err) {
    return fail(c, err)
  }
})

defectRoutes.get('/:id', async c => {
  try {
    const workspace = workspaceFrom(c.req.query('workspaceId'))
    const list = await listDefects(workspace, 'auto')
    const defect = list?.defects.find(d => d.id === c.req.param('id'))
    if (!defect) return c.json({ error: 'ไม่พบ defect นี้' }, 404)
    return c.json(await fillDetail(workspace, defect))
  } catch (err) {
    return fail(c, err)
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fail(c: any, err: unknown) {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status)
  return c.json({ error: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' }, 500)
}
