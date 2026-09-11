import type { Defect, Requirement, Severity } from '@shared/types'

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''

  const minutes = Math.round((Date.now() - then) / 60000)
  if (minutes < 1) return 'เมื่อครู่'
  if (minutes < 60) return `${minutes} นาทีก่อน`

  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ชั่วโมงก่อน`

  const days = Math.round(hours / 24)
  if (days < 30) return `${days} วันก่อน`
  return new Date(then).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

/** โทน Tag ของแต่ละระดับ — สีจริงอยู่ใน token ไม่ hardcode hex ที่นี่ */
export const SEVERITY_TONE: Record<Severity, 'danger' | 'warn' | 'neutral' | 'faint'> = {
  critical: 'danger',
  high: 'warn',
  medium: 'neutral',
  low: 'faint',
}

/** คำที่ไม่ช่วยแยกแยะ ตัดออกก่อนทำ slug */
const STOP_WORDS = new Set([
  // อังกฤษ
  'the', 'and', 'or', 'not', 'but', 'for', 'with', 'from', 'this', 'that', 'then',
  'are', 'was', 'were', 'has', 'have', 'had', 'can', 'cannot', 'will', 'would',
  'should', 'could', 'does', 'did', 'you', 'all', 'any', 'its', 'into', 'when',
  // ไทย
  'ไม่', 'ไม่สามารถ', 'ได้', 'แล้ว', 'ที่', 'ใน', 'และ', 'หรือ', 'เป็น', 'ของ',
  'ให้', 'มี', 'จะ', 'ต้อง', 'กับ', 'ยัง', 'ก็', 'เมื่อ', 'ตอน', 'การ', 'ควร',
  'แต่', 'จาก', 'ถึง', 'ด้วย', 'อยู่', 'นี้', 'นั้น', 'ระบบ',
])

/** branch ยาวกว่านี้พิมพ์ต่อ อ่าน และ autocomplete ลำบาก */
const MAX_BRANCH_LENGTH = 50

/**
 * ตัด title เป็นคำ แล้วเอา stop word ออกทั้งไทยและอังกฤษ
 * เหลือเฉพาะคำ ASCII เพราะ git branch ในระบบนี้รับแค่ a-z 0-9 . _ / -
 * (คำไทยเลยไม่มีทางไปโผล่ใน slug แต่ต้องตัด stop word ไทยก่อน
 *  ไม่งั้นตอนหาคำร่วมของหลาย defect จะได้แต่คำที่ไม่มีความหมาย)
 */
function keywords(title: string): string[] {
  return (title.toLowerCase().match(/[a-z0-9]+|[฀-๿]+/g) ?? [])
    .filter(w => !STOP_WORDS.has(w))
    .filter(w => /^[a-z0-9]+$/.test(w) && w.length > 2)
}

/** ตัดให้ไม่เกินความยาวที่กำหนด โดยตัดทั้งคำ ไม่ตัดกลางคำ */
function fit(prefix: string, words: string[]): string {
  let out = prefix
  for (const w of words) {
    const next = `${out}-${w}`
    if (next.length > MAX_BRANCH_LENGTH) break
    out = next
  }
  return out
}

/**
 * เดาชื่อ branch จาก defect ที่เลือก — ผู้ใช้แก้ได้ใน dialog
 * ตัวเดียว  → fix/def-3710-currency-downgrade
 * หลายตัว   → fix/def-3710-plus2-currency  (รหัสตัวแรก + จำนวนที่เหลือ + คำร่วม)
 */
export function suggestBranch(defects: Defect[]): string {
  const first = defects[0]
  if (!first) return 'fix/defects'

  const key = first.key.toLowerCase()
  if (defects.length === 1) return fit(`fix/${key}`, keywords(first.title).slice(0, 3))

  // คำที่โผล่ในหลาย defect บอกธีมร่วมได้ดีกว่าคำจาก title แรกอย่างเดียว
  const seen = new Map<string, number>()
  for (const d of defects) {
    for (const w of new Set(keywords(d.title))) seen.set(w, (seen.get(w) ?? 0) + 1)
  }
  const shared = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)

  const words = shared.length > 0 ? shared : keywords(first.title)
  return fit(`fix/${key}-plus${defects.length - 1}`, words.slice(0, 2))
}

/**
 * เดาชื่อ branch ของ feature จากชื่อที่พิมพ์ — feat/export-csv-report
 * ชื่อไทยล้วนไม่มีคำ ASCII เหลือ → feat/feature ให้ผู้ใช้แก้เอาเอง
 */
export function suggestFeatureBranch(title: string): string {
  const [first, ...rest] = keywords(title)
  return first ? fit(`feat/${first}`, rest.slice(0, 3)) : 'feat/feature'
}

/**
 * แปลงข้อความที่พิมพ์บรรทัดละข้อเป็น requirement พร้อมรหัส REQ-n ตามลำดับ
 * ตัด bullet หรือเลขข้อที่คนมักพิมพ์ติดมา (- * • 1. 2)) จะได้ไม่ซ้อนกับรหัสที่ตั้งให้
 */
export function parseRequirements(text: string): Requirement[] {
  return splitItems(text).map((t, i) => ({ key: `REQ-${i + 1}`, text: t }))
}

/** ข้อความบรรทัดละข้อ → รายการ ตัด bullet/เลขข้อ ข้ามบรรทัดว่าง */
export function splitItems(text: string): string[] {
  return text
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}

/**
 * คำที่ทำให้ requirement ตรวจไม่ได้ ตามแนว ISO 29148 (subjective, comparative, open-ended)
 * ตรงกับ prompt เริ่มงานที่ห้าม agent ใช้คำพวกนี้ใน REQ ที่เขียนใหม่
 */
const VAGUE_WORDS = /เร็ว|ง่าย|เหมาะสม|ถูกต้อง|ดีขึ้น|ครบถ้วน|สะดวก|สวย|เสถียร|\b(fast|easy|proper(ly)?|correct(ly)?|better|nice|robust)\b/i
/** และ/หรือ กลางประโยคมักแปลว่ามี 2 พฤติกรรมในข้อเดียว */
const TWO_BEHAVIOURS = /\S\s+(และ|หรือ|and|or)\s+\S/i

/**
 * คำใบ้ระหว่างพิมพ์ requirement — เตือน ไม่บล็อก
 * คืน null เมื่อไม่มีอะไรน่าติง
 */
export function requirementHint(text: string): string | null {
  if (VAGUE_WORDS.test(text)) return 'มีคำที่วัดไม่ได้ ลองใส่ค่าหรือตัวอย่างที่เห็นได้'
  if (TWO_BEHAVIOURS.test(text)) return 'อาจเป็น 2 ข้อ ถ้าใช่ให้แยกบรรทัด'
  return null
}

/** แปลงข้อความคั่นจุลภาคเป็นรายชื่อ branch — ใช้ทั้งค่าตั้งต้นและค่าเฉพาะ repo */
export function parseBranchList(text: string): string[] {
  return [...new Set(text.split(',').map(s => s.trim()).filter(Boolean))]
}
