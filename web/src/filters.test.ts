import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Defect } from '@shared/types'
import {
  DEFAULT_FILTERS, NO_FILTERS, activeChips, applyFilters, buildFacets, indexDefects,
  type FilterContext, type Filters,
} from './filters'

const NOW = Date.parse('2026-08-19T00:00:00.000Z')
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

const raw: Defect[] = [
  { id: '1', key: 'DEF-1', title: 'จ่ายเงินแล้วจอค้าง', description: '', severity: 'critical', status: 'New', assignee: 'Noravut', createdAt: day(1) },
  { id: '2', key: 'DEF-2', title: 'ปุ่ม Save ไม่ทำงาน', description: '', severity: 'medium', status: 'New', assignee: 'Ploy', createdAt: day(2) },
  { id: '3', key: 'DEF-3', title: 'ตกบรรทัดในรายงาน', description: '', severity: 'low', status: 'Archive', assignee: 'Noravut', createdAt: day(40) },
  { id: '4', key: 'DEF-4', title: 'export ช้ามาก', description: '', severity: 'high', status: 'Archive', createdAt: day(30) },
]

const list = indexDefects(raw)

const ctx: FilterContext = {
  openStatuses: ['New', 'Assigned', 'Reopened'],
  touchedIds: new Set(['4']),
  now: NOW,
}

const filters = (patch: Partial<Filters>): Filters => ({ ...NO_FILTERS, ...patch })
const ids = (l: { id: string }[]) => l.map(d => d.id)

// ── index ──────────────────────────────────────────────────────

test('indexDefects ทำ lowercase ของ key+title ไว้ล่วงหน้า', () => {
  assert.equal(list[0]?.search, 'def-1 จ่ายเงินแล้วจอค้าง')
  assert.equal(list[0]?.createdMs, Date.parse(raw[0]!.createdAt))
})

test('indexDefects ไม่พังกับ createdAt ที่อ่านไม่ออก', () => {
  const [d] = indexDefects([{ ...raw[0]!, createdAt: 'ไม่ใช่วันที่' }])
  assert.equal(d?.createdMs, 0)
})

// ── facets ─────────────────────────────────────────────────────

test('buildFacets นับค่าที่พบจริง เรียงจากมากไปน้อย', () => {
  const f = buildFacets(list)
  assert.deepEqual(f.status, [
    { value: 'New', count: 2 },
    { value: 'Archive', count: 2 },
  ])
  assert.deepEqual(f.assignee, [
    { value: 'Noravut', count: 2 },
    { value: 'Ploy', count: 1 },
  ])
  // ตัวที่ไม่มี assignee ต้องไม่กลายเป็น key ว่าง
  assert.equal(f.assignee.some(x => x.value === ''), false)
})

// ── filter ─────────────────────────────────────────────────────

test('ไม่มีตัวกรอง = ได้ครบ', () => {
  assert.equal(applyFilters(list, NO_FILTERS, ctx).length, 4)
})

test('onlyOpen ใช้ openStatuses ของ source', () => {
  assert.deepEqual(ids(applyFilters(list, filters({ onlyOpen: true }), ctx)), ['1', '2'])
})

test('onlyOpen ไม่กรองอะไรเลยถ้า source ไม่ได้ประกาศ openStatuses', () => {
  const loose = { ...ctx, openStatuses: [] }
  assert.equal(applyFilters(list, filters({ onlyOpen: true }), loose).length, 4)
})

test('ค้นหาแบบ substring ทั้งจาก key และ title', () => {
  assert.deepEqual(ids(applyFilters(list, filters({ search: 'def-2' }), ctx)), ['2'])
  assert.deepEqual(ids(applyFilters(list, filters({ search: 'จอค้าง' }), ctx)), ['1'])
  assert.deepEqual(ids(applyFilters(list, filters({ search: 'SAVE' }), ctx)), ['2'])
})

test('preset รุนแรงสูง = critical กับ high', () => {
  assert.deepEqual(ids(applyFilters(list, filters({ presets: ['severe'] }), ctx)), ['1', '4'])
})

test('preset ใหม่สัปดาห์นี้ นับจาก now ที่ส่งเข้ามา', () => {
  assert.deepEqual(ids(applyFilters(list, filters({ presets: ['thisWeek'] }), ctx)), ['1', '2'])
})

test('preset ที่เคยแตะ ดูจาก session ย้อนหลัง', () => {
  assert.deepEqual(ids(applyFilters(list, filters({ presets: ['touched'] }), ctx)), ['4'])
})

test('preset หลายอันพร้อมกันต้องผ่านทุกอัน', () => {
  assert.deepEqual(ids(applyFilters(list, filters({ presets: ['thisWeek', 'severe'] }), ctx)), ['1'])
})

test('เลือกหลายค่าในช่องเดียวกันเป็น OR แต่ข้ามช่องเป็น AND', () => {
  const f = filters({ statuses: ['New', 'Archive'], severities: ['critical'] })
  assert.deepEqual(ids(applyFilters(list, f, ctx)), ['1'])
})

test('ค่าเริ่มต้นคือ ยังไม่ปิด และไม่กรองผู้รับผิดชอบให้เอง', () => {
  assert.deepEqual(DEFAULT_FILTERS.presets, [])
  assert.equal(DEFAULT_FILTERS.onlyOpen, true)
  // เหลือทุกตัวที่ยังเปิดอยู่ ไม่ว่าใครรับผิดชอบ
  assert.deepEqual(ids(applyFilters(list, DEFAULT_FILTERS, ctx)), ['1', '2'])
})

test('กรองผู้รับผิดชอบด้วยชื่อตัวเองแทน preset เดิมได้ผลเท่ากัน', () => {
  const f = filters({ assignees: ['Noravut'] })
  assert.deepEqual(ids(applyFilters(list, f, ctx)), ['1', '3'])
})

// ── chips ──────────────────────────────────────────────────────

test('chip โผล่ครบทุกตัวกรองที่ทำงานอยู่', () => {
  const f = filters({ onlyOpen: true, search: 'abc', presets: ['severe'], statuses: ['New'] })
  assert.deepEqual(activeChips(f).map(c => c.id), ['open', 'search', 'preset:severe', 'status:New'])
  // ชื่อ field แยกจากค่า เพื่อให้ย่อได้เฉพาะค่า
  const statusChip = activeChips(f).find(c => c.id === 'status:New')
  assert.equal(statusChip?.field, 'status')
  assert.equal(statusChip?.value, 'New')
  assert.equal(statusChip?.full, 'status: New')
})

test('กด x ที่ chip เอาออกทีละอัน ไม่ล้างตัวอื่น', () => {
  const f = filters({ onlyOpen: true, statuses: ['New', 'Archive'] })
  const chip = activeChips(f).find(c => c.id === 'status:New')
  assert.deepEqual(chip?.without.statuses, ['Archive'])
  assert.equal(chip?.without.onlyOpen, true)
})

test('ไม่มีตัวกรองก็ไม่มี chip', () => {
  assert.equal(activeChips(NO_FILTERS).length, 0)
})
