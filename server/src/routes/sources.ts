import { Hono } from 'hono'
import { z } from 'zod'
import type { CheckResult, ProbeResult, SourceConfig } from '@shared/types'
import { readWorkspaces } from '../core/config'
import { checkSource, probeSource } from '../core/source/check'
import {
  findSource, readSources, secretRefs, singleSourceSchema, writeSecret, writeSources,
} from '../core/source/config'
import { varsFor } from '../core/source/service'
import { fail } from './defects'

const testBody = z.object({
  vars: z.record(z.string()).default({}),
})

const probeBody = z.object({
  source: singleSourceSchema,
  vars: z.record(z.string()).default({}),
})

/** เก็บ token ให้ก่อนยิง จะได้ไม่ต้องสลับไปแก้ secrets.json เองกลางทาง */
const secretBody = z.object({
  ref: z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, 'ref ใช้ได้แค่ a-z A-Z 0-9 _ -'),
  value: z.string().min(1),
})

export const sourceRoutes = new Hono()

sourceRoutes.get('/', c => c.json(readSources().sources))

/** ชื่อ secret ที่มีค่าอยู่แล้ว — ชื่อเท่านั้น ค่าไม่เคยออกจาก server */
sourceRoutes.get('/secrets', c => c.json(secretRefs()))

sourceRoutes.put('/secrets', async c => {
  const parsed = secretBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ครบ' }, 400)
  try {
    writeSecret(parsed.data.ref, parsed.data.value)
    return c.json({ ok: true })
  } catch (err) {
    return fail(c, err)
  }
})

/**
 * ลองยิง source ที่ยังไม่ได้บันทึก แล้วคืน field ที่เจอพร้อมค่าที่พบจริง
 * ตัวนี้คือสิ่งที่ทำให้ตั้งค่าแบบ "เห็นแล้วเลือก" ได้ — ไม่ต้องบันทึกก่อนจึงจะทดสอบได้
 */
sourceRoutes.post('/probe', async c => {
  const parsed = probeBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return c.json({ error: `${issue?.path.join('.') ?? 'body'}: ${issue?.message ?? 'ไม่ถูกต้อง'}` }, 400)
  }
  try {
    const result = await probeSource(parsed.data.source as SourceConfig, parsed.data.vars)
    return c.json(stripItems(result))
  } catch (err) {
    return fail(c, err)
  }
})

sourceRoutes.post('/', async c => {
  const parsed = singleSourceSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return c.json({ error: `${issue?.path.join('.') ?? 'body'}: ${issue?.message ?? 'ไม่ถูกต้อง'}` }, 400)
  }
  const file = readSources()
  if (file.sources.some(s => s.id === parsed.data.id)) {
    return c.json({ error: `มี source id "${parsed.data.id}" อยู่แล้ว` }, 409)
  }
  try {
    const source = parsed.data as SourceConfig
    writeSources({ ...file, sources: [...file.sources, source] })
    return c.json(source, 201)
  } catch (err) {
    return fail(c, err)
  }
})

sourceRoutes.patch('/:id', async c => {
  const id = c.req.param('id')
  const parsed = singleSourceSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return c.json({ error: `${issue?.path.join('.') ?? 'body'}: ${issue?.message ?? 'ไม่ถูกต้อง'}` }, 400)
  }
  if (parsed.data.id !== id) return c.json({ error: 'เปลี่ยน id ของ source ไม่ได้' }, 400)

  const file = readSources()
  if (!file.sources.some(s => s.id === id)) return c.json({ error: 'ไม่พบ source นี้' }, 404)
  try {
    const source = parsed.data as SourceConfig
    writeSources({ ...file, sources: file.sources.map(s => (s.id === id ? source : s)) })
    return c.json(source)
  } catch (err) {
    return fail(c, err)
  }
})

sourceRoutes.delete('/:id', c => {
  const id = c.req.param('id')
  const file = readSources()
  if (!file.sources.some(s => s.id === id)) return c.json({ error: 'ไม่พบ source นี้' }, 404)

  // repo ที่ผูกกับ source นี้จะดึง defect ไม่ได้ทันที — บอกก่อน ไม่ลบเงียบๆ
  const used = readWorkspaces().filter(w => w.sourceId === id).map(w => w.id)
  if (used.length > 0) {
    return c.json({ error: `repo ${used.join(', ')} ยังใช้ source นี้อยู่ — เปลี่ยน source ของ repo ก่อน` }, 409)
  }

  try {
    const rest = file.sources.filter(s => s.id !== id)
    writeSources({
      // ลบตัวที่เป็นค่าตั้งต้น = ยกตัวที่เหลือตัวแรกขึ้นมา ไม่ปล่อยให้ชี้ไปตัวที่ไม่มี
      activeSourceId: file.activeSourceId === id ? rest[0]?.id ?? null : file.activeSourceId,
      sources: rest,
    })
    return c.json({ ok: true })
  } catch (err) {
    return fail(c, err)
  }
})

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
    const results = await checkSource(source, { ...fallback, ...sent })
    return c.json(results.map(stripCheckItems))
  } catch (err) {
    return fail(c, err)
  }
})

/** items คือรายการดิบทั้งชุด มีไว้ให้ probeSource นับค่าต่อ ไม่ต้องส่งข้ามสาย */
function stripCheckItems(result: CheckResult): CheckResult {
  const { items: _items, ...rest } = result
  return rest
}

function stripItems(result: ProbeResult): ProbeResult {
  return { ...result, checks: result.checks.map(stripCheckItems) }
}
