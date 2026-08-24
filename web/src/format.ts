import type { Defect, Severity } from '@shared/types'

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

export const SEVERITY_STYLE: Record<Severity, { color: string; background: string }> = {
  critical: { color: '#A32E2E', background: '#A32E2E1F' },
  high: { color: '#A32E2E', background: '#A32E2E12' },
  medium: { color: '#A66A0F', background: '#A66A0F12' },
  low: { color: '#8E939C', background: '#8E939C1F' },
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

/** แปลงข้อความคั่นจุลภาคเป็นรายชื่อ branch — ใช้ทั้งค่าตั้งต้นและค่าเฉพาะ repo */
export function parseBranchList(text: string): string[] {
  return [...new Set(text.split(',').map(s => s.trim()).filter(Boolean))]
}
