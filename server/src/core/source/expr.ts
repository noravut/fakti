// สามฟังก์ชันนี้คือแกนของทั้งระบบ source — ทุกอย่างที่เหลือเรียกผ่านมันหมด
// เลยเป็นที่เดียวที่มี unit test

import type { DiscoveredField, FieldKind, FilterRule } from '@shared/types'

const PLACEHOLDER_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g

/**
 * แทน {ชื่อตัวแปร} ด้วยค่าจาก vars
 * ตัวที่ไม่มีค่าจะถูก "ทิ้งไว้เหมือนเดิม" ไม่ใช่แทนด้วยค่าว่าง
 * เพราะคนเรียกต้องแยกออกว่า "ยังไม่ได้กรอก" กับ "กรอกเป็นค่าว่าง" ต่างกัน
 * แล้วตัดสินใจเองว่าจะตัด query param นั้นทิ้งหรือข้าม filter rule นั้นไป
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const value = vars[key]
    return value === undefined || value === '' ? whole : value
  })
}

/** ยังมี {var} ที่แทนค่าไม่ได้ค้างอยู่ไหม */
export function hasUnresolved(value: string): boolean {
  PLACEHOLDER_RE.lastIndex = 0
  return PLACEHOLDER_RE.test(value)
}

/** แทนค่าทั้ง object แบบตื้น ตัว key ที่ยังไม่ resolve จะถูกตัดออก */
export function interpolateAll(
  input: Record<string, string> | undefined,
  vars: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input ?? {})) {
    const value = interpolate(v, vars)
    if (value && !hasUnresolved(value)) out[k] = value
  }
  return out
}

/** แทนค่าลึกทั้ง object/array — ใช้กับ body ตอน POST */
export function interpolateDeep(input: unknown, vars: Record<string, string>): unknown {
  if (typeof input === 'string') return interpolate(input, vars)
  if (Array.isArray(input)) return input.map(v => interpolateDeep(v, vars))
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, interpolateDeep(v, vars)]),
    )
  }
  return input
}

/**
 * อ่านค่าตาม path expression เช่น "data.items.0.name"
 * path ว่าง = ตัวมันเอง (API ที่ตอบ array มาตรงๆ)
 * หาไม่เจอคืน undefined ไม่ throw — ตาม §8 ห้าม throw เมื่อ map ไม่เจอ field
 */
export function pick(value: unknown, path: string): unknown {
  if (!path) return value
  let current = value
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index)) return undefined
      current = current[index]
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment]
    } else {
      return undefined
    }
  }
  return current
}

/** key ที่มีให้เลือกจริงในระดับบนสุดของ object — เอาไปโชว์ตอน mapping พัง */
export function topLevelKeys(value: unknown): string[] {
  if (Array.isArray(value)) return topLevelKeys(value[0])
  if (value && typeof value === 'object') return Object.keys(value as Record<string, unknown>)
  return []
}

/**
 * กรองฝั่งเราสำหรับ API ที่ scope ไม่ได้
 * rule ที่อ้างตัวแปรซึ่งผู้ใช้ไม่ได้กรอก (required: false) จะถูกข้าม ไม่ใช่กรองจนเกลี้ยง
 */
export function applyFilter<T>(
  items: T[],
  rules: FilterRule[] | undefined,
  vars: Record<string, string>,
): T[] {
  if (!rules?.length) return items
  return items.filter(item => rules.every(rule => matches(item, rule, vars)))
}

function matches(item: unknown, rule: FilterRule, vars: Record<string, string>): boolean {
  const actual = pick(item, rule.from)

  if (rule.exists !== undefined) {
    return (actual !== undefined && actual !== null) === rule.exists
  }

  if (rule.equals !== undefined) {
    const expected = interpolate(rule.equals, vars)
    if (hasUnresolved(expected)) return true // ไม่ได้กรอกตัวแปร = ไม่กรองด้วย rule นี้
    return String(actual) === expected
  }

  if (rule.in !== undefined) {
    const expected = rule.in.map(v => interpolate(v, vars)).filter(v => !hasUnresolved(v))
    if (expected.length === 0) return true
    return expected.includes(String(actual))
  }

  if (rule.contains !== undefined) {
    const needle = interpolate(rule.contains, vars)
    if (hasUnresolved(needle)) return true
    return String(actual ?? '').toLowerCase().includes(needle.toLowerCase())
  }

  return true
}

const MAX_DEPTH = 4
const MAX_SAMPLE_CHARS = 80

function kindOf(value: unknown): FieldKind | 'object' | 'skip' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'string': return 'string'
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'object': return 'object'
    default: return 'skip'
  }
}

function preview(value: unknown): string {
  if (value === null) return 'null'
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  return text.length > MAX_SAMPLE_CHARS ? `${text.slice(0, MAX_SAMPLE_CHARS)}…` : text
}

/**
 * ไล่ทุก field ใน item ตัวอย่างออกมาเป็น path แบบจุดพร้อมค่าที่เห็น
 * นี่คือสิ่งที่ทำให้ตั้งค่า source ได้แบบ "เห็นแล้วเลือก" — topLevelKeys ไม่พอ
 * เพราะ tracker อย่าง Jira ซ้อน field จริงไว้ใต้ fields.* หมด
 *
 * ลงลึกได้ MAX_DEPTH ชั้น · array ถูกเสนอเป็น path ของตัวมันเอง (เอาไป map tags ได้)
 * แต่ไม่ไล่เข้าไปข้างใน เพราะ index ของรายการแรกไม่ได้แปลว่ารายการอื่นมีเหมือนกัน
 */
export function flattenFields(value: unknown, prefix = '', depth = 0): DiscoveredField[] {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  const out: DiscoveredField[] = []
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key
    const kind = kindOf(child)
    if (kind === 'skip') continue
    if (kind === 'object') {
      out.push(...flattenFields(child, path, depth + 1))
      continue
    }
    out.push({ path, kind, sample: preview(child) })
  }
  return out
}

/**
 * ค่าที่พบจริงของ field หนึ่งในทุกรายการ เรียงจากที่เจอบ่อยสุด
 * ใช้เสนอ openStatuses กับ severityOrder ให้ผู้ใช้ติ๊ก ไม่ต้องเดาว่า tracker
 * สะกด status ว่าอะไรบ้าง
 */
export function distinctValues(items: unknown[], path: string): { value: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const raw = pick(item, path)
    if (raw === null || raw === undefined || typeof raw === 'object') continue
    const value = String(raw)
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}
