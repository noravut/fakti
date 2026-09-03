import type {
  Defect, DefectListResponse, FetchMode, SourceConfig, Workspace,
} from '@shared/types'
import { readSettings } from '../config'
import { HttpError } from '../session'
import { readCache, writeCache } from './cache'
import { SourceError, callSource } from './client'
import { findSource, readSources } from './config'
import { applyFilter, pick } from './expr'
import { bySeverity, mapDefect } from './map'

/** source ที่ workspace นี้ใช้ — ไม่ได้ตั้งไว้ก็ตกมาที่ค่า default ของทั้งแอป */
export function sourceFor(workspace: Workspace | undefined): SourceConfig {
  const { activeSourceId, sources } = readSources()
  const wanted = workspace?.sourceId ?? readSettings().activeSourceId ?? activeSourceId
  const source = (wanted ? sources.find(s => s.id === wanted) : undefined) ?? sources[0]
  if (!source) throw new HttpError(500, 'ไม่มี defect source ที่ใช้ได้เลย — ตรวจ ~/.pat/sources.json')
  return source
}

export function varsFor(workspace: Workspace | undefined, source: SourceConfig): Record<string, string> {
  const stored = workspace?.sourceVars ?? {}
  const vars: Record<string, string> = {}
  for (const spec of source.vars) {
    const value = stored[spec.key]
    if (value) vars[spec.key] = value
  }
  return vars
}

function requireVars(source: SourceConfig, vars: Record<string, string>): void {
  const missing = source.vars.filter(v => v.required && !vars[v.key])
  if (missing.length > 0) {
    throw new HttpError(
      400,
      `ยังไม่ได้กรอก ${missing.map(v => v.label).join(', ')} ของ source "${source.label}" — ตั้งค่าได้ที่หน้าตั้งค่า repo`,
    )
  }
}

function parseItems(source: SourceConfig, body: string, url: string): unknown[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new HttpError(502, `${url} ตอบกลับมาไม่ใช่ JSON — กดทดสอบการเชื่อมต่อเพื่อดูรายละเอียด`)
  }
  const items = pick(parsed, source.itemsPath ?? '')
  if (!Array.isArray(items)) {
    throw new HttpError(502, `หา array ไม่เจอที่ itemsPath "${source.itemsPath ?? ''}" — กดทดสอบการเชื่อมต่อเพื่อดูโครงสร้างจริง`)
  }
  return items
}

/**
 * mode 'cache' คืน null เมื่อยังไม่เคย cache ไว้ — ฝั่งเว็บจะได้รู้ว่าต้องขึ้น skeleton
 * ไม่กรอง openStatuses ตรงนี้แล้ว เพราะหน้าเว็บต้องรู้จำนวนเต็มเพื่อบอกว่า "23 จาก 1341"
 */
export async function listDefects(
  workspace: Workspace | undefined,
  mode: FetchMode = 'auto',
): Promise<DefectListResponse | null> {
  const source = sourceFor(workspace)
  const vars = varsFor(workspace, source)
  requireVars(source, vars)

  const base = { sourceId: source.id, sourceLabel: source.label }

  if (mode === 'cache') {
    const cached = readCache(source.id, vars)
    if (!cached) return null
    return { ...base, ...cached, fromCache: true }
  }

  let raw
  try {
    raw = await callSource(source, source.list, vars)
  } catch (err) {
    if (err instanceof SourceError) return fromCache(source, vars, base, err)
    throw err
  }

  if (raw.status >= 400) {
    return fromCache(
      source,
      vars,
      base,
      new SourceError('http', `${raw.url} ตอบ ${raw.status}`, 'กดทดสอบการเชื่อมต่อเพื่อดูว่าพังตรงไหน'),
    )
  }

  const items = parseItems(source, raw.body, raw.url)
  const kept = applyFilter(items, source.clientFilter, vars)
  const defects = kept.map(item => mapDefect(source, item, vars).defect).sort(bySeverity)

  const fetchedAt = new Date().toISOString()
  const filtered = source.clientFilter?.length
    ? { total: items.length, kept: kept.length }
    : undefined

  writeCache(source.id, vars, { fetchedAt, defects, filtered })
  return { ...base, defects, fetchedAt, filtered, fromCache: false }
}

/**
 * ยิงไม่ถึงแล้วมี cache = แสดงของเก่าไปก่อน ไม่ใช่หน้าจอว่างเปล่า
 * แต่ต้องบอกให้ชัดว่าเป็นของเก่า เพราะปุ่ม Fix จะถูกปิดไว้
 */
function fromCache(
  source: SourceConfig,
  vars: Record<string, string>,
  base: { sourceId: string; sourceLabel: string },
  err: SourceError,
): DefectListResponse {
  const cached = readCache(source.id, vars)
  if (!cached) {
    throw new HttpError(502, [err.message, err.fix].filter(Boolean).join(' — '))
  }
  return {
    ...base,
    defects: cached.defects,
    fetchedAt: cached.fetchedAt,
    filtered: cached.filtered,
    fromCache: true,
    stale: { reason: err.message, network: source.network },
  }
}

/**
 * list ของบาง tracker ไม่มี description — ต้องตามไปดึงจาก detail
 * ทำตอนที่จะใช้จริงเท่านั้น (กดดูรายละเอียด / สร้าง session) ไม่ใช่ดึงทั้งหน้า
 */
export async function fillDetail(
  workspace: Workspace | undefined,
  defect: Defect,
): Promise<Defect> {
  const source = sourceFor(workspace)
  if (!source.detail || defect.description) return defect

  const vars = { ...varsFor(workspace, source), id: defect.id, key: defect.key }
  let raw
  try {
    raw = await callSource(source, source.detail, vars)
  } catch {
    return defect // ดึงรายละเอียดไม่ได้ ยังดีกว่าพังทั้งหน้า
  }
  if (raw.status >= 400) return defect

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.body)
  } catch {
    return defect
  }

  const item = Array.isArray(parsed) ? parsed[0] : parsed
  if (item === undefined) return defect

  const { defect: full } = mapDefect(source, item, vars)
  // ยึด description จาก detail แต่ที่เหลือเชื่อของเดิมจาก list
  return full.description ? { ...defect, description: full.description } : defect
}

/** หยิบ defect ตาม id พร้อมรายละเอียดครบ — ใช้ตอนสร้าง session */
export async function resolveDefects(
  workspace: Workspace | undefined,
  ids: string[],
): Promise<Defect[]> {
  // 'auto' ไม่มีทางคืน null — คืน null เฉพาะ mode 'cache' ที่ยังไม่เคย cache
  const { defects } = (await listDefects(workspace, 'auto')) as DefectListResponse
  const found = ids
    .map(id => defects.find(d => d.id === id))
    .filter((d): d is Defect => d !== undefined)

  if (found.length !== ids.length) {
    throw new HttpError(400, 'มี defect ที่หาไม่เจอ — กดโหลดใหม่แล้วลองอีกครั้ง')
  }
  return Promise.all(found.map(d => fillDetail(workspace, d)))
}
