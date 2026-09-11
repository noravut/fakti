import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { SourceConfig } from '@shared/types'
import { PAT_DIR, addWarning } from '../config'
import defaults from '../../sources.default.json'

const SOURCES_FILE = path.join(PAT_DIR, 'sources.json')
const SECRETS_FILE = path.join(PAT_DIR, 'secrets.json')

// ── schema ─────────────────────────────────────────────────────

const requestSchema = z.object({
  method: z.enum(['GET', 'POST']).optional(),
  path: z.string(),
  query: z.record(z.string()).optional(),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
})

const authSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), tokenRef: z.string().min(1) }),
  z.object({ type: z.literal('header'), name: z.string().min(1), valueRef: z.string().min(1) }),
  z.object({ type: z.literal('basic'), userRef: z.string().min(1), passRef: z.string().min(1) }),
  z.object({ type: z.literal('query'), name: z.string().min(1), valueRef: z.string().min(1) }),
])

const filterSchema = z.object({
  from: z.string().min(1),
  equals: z.string().optional(),
  in: z.array(z.string()).optional(),
  contains: z.string().optional(),
  exists: z.boolean().optional(),
})

const sourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  network: z.enum(['internal', 'public']).default('public'),
  baseUrl: z.string().min(1),
  insecureTLS: z.boolean().optional(),
  auth: authSchema.optional(),
  vars: z.array(z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().optional(),
    hint: z.string().optional(),
  })).default([]),
  list: requestSchema,
  detail: requestSchema.optional(),
  itemsPath: z.string().default(''),
  map: z.object({
    id: z.string().min(1),
    key: z.string().optional(),
    keyPrefix: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    severity: z.string().optional(),
    status: z.string().optional(),
    reporter: z.string().optional(),
    assignee: z.string().optional(),
    tags: z.string().optional(),
    createdAt: z.string().optional(),
  }),
  titleCleanup: z.string().optional(),
  openStatuses: z.array(z.string()).optional(),
  severityOrder: z.array(z.string()).optional(),
  clientFilter: z.array(filterSchema).optional(),
  context: z.array(z.object({ label: z.string(), from: z.string() })).optional(),
  ticketUrl: z.string().optional(),
})

const fileSchema = z.object({
  activeSourceId: z.string().nullable().default(null),
  sources: z.array(sourceSchema).default([]),
})

// ── อ่าน/เขียน ─────────────────────────────────────────────────

/**
 * sources.json ตั้งใจให้แชร์เข้า repo ได้ — ถ้ายังไม่มีให้เขียนตัวตั้งต้นลงไปเลย
 * ผู้ใช้จะได้มีไฟล์จริงให้แก้ ไม่ต้องเดารูปแบบเอง
 */
export function readSources(): { activeSourceId: string | null; sources: SourceConfig[] } {
  let raw: string
  try {
    raw = fs.readFileSync(SOURCES_FILE, 'utf8')
  } catch {
    try {
      fs.mkdirSync(PAT_DIR, { recursive: true })
      fs.writeFileSync(SOURCES_FILE, `${JSON.stringify(defaults, null, 2)}\n`, 'utf8')
    } catch {
      /* เขียนไม่ได้ก็ยังใช้ค่าใน memory ต่อได้ */
    }
    return fileSchema.parse(defaults) as { activeSourceId: string | null; sources: SourceConfig[] }
  }

  try {
    return fileSchema.parse(JSON.parse(raw)) as { activeSourceId: string | null; sources: SourceConfig[] }
  } catch (err) {
    const backup = `${SOURCES_FILE}.bak`
    try {
      fs.writeFileSync(backup, raw, 'utf8')
    } catch {
      /* backup ไม่ได้ก็ยังต้องไปต่อ */
    }
    const reason = err instanceof z.ZodError
      ? err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')
      : String(err)
    addWarning(
      `อ่าน sources.json ไม่ได้ (${reason}) — สำรองไว้ที่ sources.json.bak แล้วใช้ค่าตั้งต้นแทน`,
    )
    return fileSchema.parse(defaults) as { activeSourceId: string | null; sources: SourceConfig[] }
  }
}

export function findSource(id: string | null | undefined): SourceConfig | undefined {
  if (!id) return undefined
  return readSources().sources.find(s => s.id === id)
}

/**
 * secrets.json แยกจาก sources.json เพราะไฟล์นั้นตั้งใจให้แชร์เข้า repo ได้
 * ห้ามเอา token ไปปนกัน
 */
export function readSecret(ref: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8')) as Record<string, unknown>
    const value = parsed[ref]
    return typeof value === 'string' && value ? value : undefined
  } catch {
    return undefined
  }
}

export const SECRETS_PATH = SECRETS_FILE

/** สร้างไฟล์เปล่าแบบ 600 ไว้ให้ผู้ใช้เติมเอง ถ้ายังไม่มี */
export function ensureSecretsFile(): void {
  if (fs.existsSync(SECRETS_FILE)) return
  try {
    fs.mkdirSync(PAT_DIR, { recursive: true })
    fs.writeFileSync(SECRETS_FILE, '{}\n', { encoding: 'utf8', mode: 0o600 })
  } catch {
    /* สร้างไม่ได้ก็ไม่เป็นไร ผู้ใช้สร้างเองได้ */
  }
}
