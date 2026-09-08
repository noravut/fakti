import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { z } from 'zod'
import type { Session, Settings, Workspace } from '@shared/types'
import { DEFAULT_PROTECTED_BRANCHES, WORKSPACE_COLORS } from '@shared/types'

export const PAT_DIR = path.join(os.homedir(), '.pat')

const WORKSPACES_FILE = path.join(PAT_DIR, 'workspaces.json')
const SESSIONS_FILE = path.join(PAT_DIR, 'sessions.json')
const SETTINGS_FILE = path.join(PAT_DIR, 'settings.json')

/** เก็บ session ย้อนหลังแค่เท่านี้ ตัดของเก่าทิ้งตอนเขียน */
const SESSION_HISTORY_LIMIT = 50

export const DEFAULT_PORT = 5273

// ── schema ─────────────────────────────────────────────────────

const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  baseBranch: z.string().min(1),
  color: z.enum(WORKSPACE_COLORS as [string, ...string[]]),
  sourceId: z.string().optional(),
  sourceVars: z.record(z.string()).optional(),
  protectedBranches: z.array(z.string()).optional(),
})

const defectSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.string(),
  reporter: z.string().optional(),
  assignee: z.string().optional(),
  createdAt: z.string(),
  url: z.string().optional(),
})

const featureSchema = z.object({
  title: z.string().min(1),
  context: z.string().optional(),
  requirements: z.array(z.object({ key: z.string().min(1), text: z.string().min(1) })).min(1),
  nonGoals: z.array(z.string()).optional(),
})

const sessionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  branch: z.string().min(1),
  baseCommit: z.string(),
  /** record ก่อนมี feature session ไม่มี field นี้ — ถือเป็น defect */
  kind: z.enum(['defect', 'feature']).default('defect'),
  defectIds: z.array(z.string()),
  defects: z.array(defectSchema),
  feature: featureSchema.optional(),
  state: z.enum(['working', 'waiting', 'idle', 'closed']),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  closedAt: z.string().optional(),
  branchOwnership: z.enum(['created', 'existing']).optional(),
  /** ชื่อเดิมของ field นี้ — session ที่บันทึกไว้ก่อนหน้ายังอ่านได้ */
  createdBranch: z.boolean().optional(),
})

const settingsSchema = z.object({
  activeWorkspaceId: z.string().nullable().default(null),
  activeSourceId: z.string().nullable().default(null),
  myName: z.string().nullable().default(null),
  protectedBranches: z.array(z.string()).default(DEFAULT_PROTECTED_BRANCHES),
  port: z.number().int().min(1).max(65535).default(DEFAULT_PORT),
})

// ── warning ที่ส่งไปแสดงในหน้าเว็บ ──────────────────────────────

const warnings: string[] = []

export function getWarnings(): string[] {
  return [...warnings]
}

/** ไฟล์พังจะถูกอ่านซ้ำทุกรอบ อย่าให้ข้อความซ้ำกองขึ้นเรื่อยๆ */
export function addWarning(message: string): void {
  if (!warnings.includes(message)) warnings.push(message)
}

// ── อ่าน/เขียนแบบไม่ crash ──────────────────────────────────────

function ensureDir(): void {
  fs.mkdirSync(PAT_DIR, { recursive: true })
}

/**
 * อ่านไฟล์ผ่าน schema ถ้าพังให้ backup เป็น .bak แล้วคืนค่า fallback
 * ห้าม throw — ผู้ใช้แก้ไฟล์เองได้ พังเมื่อไหร่ก็ได้
 */
function readJson<T>(file: string, schema: z.ZodType<T>, fallback: T): T {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch {
    return fallback // ยังไม่มีไฟล์ = ปกติ ไม่ต้องเตือน
  }

  try {
    return schema.parse(JSON.parse(raw))
  } catch (err) {
    const backup = `${file}.bak`
    try {
      fs.writeFileSync(backup, raw, 'utf8')
    } catch {
      /* backup ไม่ได้ก็ยังต้องไปต่อ */
    }
    const reason = err instanceof z.ZodError ? err.issues.map(i => i.path.join('.')).join(', ') : String(err)
    const message =
      `อ่าน ${path.basename(file)} ไม่ได้ (${reason || 'รูปแบบไม่ถูกต้อง'}) — ` +
      `สำรองไว้ที่ ${path.basename(backup)} แล้วเริ่มใหม่จากค่าว่าง`
    // ไฟล์พังจะถูกอ่านซ้ำทุกรอบจนกว่าจะมีการเขียนทับ อย่าให้ข้อความซ้ำกองขึ้นเรื่อยๆ
    if (!warnings.includes(message)) warnings.push(message)
    return fallback
  }
}

/** เขียนลง .tmp แล้ว rename ทับ — กันไฟล์พังตอนถูกฆ่ากลางคัน */
function writeJson(file: string, value: unknown): void {
  ensureDir()
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(tmp, file)
}

// ── workspaces ─────────────────────────────────────────────────

export function readWorkspaces(): Workspace[] {
  return readJson(WORKSPACES_FILE, z.array(workspaceSchema), []) as Workspace[]
}

export function writeWorkspaces(list: Workspace[]): void {
  writeJson(WORKSPACES_FILE, list)
}

// ── sessions ───────────────────────────────────────────────────

export function readSessions(): Session[] {
  const rows = readJson(SESSIONS_FILE, z.array(sessionSchema), [])
  // ไฟล์ที่บันทึกไว้ก่อนมี branchOwnership ยังต้องอ่านได้
  // ไม่มีทั้งสอง field → ถือว่า fakti สร้าง branch เอง (พฤติกรรมเดิม)
  return rows.map(({ createdBranch, ...s }) => ({
    ...s,
    branchOwnership: s.branchOwnership ?? (createdBranch === false ? 'existing' : 'created'),
  })) as Session[]
}

export function writeSessions(list: Session[]): void {
  // ใหม่สุดอยู่บน แล้วตัดให้เหลือ SESSION_HISTORY_LIMIT
  const trimmed = [...list]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, SESSION_HISTORY_LIMIT)
  writeJson(SESSIONS_FILE, trimmed)
}

// ── settings ───────────────────────────────────────────────────

export function readSettings(): Settings {
  return readJson(SETTINGS_FILE, settingsSchema, {
    activeWorkspaceId: null,
    activeSourceId: null,
    myName: null,
    protectedBranches: DEFAULT_PROTECTED_BRANCHES,
    port: DEFAULT_PORT,
  }) as Settings
}

export function writeSettings(value: Settings): void {
  writeJson(SETTINGS_FILE, value)
}

/**
 * branch ที่ห้ามแก้ทับของ workspace นี้ — ของ workspace ทับค่าตั้งต้นของแอป
 * ที่เดียวที่ตอบคำถาม "branch นี้แตะได้ไหม" ห้ามไปเทียบกับ baseBranch ที่อื่น
 */
export function protectedBranchesFor(workspace: Workspace | undefined): string[] {
  const list = workspace?.protectedBranches ?? readSettings().protectedBranches
  return list.filter(name => name.trim().length > 0)
}

export function isProtectedBranch(name: string, list: string[]): boolean {
  return list.some(p => p.toLowerCase() === name.toLowerCase())
}
