import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyFilter, distinctValues, flattenFields, hasUnresolved, interpolate, interpolateAll,
  interpolateDeep, pick, topLevelKeys,
} from './expr'

// ── interpolate ────────────────────────────────────────────────

test('interpolate แทนค่าที่มี และคงตัวที่ไม่มีไว้เหมือนเดิม', () => {
  assert.equal(interpolate('/repos/{owner}/{repo}/issues', { owner: 'a', repo: 'b' }), '/repos/a/b/issues')
  assert.equal(interpolate('/bugs?team={team}', {}), '/bugs?team={team}')
  assert.equal(interpolate('ไม่มีตัวแปร', { a: '1' }), 'ไม่มีตัวแปร')
})

test('interpolate ถือว่าค่าว่างเท่ากับไม่ได้กรอก', () => {
  assert.equal(interpolate('{team}', { team: '' }), '{team}')
})

test('interpolate แทนตัวแปรตัวเดิมได้หลายที่', () => {
  assert.equal(interpolate('{x}/{x}', { x: '7' }), '7/7')
})

test('hasUnresolved บอกได้ว่ายังเหลือ {var} ค้างอยู่', () => {
  assert.equal(hasUnresolved('a={a}'), true)
  assert.equal(hasUnresolved('a=1'), false)
  // เรียกซ้ำต้องได้ผลเดิม — regex เป็น global เลยต้องรีเซ็ต lastIndex
  assert.equal(hasUnresolved('a={a}'), true)
})

test('interpolateAll ตัด key ที่แทนค่าไม่ได้ทิ้ง', () => {
  const out = interpolateAll({ product_id: '{productId}', state: 'open' }, {})
  assert.deepEqual(out, { state: 'open' })
})

test('interpolateAll เก็บ key ที่แทนค่าได้ไว้', () => {
  const out = interpolateAll({ product_id: '{productId}', state: 'open' }, { productId: '16' })
  assert.deepEqual(out, { product_id: '16', state: 'open' })
})

test('interpolateDeep ลงไปถึง object และ array ซ้อน', () => {
  const out = interpolateDeep({ jql: 'project = {key}', list: ['{key}', 2] }, { key: 'TC' })
  assert.deepEqual(out, { jql: 'project = TC', list: ['TC', 2] })
})

// ── pick ───────────────────────────────────────────────────────

test('pick เดินตาม dot path ได้', () => {
  assert.equal(pick({ data: { items: [{ name: 'x' }] } }, 'data.items.0.name'), 'x')
})

test('pick คืนตัวมันเองเมื่อ path ว่าง', () => {
  const arr = [1, 2]
  assert.equal(pick(arr, ''), arr)
})

test('pick คืน undefined แทนที่จะ throw เมื่อหาไม่เจอ', () => {
  assert.equal(pick({ a: 1 }, 'b.c.d'), undefined)
  assert.equal(pick(null, 'a'), undefined)
  assert.equal(pick({ a: 1 }, 'a.b'), undefined)
  assert.equal(pick([{ a: 1 }], 'x'), undefined)
})

test('topLevelKeys คืน key ของ item ชิ้นแรกเมื่อเป็น array', () => {
  assert.deepEqual(topLevelKeys([{ id: 1, name: 'a' }]), ['id', 'name'])
  assert.deepEqual(topLevelKeys({ data: [] }), ['data'])
  assert.deepEqual(topLevelKeys('ข้อความ'), [])
})

// ── applyFilter ────────────────────────────────────────────────

const rows = [
  { uuid: 'a', team: { slug: 'core' }, tags: 'ui,bug' },
  { uuid: 'b', team: { slug: 'infra' }, tags: 'bug' },
  { uuid: 'c', team: null, tags: '' },
]

test('applyFilter ไม่กรองเมื่อไม่มี rule', () => {
  assert.equal(applyFilter(rows, undefined, {}).length, 3)
  assert.equal(applyFilter(rows, [], {}).length, 3)
})

test('applyFilter equals แทนค่าตัวแปรก่อนเทียบ', () => {
  const out = applyFilter(rows, [{ from: 'team.slug', equals: '{team}' }], { team: 'core' })
  assert.deepEqual(out.map(r => r.uuid), ['a'])
})

test('applyFilter ข้าม rule ที่ตัวแปรไม่ได้ถูกกรอก', () => {
  // required: false แล้วผู้ใช้ไม่กรอก → ต้องได้ครบ ไม่ใช่กรองจนเกลี้ยง
  const out = applyFilter(rows, [{ from: 'team.slug', equals: '{team}' }], {})
  assert.equal(out.length, 3)
})

test('applyFilter in / contains / exists', () => {
  assert.deepEqual(
    applyFilter(rows, [{ from: 'team.slug', in: ['core', 'infra'] }], {}).map(r => r.uuid),
    ['a', 'b'],
  )
  assert.deepEqual(
    applyFilter(rows, [{ from: 'tags', contains: 'UI' }], {}).map(r => r.uuid),
    ['a'],
  )
  assert.deepEqual(
    applyFilter(rows, [{ from: 'team', exists: false }], {}).map(r => r.uuid),
    ['c'],
  )
})

test('applyFilter หลาย rule ต้องผ่านทุกข้อ', () => {
  const out = applyFilter(
    rows,
    [{ from: 'team', exists: true }, { from: 'tags', contains: 'ui' }],
    {},
  )
  assert.deepEqual(out.map(r => r.uuid), ['a'])
})

// ── flattenFields ──────────────────────────────────────────────

test('flattenFields ไล่ field ซ้อนออกมาเป็น path แบบจุด', () => {
  const item = { id: 7, fields: { summary: 'หัวข้อ', status: { name: 'New' } } }
  const paths = flattenFields(item).map(f => f.path)
  assert.deepEqual(paths, ['id', 'fields.summary', 'fields.status.name'])
})

test('flattenFields เก็บ array เป็น path ของตัวเอง ไม่ไล่เข้าไปข้างใน', () => {
  // รายการแรกมี label ไม่ได้แปลว่ารายการอื่นมี เลยไม่เสนอ tags.0.label
  const found = flattenFields({ tags: [{ label: 'ui' }] })
  assert.deepEqual(found.map(f => f.path), ['tags'])
  assert.equal(found[0]?.kind, 'array')
})

test('flattenFields บอกชนิดและค่าตัวอย่างของแต่ละ field', () => {
  const byPath = new Map(flattenFields({ n: 3, s: 'ก', b: true, z: null }).map(f => [f.path, f]))
  assert.equal(byPath.get('n')?.kind, 'number')
  assert.equal(byPath.get('s')?.sample, 'ก')
  assert.equal(byPath.get('b')?.kind, 'boolean')
  assert.equal(byPath.get('z')?.kind, 'null')
})

test('flattenFields ย่อค่าที่ยาวเกินและไม่พังกับ input ที่ไม่ใช่ object', () => {
  const long = flattenFields({ text: 'ก'.repeat(200) })
  assert.equal(long[0]?.sample.endsWith('…'), true)
  assert.ok(long[0] !== undefined && long[0].sample.length <= 81)
  assert.deepEqual(flattenFields(null), [])
  assert.deepEqual(flattenFields('ไม่ใช่ object'), [])
  assert.deepEqual(flattenFields([1, 2]), [])
})

test('flattenFields หยุดที่ความลึกจำกัด ไม่วนไม่จบกับ object ซ้อนลึก', () => {
  let deep: Record<string, unknown> = { leaf: 'ก้นสุด' }
  for (let i = 0; i < 10; i++) deep = { nest: deep }
  // ไม่ throw และไม่ค้าง — จำนวน field ที่ได้ต้องน้อยกว่าความลึกจริง
  assert.ok(flattenFields(deep).length <= 1)
})

// ── distinctValues ─────────────────────────────────────────────

test('distinctValues นับค่าที่พบจริงและเรียงจากบ่อยสุด', () => {
  const items = [{ s: 'New' }, { s: 'Fixed' }, { s: 'New' }, { s: 'New' }]
  assert.deepEqual(distinctValues(items, 's'), [
    { value: 'New', count: 3 },
    { value: 'Fixed', count: 1 },
  ])
})

test('distinctValues ข้ามค่าว่าง null และ object', () => {
  const items = [{ s: 'New' }, { s: '' }, { s: null }, { s: { a: 1 } }, {}]
  assert.deepEqual(distinctValues(items, 's'), [{ value: 'New', count: 1 }])
})

test('distinctValues อ่าน path ซ้อนได้', () => {
  const items = [{ f: { st: 'A' } }, { f: { st: 'A' } }, { f: { st: 'B' } }]
  assert.deepEqual(distinctValues(items, 'f.st'), [
    { value: 'A', count: 2 },
    { value: 'B', count: 1 },
  ])
})
