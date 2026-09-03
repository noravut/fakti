import type { CheckResult, FieldMap, SourceConfig } from '@shared/types'
import { SourceError, buildUrl, callSource } from './client'
import { pick, topLevelKeys } from './expr'
import { mapDefect } from './map'

/** field ที่ map ประกาศไว้จริง (keyPrefix ไม่ใช่ field ที่ต้องไปหาใน item) */
const MAPPED_FIELDS: (keyof FieldMap)[] =
  ['id', 'key', 'title', 'description', 'severity', 'status', 'reporter', 'createdAt']

/**
 * ตรวจทีละขั้นแล้วบอกว่าพังตรงไหน ไม่ใช่ตอบแค่ ok/fail
 * ขั้นที่สำคัญที่สุดคือ shape กับ map — สองอันนั้นแสดง key ที่มีจริงให้เลือก
 * เปลี่ยนการตั้งค่าจาก "เดาแล้วลอง" เป็น "เห็นแล้วเลือก"
 */
export async function checkSource(
  src: SourceConfig,
  vars: Record<string, string>,
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const host = safeHost(src, vars)

  let raw: Awaited<ReturnType<typeof callSource>>
  try {
    raw = await callSource(src, src.list, vars)
  } catch (err) {
    if (!(err instanceof SourceError)) {
      results.push({ stage: 'resolve', ok: false, detail: String(err) })
      return results
    }
    // ต่อ TCP ติดแล้วถึงจะเจอ error ใบรับรอง — ขั้น resolve ถือว่าผ่าน
    if (err.stage === 'tls') {
      results.push({ stage: 'resolve', ok: true, detail: host })
    }
    results.push({ stage: err.stage, ok: false, detail: err.message, fix: err.fix })
    return results
  }

  results.push({ stage: 'resolve', ok: true, detail: `${host} · ${raw.ms} ms` })
  results.push(tlsResult(src, raw.url))

  // 401/403 เป็นเรื่องของขั้น auth ไม่ใช่ขั้น http
  const isAuthStatus = raw.status === 401 || raw.status === 403
  if (raw.status >= 400 && !isAuthStatus) {
    results.push({
      stage: 'http',
      ok: false,
      detail: `${raw.status} จาก ${raw.url}`,
      fix: raw.status === 404 ? 'ตรวจ path ใน sources.json — URL ที่ยิงไปคือที่แสดงด้านบน' : undefined,
      sample: raw.body.slice(0, 200),
    })
    return results
  }
  results.push({ stage: 'http', ok: true, detail: String(raw.status) })

  if (isAuthStatus) {
    results.push({
      stage: 'auth',
      ok: false,
      detail: `ไม่มีสิทธิ์ (${raw.status})`,
      fix: 'ตรวจ token ใน ~/.pat/secrets.json',
    })
    return results
  }
  results.push({ stage: 'auth', ok: true, detail: src.auth && src.auth.type !== 'none' ? 'ผ่าน' : 'ไม่ต้องยืนยันตัวตน' })

  let parsed: unknown
  try {
    parsed = JSON.parse(raw.body)
  } catch {
    results.push({
      stage: 'parse',
      ok: false,
      detail: 'ตอบกลับมาไม่ใช่ JSON',
      fix: 'ตรวจว่า path ชี้ไป endpoint ที่คืน JSON จริง',
      sample: raw.body.slice(0, 200),
    })
    return results
  }
  results.push({ stage: 'parse', ok: true, detail: 'JSON ถูกต้อง' })

  const items = pick(parsed, src.itemsPath ?? '')
  if (!Array.isArray(items)) {
    results.push({
      stage: 'shape',
      ok: false,
      detail: src.itemsPath
        ? `หา array ไม่เจอที่ itemsPath "${src.itemsPath}"`
        : 'response ไม่ใช่ array — ต้องระบุ itemsPath',
      fix: 'เลือก key ที่เป็น array จากรายการด้านล่างมาใส่ itemsPath',
      availableKeys: topLevelKeys(parsed),
      sample: parsed,
    })
    return results
  }
  results.push({ stage: 'shape', ok: true, detail: `พบ array ${items.length} รายการ` })

  const first = items[0]
  if (first === undefined) {
    results.push({
      stage: 'map',
      ok: true,
      detail: 'ไม่มีรายการให้ตรวจ mapping — ยังบอกไม่ได้ว่า map ถูกไหม',
    })
    return results
  }

  const declared = MAPPED_FIELDS.filter(f => src.map[f])
  const { defect, missing, missingContext } = mapDefect(src, first, vars)
  const contextTotal = src.context?.length ?? 0

  // หลาย tracker ไม่ใส่ description มากับ list — ถ้ามี detail ไว้ตามเก็บทีหลัง
  // อันนี้คือพฤติกรรมที่ตั้งใจ ไม่ใช่ mapping พัง
  const deferred: string[] = src.detail ? missing.filter(f => f === 'description') : []
  const broken = missing.filter(f => !deferred.includes(f))

  const parts = [`พบ ${declared.length - missing.length} จาก ${declared.length}`]
  if (broken.length) parts.push(`ไม่พบ ${broken.join(', ')}`)
  if (deferred.length) parts.push(`${deferred.join(', ')} ดึงจาก detail ตอนเปิดดู`)
  if (contextTotal) parts.push(`context ${contextTotal - missingContext.length} จาก ${contextTotal}`)

  results.push({
    stage: 'map',
    ok: broken.length === 0 && missingContext.length === 0,
    detail: parts.join(' · '),
    fix: broken.length ? 'เลือก key ที่ถูกต้องจากรายการด้านล่างมาใส่ใน map' : undefined,
    availableKeys: topLevelKeys(first),
    preview: defect,
    sample: first,
  })

  return results
}

function tlsResult(src: SourceConfig, url: string): CheckResult {
  if (!url.startsWith('https:')) {
    return { stage: 'tls', ok: true, detail: 'ไม่ได้ใช้ HTTPS' }
  }
  return src.insecureTLS
    ? { stage: 'tls', ok: true, detail: 'ข้ามการตรวจสอบ (ตั้งค่าไว้)' }
    : { stage: 'tls', ok: true, detail: 'ใบรับรองผ่าน' }
}

function safeHost(src: SourceConfig, vars: Record<string, string>): string {
  try {
    return buildUrl(src, src.list, vars).host
  } catch {
    return src.baseUrl
  }
}
