import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Defect } from '@shared/types'
import { buildQaPrompt } from './prompt'

const defect = (key: string, title: string): Defect => ({
  id: key, key, title, description: '', severity: 'medium', status: 'open', createdAt: '',
})

test('buildQaPrompt เติม defect กับไฟล์ที่เปลี่ยนลงหัว "เติมก่อนใช้"', () => {
  const out = buildQaPrompt(
    [defect('TC-1', 'ปุ่มหาย'), defect('TC-2', 'จอขาว')],
    ['src/a.ts', 'src/b.ts'],
  )
  assert.match(out, /TC-1: ปุ่มหาย/)
  assert.match(out, /TC-2: จอขาว/)
  assert.match(out, /src\/a\.ts/)
  assert.match(out, /src\/b\.ts/)
  // ตัวเนื้อ template ต้องตามมาครบ
  assert.match(out, /## บทบาท/)
  assert.match(out, /# รายงานสรุปตอนจบ/)
})

test('buildQaPrompt ไม่มีข้อมูลก็ยังบอกให้ agent เติมเอง ไม่ปล่อยว่าง', () => {
  const out = buildQaPrompt([], [])
  assert.match(out, /งานที่กำลังทำ:\s+\(ยังไม่มีข้อมูล/)
  assert.match(out, /ไฟล์ที่แก้:\s+\(git ยังไม่เห็นไฟล์เปลี่ยน/)
})

test('buildQaPrompt ตัดรายชื่อไฟล์ที่ยาวเกินแล้วบอกจำนวนที่เหลือ', () => {
  const files = Array.from({ length: 45 }, (_, i) => `f${i}.ts`)
  const out = buildQaPrompt([], files)
  assert.match(out, /f39\.ts/)
  assert.doesNotMatch(out, /f40\.ts/)
  assert.match(out, /และอีก 5 ไฟล์/)
})
