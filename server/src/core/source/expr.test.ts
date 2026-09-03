import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyFilter, hasUnresolved, interpolate, interpolateAll, interpolateDeep, pick, topLevelKeys,
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
