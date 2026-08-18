// type ที่ใช้ร่วมกันสองฝั่ง — import ผ่าน path alias `@shared/types`
// อะไรที่เป็น API contract ต้องอยู่ไฟล์นี้ ห้ามประกาศซ้ำฝั่งใดฝั่งหนึ่ง

export type WorkspaceColor =
  | 'blue' | 'purple' | 'pine' | 'amber' | 'rose' | 'slate'

/** ค่าสีจริงของแต่ละ workspace color — ตรงกับ swatch ใน design doc 1a */
export const WORKSPACE_COLOR_HEX: Record<WorkspaceColor, string> = {
  blue: '#3B6CB0',
  purple: '#6B4FA8',
  pine: '#1F5F52',
  amber: '#A66A0F',
  rose: '#A3455E',
  slate: '#4A6572',
}

export const WORKSPACE_COLORS = Object.keys(WORKSPACE_COLOR_HEX) as WorkspaceColor[]

export interface Workspace {
  id: string              // slug เช่น "timecraft"
  name: string
  path: string            // absolute path
  baseBranch: string      // "main"
  color: WorkspaceColor
}

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface Defect {
  id: string
  key: string             // "TC-1042"
  title: string
  description: string
  severity: Severity
  status: string
  reporter?: string
  createdAt: string
  url?: string
  // ไม่มี field บอก repo — ผู้ใช้ต้องเลือกเอง
}

export type SessionState =
  | 'working'      // agent กำลังทำงาน
  | 'waiting'      // agent ถามแล้วรอคนตอบ
  | 'idle'         // ว่าง รอคำสั่ง
  | 'closed'

export interface Session {
  id: string
  workspaceId: string
  branch: string
  baseCommit: string
  defectIds: string[]
  defects: Defect[]        // snapshot ตอนสร้าง
  state: SessionState
  createdAt: string
  lastActivityAt: string
  closedAt?: string
  /**
   * pat เป็นคนสร้าง branch นี้เองหรือเปล่า
   * ถ้า false (dirtyStrategy = 'keep' → ทำต่อบน branch เดิมของผู้ใช้)
   * ห้ามลบ branch ตอน discard เด็ดขาด
   */
  createdBranch: boolean
}

export interface GitStatus {
  branch: string
  isDirty: boolean
  dirtyCount: number
  ahead: number
  behind: number
}

export interface DiffStat {
  files: { path: string; added: number; removed: number }[]
  totalAdded: number
  totalRemoved: number
  commits: { hash: string; subject: string; fileCount: number }[]
}

// ── API payload ────────────────────────────────────────────────

export interface BootstrapResponse {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  sessions: Session[]
  needsSetup: boolean
  /** ข้อความเตือนตอนอ่าน config ไม่ผ่าน — แสดงในหน้าเว็บ ไม่ crash */
  warnings: string[]
}

export interface ValidateResult {
  ok: boolean
  remote?: string
  branches?: string[]
  currentBranch?: string
  error?: string
}

export type DirtyStrategy = 'stash' | 'keep'

export interface CreateSessionBody {
  workspaceId: string
  defectIds: string[]
  branch: string
  dirtyStrategy?: DirtyStrategy
}

/** 409 ตอน working tree สกปรกและ client ยังไม่ได้เลือกทาง */
export interface DirtyConflict {
  error: 'dirty'
  dirtyCount: number
  branch: string
}

export interface Settings {
  activeWorkspaceId: string | null
  port: number
}

// ── WebSocket protocol ─────────────────────────────────────────

export type ClientMessage =
  | { type: 'input'; data: string }
  | { type: 'resize'; cols: number; rows: number }

export type ServerMessage =
  | { type: 'output'; data: string }
  | { type: 'state'; state: SessionState }
  | { type: 'diff'; stat: DiffStat }
  | { type: 'exit'; code: number }
