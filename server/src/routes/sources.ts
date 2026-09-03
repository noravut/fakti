import { Hono } from 'hono'
import { z } from 'zod'
import { readWorkspaces } from '../core/config'
import { checkSource } from '../core/source/check'
import { findSource, readSources } from '../core/source/config'
import { varsFor } from '../core/source/service'
import { fail } from './defects'

const testBody = z.object({
  vars: z.record(z.string()).default({}),
})

export const sourceRoutes = new Hono()

sourceRoutes.get('/', c => c.json(readSources().sources))

/**
 * ตรวจทีละขั้นแล้วบอกว่าพังตรงไหน
 * ถ้าไม่ส่ง vars มาจะหยิบของ workspace ที่ระบุให้ — หน้าเว็บจะได้ไม่ต้องประกอบเอง
 */
sourceRoutes.post('/:id/test', async c => {
  const source = findSource(c.req.param('id'))
  if (!source) return c.json({ error: 'ไม่พบ source นี้' }, 404)

  const parsed = testBody.safeParse(await c.req.json().catch(() => ({})))
  const sent = parsed.success ? parsed.data.vars : {}

  const workspaceId = c.req.query('workspaceId')
  const fallback = workspaceId
    ? varsFor(readWorkspaces().find(w => w.id === workspaceId), source)
    : {}

  try {
    return c.json(await checkSource(source, { ...fallback, ...sent }))
  } catch (err) {
    return fail(c, err)
  }
})
