import type { Defect, Severity, SourceConfig } from '@shared/types'
import { interpolate, pick } from './expr'

/** severityOrder เรียงจากหนักไปเบา ตำแหน่งที่ i ตกลงมาที่ระดับที่ i ของเรา */
const LEVELS: Severity[] = ['critical', 'high', 'medium', 'low']

/**
 * map item ดิบเป็น Defect
 * ตาม §8 ห้าม throw เมื่อหา field ไม่เจอ — คืน missing มาให้หน้า test รายงานแทน
 */
export function mapDefect(
  src: SourceConfig,
  item: unknown,
  vars: Record<string, string>,
): { defect: Defect; missing: string[]; missingContext: string[] } {
  const missing: string[] = []

  const read = (field: string, path: string | undefined): unknown => {
    if (!path) return undefined
    const value = pick(item, path)
    if (value === undefined || value === null || value === '') missing.push(field)
    return value
  }

  const id = read('id', src.map.id)
  const rawKey = src.map.key ? read('key', src.map.key) : id
  const title = read('title', src.map.title)
  const description = read('description', src.map.description)
  const severity = read('severity', src.map.severity)
  const status = read('status', src.map.status)
  const reporter = read('reporter', src.map.reporter)
  const assignee = read('assignee', src.map.assignee)
  const tags = read('tags', src.map.tags)
  const createdAt = read('createdAt', src.map.createdAt)

  const key = `${src.map.keyPrefix ?? ''}${str(rawKey) || str(id)}`

  const missingContext: string[] = []
  const extras = (src.context ?? []).map(field => {
    const value = pick(item, field.from)
    if (value === undefined || value === null || value === '') {
      missingContext.push(field.label)
      return null
    }
    return `## ${field.label}\n\n${toText(str(value))}`
  }).filter((v): v is string => v !== null)

  const bodyParts = [toText(str(description)), ...extras].filter(Boolean)

  const defect: Defect = {
    id: str(id),
    key,
    title: cleanTitle(str(title), src.titleCleanup),
    description: bodyParts.join('\n\n'),
    severity: toSeverity(str(severity), src.severityOrder),
    status: str(status),
    createdAt: str(createdAt),
  }

  const who = str(reporter)
  if (who) defect.reporter = who

  const owner = str(assignee)
  if (owner) defect.assignee = owner

  // เก็บคำเดิมของ tracker ไว้ด้วย — severity ด้านบนถูกยุบเหลือ 4 ระดับของเราไปแล้ว
  const rawSeverity = str(severity)
  if (rawSeverity) defect.severityLabel = rawSeverity

  const tagList = toTags(tags)
  if (tagList.length) defect.tags = tagList

  // ไม่มี ticketUrl = ไม่มีปุ่มเปิด ticket ฝั่งหน้าเว็บ
  if (src.ticketUrl) {
    const url = interpolate(src.ticketUrl, { ...vars, id: defect.id, key: defect.key })
    if (url && !url.includes('{')) defect.url = url
  }

  return { defect, missing, missingContext }
}

/** tracker บางเจ้าส่ง tag เป็น array ของ string บางเจ้าเป็นข้อความคั่นด้วย comma */
function toTags(value: unknown): string[] {
  const list = Array.isArray(value) ? value : str(value).split(',')
  return list.map(v => str(v).trim()).filter(Boolean)
}

function str(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

function cleanTitle(title: string, pattern: string | undefined): string {
  if (!pattern || !title) return title.trim()
  try {
    return title.replace(new RegExp(pattern), '').trim()
  } catch {
    return title.trim() // regex ใน config พัง อย่าให้ทั้งรายการพังตาม
  }
}

function toSeverity(raw: string, order: string[] | undefined): Severity {
  if (order?.length) {
    const index = order.findIndex(s => s.toLowerCase() === raw.toLowerCase())
    if (index >= 0) return LEVELS[Math.min(index, LEVELS.length - 1)] as Severity
  }
  const direct = LEVELS.find(l => l === raw.toLowerCase())
  return direct ?? 'medium'
}

/** ยังไม่ปิด = เอาไปแก้ได้ ไม่ระบุ openStatuses = เอาทั้งหมด */
export function isOpen(defect: Defect, src: SourceConfig): boolean {
  if (!src.openStatuses?.length) return true
  return src.openStatuses.some(s => s.toLowerCase() === defect.status.toLowerCase())
}

export function bySeverity(a: Defect, b: Defect): number {
  return LEVELS.indexOf(a.severity) - LEVELS.indexOf(b.severity)
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
}

/**
 * description จาก tracker หลายเจ้าเป็น HTML — ส่งดิบๆ ให้ agent อ่านไม่รู้เรื่อง
 * ตรวจเองว่ามี tag ไหม จะได้ไม่ต้องเพิ่ม config ให้ผู้ใช้กรอกอีกช่อง
 */
export function toText(input: string): string {
  if (!input || !/<[a-z!/][^>]*>/i.test(input)) return input.trim()

  return input
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<img\b[^>]*>/gi, '[รูปแนบ]')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, m => ENTITIES[m.toLowerCase()] ?? m)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim()
}
