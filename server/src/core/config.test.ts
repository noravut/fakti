import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import type { Workspace } from '@shared/types'

// PAT_DIR ถูกคำนวณตอนโหลดโมดูล ต้องตั้ง HOME ให้เสร็จก่อน import
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fakti-test-'))
fs.mkdirSync(path.join(home, '.pat'), { recursive: true })
process.env.HOME = home

const { isProtectedBranch, protectedBranchesFor } = require('./config') as typeof import('./config')

const ws = (patch: Partial<Workspace> = {}): Workspace => ({
  id: 'w', name: 'w', path: '/tmp', baseBranch: 'main', color: 'blue', ...patch,
})

test('isProtectedBranch เทียบแบบไม่สนตัวพิมพ์', () => {
  assert.equal(isProtectedBranch('main', ['main', 'develop']), true)
  assert.equal(isProtectedBranch('MAIN', ['main']), true)
  assert.equal(isProtectedBranch('feature/x', ['main']), false)
})

test('branch งานที่ตั้งเป็น base ต้องไม่ถูกนับว่า protected', () => {
  // เคสจริงที่เจอ: baseBranch = noravut/saas-defects แต่ไม่ควรถูกบล็อก
  const list = protectedBranchesFor(ws({ baseBranch: 'noravut/saas-defects' }))
  assert.equal(isProtectedBranch('noravut/saas-defects', list), false)
  assert.equal(isProtectedBranch('main', list), true)
})

test('ค่าตั้งต้นครอบ branch หลักที่ต้องกัน', () => {
  const list = protectedBranchesFor(undefined)
  for (const name of ['main', 'master', 'develop', 'trunk', 'release']) {
    assert.equal(isProtectedBranch(name, list), true, `${name} ต้องถูกกัน`)
  }
})

test('workspace ตั้งทับค่าตั้งต้นได้', () => {
  const list = protectedBranchesFor(ws({ protectedBranches: ['prod'] }))
  assert.deepEqual(list, ['prod'])
  assert.equal(isProtectedBranch('main', list), false)
  assert.equal(isProtectedBranch('prod', list), true)
})

test('ตั้งเป็น array ว่าง = ไม่กันอะไรเลย', () => {
  const list = protectedBranchesFor(ws({ protectedBranches: [] }))
  assert.deepEqual(list, [])
  assert.equal(isProtectedBranch('main', list), false)
})

test('ชื่อว่างในรายการถูกตัดทิ้ง', () => {
  assert.deepEqual(protectedBranchesFor(ws({ protectedBranches: ['main', ' ', ''] })), ['main'])
})
