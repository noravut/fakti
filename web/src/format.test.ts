import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Defect } from '@shared/types'
import { suggestBranch } from './format'

const d = (key: string, title: string): Defect => ({
  id: key, key, title, description: '', severity: 'high', status: 'New', createdAt: '',
})

test('defect ตัวเดียว: รหัส + คำสำคัญจาก title', () => {
  const out = suggestBranch([d('DEF-3710', 'ไม่สามารถเปลี่ยนสกุลเงินใน Downgrade plan ได้')])
  assert.equal(out, 'fix/def-3710-downgrade-plan')
})

test('หลายตัว: รหัสตัวแรก + จำนวนที่เหลือ + คำร่วม', () => {
  const out = suggestBranch([
    d('DEF-3710', 'ไม่สามารถเปลี่ยนสกุลเงินใน Downgrade plan'),
    d('DEF-3711', 'ไม่สามารถเปลี่ยนสกุลเงินเมื่อ Upgrade plan'),
    d('DEF-3712', 'ไม่สามารถเปลี่ยน currency ตอน Downgrade plan'),
  ])
  // "plan" อยู่ครบ 3 ตัว "downgrade" อยู่ 2 ตัว → เป็นคำร่วม
  assert.equal(out, 'fix/def-3710-plus2-plan-downgrade')
})

test('ไม่เอารหัสของทุกตัวมาต่อกันแล้ว', () => {
  const out = suggestBranch([
    d('DEF-3712', 'a'), d('DEF-3711', 'b'), d('DEF-3710', 'c'),
    d('DEF-3709', 'd'), d('DEF-3708', 'e'),
  ])
  assert.equal(out, 'fix/def-3712-plus4')
  assert.equal(out.includes('def-3711'), false)
})

test('ยาวไม่เกิน 50 ตัวอักษร และตัดทั้งคำ', () => {
  const long = 'configuration management database synchronization scheduler'
  const out = suggestBranch([d('DEF-1234', long)])
  assert.ok(out.length <= 50, `${out} ยาว ${out.length}`)
  // ตัดทั้งคำ ไม่มีเศษคำค้าง
  for (const part of out.replace('fix/', '').split('-')) {
    assert.ok(part.length > 0)
  }
  assert.equal(out, 'fix/def-1234-configuration-management-database')
})

test('stop word อังกฤษถูกตัดออก', () => {
  const out = suggestBranch([d('DEF-1', 'The export will not have any data')])
  assert.equal(out, 'fix/def-1-export-data')
})

test('title ที่เป็นภาษาไทยล้วน เหลือแค่รหัส', () => {
  // branch รับเฉพาะ ASCII คำไทยจึงไม่ไปโผล่ใน slug
  assert.equal(suggestBranch([d('DEF-9', 'ปุ่มบันทึกกดแล้วไม่ทำงาน')]), 'fix/def-9')
})

test('คำสั้นกว่า 3 ตัวอักษรถูกข้าม', () => {
  assert.equal(suggestBranch([d('DEF-2', 'a ui bug on tab')]), 'fix/def-2-bug-tab')
})

test('ไม่มี defect เลยก็ไม่พัง', () => {
  assert.equal(suggestBranch([]), 'fix/defects')
})
