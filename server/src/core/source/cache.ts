import fs from 'node:fs'
import path from 'node:path'
import type { Defect } from '@shared/types'
import { PAT_DIR } from '../config'

const CACHE_DIR = path.join(PAT_DIR, 'cache')

export interface CacheEntry {
  fetchedAt: string
  defects: Defect[]
  filtered?: { total: number; kept: number }
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, '_')

/**
 * ไฟล์ละชุด vars — repo คนละตัวใช้ค่า vars คนละอัน ปนกันแล้วจะได้รายการของ product อื่น
 * netka + productId=16 → netka-16.json
 */
function fileFor(sourceId: string, vars: Record<string, string>): string {
  const parts = Object.entries(vars)
    .filter(([, v]) => v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => safe(v))
  return path.join(CACHE_DIR, `${[safe(sourceId), ...parts].join('-')}.json`)
}

export function readCache(sourceId: string, vars: Record<string, string>): CacheEntry | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(fileFor(sourceId, vars), 'utf8')) as CacheEntry
    return Array.isArray(parsed?.defects) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function writeCache(
  sourceId: string,
  vars: Record<string, string>,
  entry: CacheEntry,
): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    const target = fileFor(sourceId, vars)
    const tmp = `${target}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, target)
  } catch {
    // cache เขียนไม่ได้ไม่ใช่เรื่องคอขาดบาดตาย ทำงานต่อได้
  }
}
