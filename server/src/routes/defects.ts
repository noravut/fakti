import { Hono } from 'hono'
import type { Defect } from '@shared/types'
import mock from '../mock/defects.json'

// v1 อ่านจาก mock ยังไม่ต่อ tracker จริง
const defects = mock as Defect[]

export function allDefects(): Defect[] {
  return defects
}

export const defectRoutes = new Hono()

defectRoutes.get('/', c => c.json(defects))
