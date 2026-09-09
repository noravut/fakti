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

// ── feature ────────────────────────────────────────────────────

import type { FeatureSpec } from '@shared/types'
import { buildFeaturePrompt, buildFeatureQaPrompt } from './prompt'

const feature: FeatureSpec = {
  title: 'Export CSV',
  context: 'หน้า /reports',
  requirements: [{ key: 'REQ-1', text: 'กด Export ได้ไฟล์' }, { key: 'REQ-2', text: 'หัวคอลัมน์เป็นไทย' }],
}

test('buildFeaturePrompt ใส่ชื่อ ข้อมูลประกอบ และทุก REQ พร้อมกติกา commit ตามข้อ', () => {
  const out = buildFeaturePrompt(feature)
  assert.match(out, /^# Export CSV/)
  assert.match(out, /หน้า \/reports/)
  assert.match(out, /- REQ-1: กด Export ได้ไฟล์/)
  assert.match(out, /- REQ-2: หัวคอลัมน์เป็นไทย/)
  assert.match(out, /REQ-n ใน commit message/)
  // process 3 ขั้น: spec ก่อนโค้ด → ลงมือ → ตรวจเอง และด่านหยุดเมื่อมีคำถามที่ติด
  assert.match(out, /# ขั้น 1 - ทำความเข้าใจและเขียน spec ก่อนลงมือ/)
  assert.match(out, /ไม่ทำ\s+สิ่งที่คนอาจคิดว่าอยู่ในงานนี้/)
  assert.match(out, /กำหนดให้ <สภาพตั้งต้น> · เมื่อ <ทำอะไร> · แล้ว <เห็นอะไร>/)
  assert.match(out, /หยุดรอคำตอบ อย่าเริ่มเขียนโค้ด ถ้ามีอย่างใดอย่างหนึ่งต่อไปนี้/)
  assert.match(out, /# ขั้น 2 - ลงมือ/)
  assert.match(out, /# ขั้น 3 - ตรวจเองก่อนส่ง/)
  assert.ok(out.indexOf('# ขั้น 1') < out.indexOf('# ขั้น 2') && out.indexOf('# ขั้น 2') < out.indexOf('# ขั้น 3'))
})

test('buildFeaturePrompt สั่งหาช่องโหว่ของ REQ ทั้งชุด และหยุดเฉพาะชนิดที่บล็อก', () => {
  const out = buildFeaturePrompt(feature)
  assert.match(out, /ตรวจ REQ ทั้งชุดพร้อมกัน ไม่ใช่ทีละข้อ/)
  for (const kind of ['ขัดกันเอง', 'ขาดคู่', 'ขาดกฎ', 'ชนของเดิม']) assert.ok(out.includes(kind), kind)
  assert.match(out, /ทุกข้อเขียนเป็นข้อเสนอที่ตอบรับหรือไม่รับได้ทันที/)
  // ด่านหยุด: บล็อกแค่ 2 ชนิด ที่เหลือทำต่อได้ ไม่งั้นจะถามทุกครั้งจนช้า
  assert.match(out, /มีคำถามที่ติด · มีช่องโหว่แบบ "ขัดกันเอง" · มีช่องโหว่แบบ "ขาดกฎ"/)
  assert.match(out, /ช่องโหว่แบบ "ขาดคู่" กับ "ชนของเดิม" ไม่ต้องรอ/)
  // หัวข้อนี้ต้องมาก่อนคำถามที่ติด เพราะช่องโหว่บางชนิดกลายเป็นคำถามที่ติด
  assert.ok(out.indexOf('ช่องโหว่ของ REQ') < out.indexOf('คำถามที่ติด'))
})

test('buildFeaturePrompt จำกัดคำถามที่บล็อกไม่เกิน 3 ข้อ และสั่งเขียน spec ลงไฟล์', () => {
  const out = buildFeaturePrompt(feature)
  assert.match(out, /ห้ามถามเกิน 3 ข้อต่อรอบ/)
  assert.match(out, /ยกมาถามเฉพาะ 3 ข้อที่บล็อกหนักที่สุด/)
  assert.match(out, /ยังไม่ยืนยัน/)
  assert.match(out, /เขียนสรุปทั้งขั้นนี้ลงไฟล์ `\.pat-spec\.md`/)
})

test('buildFeatureQaPrompt ให้ถอยมามองทั้งงาน และรายงานหัวข้อ ยังขาดอะไร', () => {
  const out = buildFeatureQaPrompt(feature, [])
  assert.match(out, /ต่อให้ทุก REQ ครบหมดแล้ว ยังมีอะไรที่ทำให้ใช้งานจริงไม่ได้ไหม/)
  assert.match(out, /6\. ยังขาดอะไร/)
  assert.match(out, /ต้องมีครบ 6 หัวข้อ/)
  assert.match(out, /หัวข้อ 4, 5, 6 ห้ามเว้นว่าง/)
  assert.match(out, /เขียนรายงานนี้ลงไฟล์ `\.pat-qa-report\.md`/)
  // ของ defect ต้องไม่ถูกลาก 6 หัวข้อกับไฟล์รายงานไปด้วย
  const defectQa = buildQaPrompt([], [])
  assert.match(defectQa, /ต้องมีครบ 5 หัวข้อ/)
  assert.doesNotMatch(defectQa, /pat-qa-report/)
})

test('buildFeatureQaPrompt ให้ QA ใช้ spec ของ DEV เป็นฐานแต่ทวนกับคำเดิมของ REQ', () => {
  const out = buildFeatureQaPrompt(feature, [])
  assert.match(out, /ต้องทวนกับคำเดิมของ REQ ข้างบนทุกข้อ/)
})

test('buildFeaturePrompt ใส่หัวข้อ ไม่ทำ ที่ผู้สั่งงานระบุ และ QA เห็นเป็นบรรทัด ไม่ทำ: ในหัว', () => {
  const f = { ...feature, nonGoals: ['ห้ามเปลี่ยนรูปแบบไฟล์เดิม'] }
  assert.match(buildFeaturePrompt(f), /## ไม่ทำ \/ ห้ามเปลี่ยน \(ผู้สั่งงานระบุมา\)\n\n- ห้ามเปลี่ยนรูปแบบไฟล์เดิม/)
  assert.match(buildFeatureQaPrompt(f, []), /REQ-2: หัวคอลัมน์เป็นไทย\n\s+ไม่ทำ: ห้ามเปลี่ยนรูปแบบไฟล์เดิม/)
  assert.doesNotMatch(buildFeaturePrompt(feature), /ผู้สั่งงานระบุมา/)
})

test('buildFeaturePrompt ไม่มี context ก็ไม่ทิ้งบรรทัดว่างแปลกๆ', () => {
  const out = buildFeaturePrompt({ ...feature, context: undefined })
  assert.match(out, /^# Export CSV\n\n## สิ่งที่ต้องเป็นเมื่อทำเสร็จ/)
})

test('buildFeatureQaPrompt เติมชื่อ + ทุก REQ + ไฟล์ และใช้ขั้นตัดสินรายข้อ ไม่ใช่ของ defect', () => {
  const out = buildFeatureQaPrompt(feature, ['src/a.ts'])
  assert.match(out, /งานที่กำลังทำ:\s+Export CSV\n\s+REQ-1: กด Export ได้ไฟล์\n\s+REQ-2: หัวคอลัมน์เป็นไทย/)
  assert.match(out, /src\/a\.ts/)
  assert.match(out, /## ขั้น 1 - จับคู่ทุก REQ กับ test case/)
  assert.match(out, /## ขั้น 5 - ตัดสินรายข้อ/)
  assert.match(out, /ตาราง REQ/)
  assert.doesNotMatch(out, /ร้ายแรงแค่ไหน/)
  // ส่วนที่ใช้ร่วมกับ QA Gate ยังอยู่ครบ
  assert.match(out, /## บทบาท/)
  assert.match(out, /## ขั้น 2 - ทดสอบจริง/)
  assert.match(out, /# รอบ DEV/)
  assert.match(out, /# รายงานสรุปตอนจบ/)
})
