import type { Defect, Severity } from '@shared/types'

/** ตัวกรองทำงานใน memory ล้วน — เปลี่ยนตัวกรองห้ามยิง API ใหม่ */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const SEVERE: Severity[] = ['critical', 'high']

export interface IndexedDefect extends Defect {
  /** key + title ตัวพิมพ์เล็ก ทำไว้ครั้งเดียวตอนโหลด ไม่ใช่ทุกครั้งที่พิมพ์ */
  search: string
  /** เวลาเป็น ms ทำไว้ครั้งเดียว จะได้ไม่ new Date() ทุกรอบ */
  createdMs: number
}

export type PresetId = 'severe' | 'thisWeek' | 'touched'

export const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'severe', label: 'รุนแรงสูง' },
  { id: 'thisWeek', label: 'ใหม่สัปดาห์นี้' },
  { id: 'touched', label: 'ที่เคยแตะ' },
]

export interface Filters {
  search: string
  presets: PresetId[]
  statuses: string[]
  severities: Severity[]
  assignees: string[]
  /** เอาเฉพาะ status ที่ source บอกว่ายังไม่ปิด */
  onlyOpen: boolean
}

/** ค่าเริ่มต้น: เอาเฉพาะที่ยังไม่ปิด ใครรับผิดชอบค่อยเลือกเองจากช่อง "ผู้รับผิดชอบ" */
export const DEFAULT_FILTERS: Filters = {
  search: '',
  presets: [],
  statuses: [],
  severities: [],
  assignees: [],
  onlyOpen: true,
}

export const NO_FILTERS: Filters = {
  search: '',
  presets: [],
  statuses: [],
  severities: [],
  assignees: [],
  onlyOpen: false,
}

export interface FilterContext {
  openStatuses: string[]
  touchedIds: Set<string>
  now: number
}

export function indexDefects(list: Defect[]): IndexedDefect[] {
  return list.map(d => ({
    ...d,
    search: `${d.key} ${d.title}`.toLowerCase(),
    createdMs: Date.parse(d.createdAt) || 0,
  }))
}

export interface Facet {
  value: string
  count: number
}

export interface Facets {
  status: Facet[]
  severity: Facet[]
  assignee: Facet[]
}

/** นับค่าที่พบจริงในแต่ละ field ครั้งเดียวตอนโหลด เอาไปเป็นตัวเลือกใน dropdown */
export function buildFacets(list: IndexedDefect[]): Facets {
  const count = (pick: (d: IndexedDefect) => string | undefined): Facet[] => {
    const map = new Map<string, number>()
    for (const d of list) {
      const value = pick(d)
      if (value) map.set(value, (map.get(value) ?? 0) + 1)
    }
    return [...map].map(([value, n]) => ({ value, count: n })).sort((a, b) => b.count - a.count)
  }
  return {
    status: count(d => d.status),
    severity: count(d => d.severity),
    assignee: count(d => d.assignee),
  }
}

function isOpen(d: IndexedDefect, openStatuses: string[]): boolean {
  if (openStatuses.length === 0) return true
  return openStatuses.some(s => s.toLowerCase() === d.status.toLowerCase())
}

function passesPreset(d: IndexedDefect, preset: PresetId, ctx: FilterContext): boolean {
  switch (preset) {
    case 'severe':
      return SEVERE.includes(d.severity)
    case 'thisWeek':
      return d.createdMs > 0 && ctx.now - d.createdMs <= WEEK_MS
    case 'touched':
      return ctx.touchedIds.has(d.id)
  }
}

export function applyFilters(
  list: IndexedDefect[],
  f: Filters,
  ctx: FilterContext,
): IndexedDefect[] {
  const needle = f.search.trim().toLowerCase()

  return list.filter(d => {
    if (f.onlyOpen && !isOpen(d, ctx.openStatuses)) return false
    if (needle && !d.search.includes(needle)) return false
    if (f.statuses.length > 0 && !f.statuses.includes(d.status)) return false
    if (f.severities.length > 0 && !f.severities.includes(d.severity)) return false
    if (f.assignees.length > 0 && !(d.assignee && f.assignees.includes(d.assignee))) return false
    // preset หลายอันพร้อมกัน = ต้องผ่านทุกอัน
    return f.presets.every(p => passesPreset(d, p, ctx))
  })
}

export interface Chip {
  id: string
  /**
   * ชื่อ field แยกจากค่า เพราะตอนที่ไม่พอต้องย่อที่ "ค่า" เท่านั้น
   * ชื่อ field ถูกตัดเมื่อไหร่ chip จะอ่านไม่รู้เรื่องทันที (us: New)
   */
  field?: string
  value: string
  /** ข้อความเต็มสำหรับ title attribute */
  full: string
  /** ค่าที่ได้หลังกด x ตัวนี้ออก */
  without: Filters
}

function chip(id: string, field: string | undefined, value: string, without: Filters): Chip {
  return { id, field, value, full: field ? `${field}: ${value}` : value, without }
}

/** ตัวกรองที่ทำงานอยู่ กด x เอาออกได้ทีละอัน */
export function activeChips(f: Filters): Chip[] {
  const chips: Chip[] = []

  if (f.onlyOpen) {
    chips.push(chip('open', undefined, 'ยังไม่ปิด', { ...f, onlyOpen: false }))
  }
  if (f.search.trim()) {
    chips.push(chip('search', 'ค้นหา', f.search.trim(), { ...f, search: '' }))
  }
  for (const p of f.presets) {
    chips.push(chip(
      `preset:${p}`,
      undefined,
      PRESETS.find(x => x.id === p)?.label ?? p,
      { ...f, presets: f.presets.filter(x => x !== p) },
    ))
  }
  for (const s of f.statuses) {
    chips.push(chip(`status:${s}`, 'status', s, { ...f, statuses: f.statuses.filter(x => x !== s) }))
  }
  for (const s of f.severities) {
    chips.push(chip(
      `severity:${s}`, 'ความรุนแรง', s,
      { ...f, severities: f.severities.filter(x => x !== s) },
    ))
  }
  for (const a of f.assignees) {
    chips.push(chip(
      `assignee:${a}`, 'ผู้รับผิดชอบ', a,
      { ...f, assignees: f.assignees.filter(x => x !== a) },
    ))
  }

  return chips
}
