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

  /** source ที่ repo นี้ดึง defect มา — ไม่ระบุ = ใช้ activeSourceId */
  sourceId?: string
  /** ค่าของ vars ที่ source ต้องการ — key ตรงกับ vars[].key */
  sourceVars?: Record<string, string>
  /** branch ที่ห้ามแก้ทับ — ไม่ระบุ = ใช้ค่าตั้งต้นของแอป */
  protectedBranches?: string[]
}

/**
 * baseBranch บอกว่า "สร้าง branch ใหม่จากตรงไหน" และ "ทิ้งงานแล้วกลับไปตรงไหน"
 * ไม่ใช่ "branch ที่ห้ามแตะ" — อันนั้นคือ protectedBranches
 * ทีมที่ตั้ง baseBranch เป็น branch งานของตัวเองจะได้ไม่ถูกบล็อก
 */
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master', 'develop', 'trunk', 'release']

export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface Defect {
  id: string
  key: string             // "TC-1042"
  title: string
  description: string
  severity: Severity
  status: string
  reporter?: string
  /** คนที่ถูกมอบหมายให้แก้ — ใช้กับตัวกรอง "ของฉัน" */
  assignee?: string
  createdAt: string
  url?: string
  // ไม่มี field บอก repo — ผู้ใช้ต้องเลือกเอง
}

// ── defect source ──────────────────────────────────────────────
// โครงสร้าง API ของแต่ละที่ไม่เหมือนกัน — อธิบายมันด้วย config ไม่ใช่ด้วยโค้ด
// ห้ามมี field ชื่อเฉพาะของ API ตัวใดตัวหนึ่งโผล่ในไฟล์นี้

/** ตัวแปรที่ source ประกาศเองว่าต้องการ ค่าจริงเก็บที่ workspace */
export interface SourceVar {
  key: string
  label: string
  required?: boolean
  hint?: string
}

export interface RequestSpec {
  method?: 'GET' | 'POST'
  path: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
}

/** *Ref ทุกตัวชี้ไป key ใน ~/.pat/secrets.json — ห้ามเก็บค่าจริงใน sources.json */
export type SourceAuth =
  | { type: 'none' }
  | { type: 'bearer'; tokenRef: string }
  | { type: 'header'; name: string; valueRef: string }
  | { type: 'basic'; userRef: string; passRef: string }
  | { type: 'query'; name: string; valueRef: string }

/** ค่าแต่ละตัวคือ path expression ชี้เข้าไปใน item ดิบ */
export interface FieldMap {
  id: string
  key?: string
  keyPrefix?: string
  title?: string
  description?: string
  severity?: string
  status?: string
  reporter?: string
  assignee?: string
  createdAt?: string
}

export interface FilterRule {
  from: string
  equals?: string
  in?: string[]
  contains?: string
  exists?: boolean
}

/** field เสริมที่เอามาต่อท้าย description ตอนส่งให้ agent */
export interface ContextField {
  label: string
  from: string
}

export interface SourceConfig {
  id: string
  label: string
  /** internal = อยู่หลัง VPN ยิงไม่ถึงเป็นเรื่องปกติ ไม่ใช่ error */
  network: 'internal' | 'public'
  /** ขึ้นต้นด้วย / = ชี้กลับมาที่ fakti เอง (ใช้กับ source mock) */
  baseUrl: string
  insecureTLS?: boolean
  auth?: SourceAuth
  vars: SourceVar[]
  list: RequestSpec
  /** ถ้า list ไม่มี description ให้ตามไปดึงตอนที่ต้องใช้จริง */
  detail?: RequestSpec
  /** path ไปยัง array ใน response — "" = ตัว response เป็น array อยู่แล้ว */
  itemsPath?: string
  map: FieldMap
  /** regex ตัดขยะหน้า title เช่น "[100][SaaS]" */
  titleCleanup?: string
  /** status ที่ถือว่ายังไม่ปิด — ไม่ระบุ = เอาทั้งหมด */
  openStatuses?: string[]
  /** เรียงจากหนักไปเบา แล้ว map ลง Severity ตามลำดับ */
  severityOrder?: string[]
  clientFilter?: FilterRule[]
  context?: ContextField[]
  /** template ของลิงก์ไป ticket — ไม่ระบุ = ไม่มีปุ่มเปิด ticket */
  ticketUrl?: string
}

export type CheckStage =
  | 'resolve'   // ต่อ host ได้ไหม
  | 'tls'       // ใบรับรองผ่านไหม
  | 'http'      // status code
  | 'auth'      // 401/403
  | 'parse'     // เป็น JSON ไหม
  | 'shape'     // หา array เจอไหมตาม itemsPath
  | 'map'       // map field ได้ครบไหม

export interface CheckResult {
  stage: CheckStage
  ok: boolean
  detail: string
  /** บอกวิธีแก้ ไม่ใช่แค่บอกว่าพัง */
  fix?: string
  sample?: unknown
  preview?: Defect
  /** key ที่มีให้เลือกจริง — ตัวนี้เปลี่ยนการตั้งค่าจาก "เดาแล้วลอง" เป็น "เห็นแล้วเลือก" */
  availableKeys?: string[]
}

export type SessionState =
  | 'working'      // agent กำลังทำงาน
  | 'waiting'      // agent ถามแล้วรอคนตอบ
  | 'idle'         // ว่าง รอคำสั่ง
  | 'closed'

// ── feature session ────────────────────────────────────────────
// งานที่ไม่ได้มาจาก tracker — ผู้ใช้พิมพ์ requirement เอง แล้วให้ agent ทำและทวนความครบ

export type SessionKind = 'defect' | 'feature'

/** requirement 1 ข้อ — key คือ REQ-n ที่ fakti ตั้งให้ตามลำดับบรรทัด agent ใช้อ้างใน commit */
export interface Requirement {
  key: string
  text: string
}

export interface FeatureSpec {
  title: string
  /** ข้อมูลประกอบ เช่น หน้าไหน ไฟล์ไหน ลิงก์ design — ว่างได้ */
  context?: string
  requirements: Requirement[]
}

export interface Session {
  id: string
  workspaceId: string
  branch: string
  baseCommit: string
  /** 'defect' = แก้ defect จาก tracker (ค่าเดิม) · 'feature' = ทำตาม requirement ที่พิมพ์เอง */
  kind: SessionKind
  defectIds: string[]
  defects: Defect[]        // snapshot ตอนสร้าง · feature session = []
  /** มีเมื่อ kind = 'feature' */
  feature?: FeatureSpec
  state: SessionState
  createdAt: string
  lastActivityAt: string
  closedAt?: string
  /**
   * 'existing' = branch เป็นของผู้ใช้อยู่ก่อนแล้ว ห้ามลบตอน discard เด็ดขาด
   * ทำได้แค่ reset กลับไปที่ baseCommit
   */
  branchOwnership: BranchOwnership
}

export interface GitStatus {
  branch: string
  isDirty: boolean
  dirtyCount: number
  ahead: number
  behind: number
}

export interface BranchInfo {
  name: string
  lastCommitSubject: string
  lastCommitDate: string
  isCurrent: boolean
  /** จุดตั้งต้นของ branch ใหม่ — ไม่ได้แปลว่าห้ามแก้ */
  isBase: boolean
  /** อยู่ในรายการห้ามแก้ทับ — ตัวนี้ต่างหากที่บล็อกการทำงาน */
  isProtected: boolean
}

/**
 * branch นี้ fakti เป็นคนสร้างเองหรือเป็นของผู้ใช้อยู่แล้ว
 * ตัวนี้ตัดสินว่าตอนทิ้ง session จะลบ branch ได้ไหม
 */
export type BranchOwnership = 'created' | 'existing'

export type BranchChoice =
  | { kind: 'new'; name: string; from: string }
  | { kind: 'existing'; name: string }
  | { kind: 'current' }

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
  sources: SourceConfig[]
  activeSourceId: string | null
  myName: string | null
  protectedBranches: string[]
}

/** โหมดการดึง — cache แสดงทันที fresh ยิงจริง auto คือยิงแล้วตกมาที่ cache ถ้าพัง */
export type FetchMode = 'auto' | 'cache' | 'fresh'

export interface DefectListResponse {
  defects: Defect[]
  sourceId: string
  sourceLabel: string
  /** เวลาที่ข้อมูลชุดนี้ถูกดึงมาจาก source จริงๆ ไม่ใช่เวลาที่ตอบ request นี้ */
  fetchedAt: string
  /** true = อ่านจาก cache ล้วน ไม่ได้แตะเน็ตเวิร์กเลย */
  fromCache: boolean
  /** มีค่า = ยิงแล้วไม่ถึง เลยเอาของ cache มาแสดงแทน — ปุ่ม Fix ต้องถูก disable */
  stale?: {
    reason: string
    network: 'internal' | 'public'
  }
  /** มีค่า = source กรองเองไม่ได้ เลยต้องดึงมาเยอะแล้วกรองฝั่งเรา */
  filtered?: {
    total: number
    kept: number
  }
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
  /** ว่างได้เมื่อส่ง feature มา */
  defectIds: string[]
  /** มีค่า = feature session — server ใช้ buildFeaturePrompt แทน */
  feature?: FeatureSpec
  branch: BranchChoice
  dirtyStrategy?: DirtyStrategy
  /** prompt ที่ผู้ใช้อ่าน/แก้แล้วจาก preview — ไม่ส่งมา = ให้ server สร้างเอง */
  prompt?: string
}

/** ร่าง prompt ที่จะเขียนลง .pat-task.md — ให้ผู้ใช้อ่าน/แก้ก่อนเริ่ม session */
export interface TaskPromptPayload {
  prompt: string
}

/** 409 ตอน working tree สกปรกและ client ยังไม่ได้เลือกทาง */
export interface DirtyConflict {
  error: 'dirty'
  dirtyCount: number
  branch: string
}

/** prompt QA Gate — server เติมให้ก่อน ผู้ใช้อ่าน/แก้ แล้วส่งกลับมาทั้งก้อน */
export interface QaPromptPayload {
  prompt: string
}

export interface Settings {
  activeWorkspaceId: string | null
  activeSourceId: string | null
  /** ชื่อของผู้ใช้ตามที่ tracker บันทึกไว้ — ใช้เทียบกับ assignee ในตัวกรอง "ของฉัน" */
  myName: string | null
  /** ค่าตั้งต้นของ branch ที่ห้ามแก้ทับ — workspace ตั้งทับได้ */
  protectedBranches: string[]
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
