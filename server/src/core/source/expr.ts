// สามฟังก์ชันนี้คือแกนของทั้งระบบ source — ทุกอย่างที่เหลือเรียกผ่านมันหมด
// เลยเป็นที่เดียวที่มี unit test

import type { FilterRule } from '@shared/types'

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
