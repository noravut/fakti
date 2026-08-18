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

/**
 * เดาชื่อ branch จาก defect ที่เลือก — ผู้ใช้แก้ได้ใน dialog
 * title ภาษาไทย slug ไม่ได้ เลยยึด key เป็นหลักแล้วต่อคำอังกฤษถ้ามี
 */
export function suggestBranch(defects: Defect[]): string {
  const keys = defects.slice(0, 3).map(d => d.key.toLowerCase()).join('-')
  const words = (defects[0]?.title.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(w => w.length > 2)
    .slice(0, 3)
    .join('-')
  return words ? `fix/${keys}-${words}` : `fix/${keys}`
}
