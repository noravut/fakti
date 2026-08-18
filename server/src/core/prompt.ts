import fs from 'node:fs'
import path from 'node:path'
import type { Defect } from '@shared/types'

export const TASK_FILE = '.pat-task.md'

export function buildPrompt(defects: Defect[]): string {
  const blocks = defects.map(d => `
## ${d.key}: ${d.title}

${d.description}
`.trim()).join('\n\n')

  const isMulti = defects.length > 1

  return `${blocks}

---

ช่วยแก้ ${isMulti ? `defect ${defects.length} รายการนี้` : 'defect นี้'} ให้หน่อย

- หาต้นเหตุก่อน อย่าเพิ่งแก้อาการ ถ้าไม่แน่ใจว่าอยู่ตรงไหนให้ค้นในโค้ดก่อน
- เขียน test ที่ครอบเคสนี้ด้วยถ้า repo มี test อยู่แล้ว
- แก้ให้น้อยที่สุดเท่าที่จำเป็น อย่า refactor ส่วนอื่นแถมมา
- ห้ามเพิ่ม dependency ใหม่
${isMulti ? '- commit แยกทีละรายการ ใส่รหัส defect ใน commit message ด้วย\n' : ''}- ห้าม push

ถ้าข้อมูลไม่พอที่จะแก้ ให้บอกว่าขาดอะไรแล้วหยุด อย่าเดา`
}

/**
 * เขียน prompt ลงไฟล์แล้วส่งแค่บรรทัดเดียวเข้า pty
 *
 * ไม่ส่ง prompt หลายบรรทัดเข้าไปตรงๆ เพราะ Claude Code TUI ตีความ newline
 * เป็นการกด Enter — prompt จะถูกตัดเป็นหลายข้อความและ agent เริ่มทำงาน
 * ตั้งแต่บรรทัดแรกที่ยังไม่มีบริบท ส่งชื่อไฟล์ไปบรรทัดเดียวปลอดภัยกว่า
 */
export function writeTaskFile(repoPath: string, content: string): string {
  fs.writeFileSync(path.join(repoPath, TASK_FILE), `${content}\n`, 'utf8')
  addToGitExclude(repoPath)
  return `อ่าน ${TASK_FILE} แล้วทำตามนั้น`
}

function addToGitExclude(repoPath: string): void {
  const excludeFile = path.join(repoPath, '.git', 'info', 'exclude')
  try {
    fs.mkdirSync(path.dirname(excludeFile), { recursive: true })
    const existing = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, 'utf8') : ''
    if (existing.split('\n').some(l => l.trim() === TASK_FILE)) return
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
    fs.appendFileSync(excludeFile, `${prefix}${TASK_FILE}\n`, 'utf8')
  } catch {
    // exclude ไม่ได้ก็ไม่ถึงกับพัง แค่ไฟล์โผล่ใน git status
  }
}
