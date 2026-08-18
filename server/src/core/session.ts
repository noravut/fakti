import { randomUUID } from 'node:crypto'
import type { IPty } from 'node-pty'
import type {
  Defect, DiffStat, DirtyStrategy, ServerMessage, Session, SessionState, Workspace,
} from '@shared/types'
import { readSessions, writeSessions } from './config'
import * as git from './git'
import { buildPrompt, writeTaskFile } from './prompt'

/** output ที่เก็บไว้ให้ client ที่ต่อใหม่ ~200KB ต่อ session */
const REPLAY_BUFFER_BYTES = 200 * 1024
/** เงียบเกินเท่านี้ถือว่าไม่ได้ทำงานอยู่ */
const IDLE_AFTER_MS = 2000
const STATE_TICK_MS = 500
const DIFF_BROADCAST_MS = 5000

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 32

// ── โหลด node-pty แบบบอกสาเหตุได้ ───────────────────────────────

type PtyModule = typeof import('node-pty')

let ptyModule: PtyModule | null = null
let ptyError: string | null = null

const PTY_HELP =
  'node-pty เป็น native module ต้องมี build toolchain ถึงจะติดตั้งได้\n' +
  '  macOS : xcode-select --install\n' +
  '  Linux : sudo apt install -y build-essential python3\n' +
  'แล้วรัน pnpm install ใหม่อีกครั้ง'

export function loadPty(): PtyModule {
  if (ptyModule) return ptyModule
  try {
    // require เพราะต้องจับ error ตอนโหลด native binding ให้ได้
    ptyModule = require('node-pty') as PtyModule
    return ptyModule
  } catch (err) {
    ptyError = `โหลด node-pty ไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}\n${PTY_HELP}`
    throw new Error(ptyError)
  }
}

/** เช็คตอน boot เพื่อเตือนล่วงหน้า ไม่ต้องรอไปพังตอนกดสร้าง session */
export function checkPty(): { ok: boolean; message?: string } {
  try {
    loadPty()
    return { ok: true }
  } catch {
    return { ok: false, message: ptyError ?? 'โหลด node-pty ไม่สำเร็จ' }
  }
}

// ── live session ────────────────────────────────────────────────

export interface TerminalClient {
  send(msg: ServerMessage): void
  close(): void
}

interface LiveSession {
  id: string
  pty: IPty
  cwd: string
  buffer: string[]
  bufferBytes: number
  clients: Set<TerminalClient>
  lastOutputAt: number
  lastDiffAt: number
  exited: boolean
}

const ANSI_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[[\]()#;?]*[0-9;]*[A-Za-z]|[\x00-\x08\x0b\x0c\x0e-\x1f]/g

/**
 * เดาว่า agent กำลังรอคำตอบอยู่หรือเปล่า
 * heuristic ล้วนๆ ผิดได้ ใช้เปลี่ยนแค่สีสถานะกับ title ของ tab เท่านั้น
 * ห้ามเอาไป block อะไร
 */
function looksLikeQuestion(tail: string): boolean {
  const clean = tail.replace(ANSI_RE, '')
  const recent = clean.slice(-600)
  return /❯/.test(recent)
    || /\(y\/n\)/i.test(recent)
    || /^\s*Do you want/m.test(recent)
}

export class SessionManager {
  private records: Session[]
  private live = new Map<string, LiveSession>()
  private timer: NodeJS.Timeout | null = null

  constructor(private workspaces: () => Workspace[]) {
    this.records = readSessions()
    // pty ตายไปพร้อม server รอบก่อน — session ที่ค้างสถานะทำงานอยู่ให้ปิดซะ
    let changed = false
    for (const s of this.records) {
      if (s.state !== 'closed') {
        s.state = 'closed'
        s.closedAt = s.closedAt ?? new Date().toISOString()
        changed = true
      }
    }
    if (changed) writeSessions(this.records)
  }

  start(): void {
    this.timer = setInterval(() => this.tick(), STATE_TICK_MS)
  }

  list(): Session[] {
    return [...this.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  record(id: string): Session | undefined {
    return this.records.find(s => s.id === id)
  }

  isLive(id: string): boolean {
    return this.live.has(id)
  }

  private persist(): void {
    writeSessions(this.records)
  }

  private workspace(id: string): Workspace | undefined {
    return this.workspaces().find(w => w.id === id)
  }

  // ── สร้าง ────────────────────────────────────────────────────

  async create(input: {
    workspace: Workspace
    defects: Defect[]
    branch: string
    dirtyStrategy?: DirtyStrategy
  }): Promise<Session> {
    const { workspace, defects, branch, dirtyStrategy } = input

    if (!git.isUsablePath(workspace.path)) {
      throw new HttpError(400, `ไม่พบโฟลเดอร์ ${workspace.path} — repo ถูกย้ายหรือลบไปแล้วหรือเปล่า`)
    }
    if (!(await git.isGitRepo(workspace.path))) {
      throw new HttpError(400, `${workspace.path} ไม่ใช่ git repo`)
    }

    const st = await git.status(workspace.path)
    let createdBranch = true
    let workingBranch = branch

    if (st.isDirty) {
      if (dirtyStrategy === 'stash') {
        await git.stash(workspace.path, `pat:${branch}`)
      } else if (dirtyStrategy === 'keep') {
        // ทำต่อบน branch ปัจจุบัน ไม่แตก branch ใหม่
        workingBranch = st.branch
        createdBranch = false
      } else {
        throw new DirtyError(st.dirtyCount, st.branch)
      }
    }

    if (createdBranch) {
      if (await git.branchExists(workspace.path, branch)) {
        throw new HttpError(409, `มี branch ${branch} อยู่แล้ว — ตั้งชื่ออื่นหรือทำต่อบน branch นั้น`)
      }
      await git.fetch(workspace.path)
      await git.createBranch(workspace.path, branch, workspace.baseBranch)
    }

    const baseCommit = await git.headCommit(workspace.path)
    const now = new Date().toISOString()

    const session: Session = {
      id: randomUUID(),
      workspaceId: workspace.id,
      branch: workingBranch,
      baseCommit,
      defectIds: defects.map(d => d.id),
      defects,
      state: 'working',
      createdAt: now,
      lastActivityAt: now,
      createdBranch,
    }

    this.spawn(session, buildPrompt(defects))

    this.records.push(session)
    this.persist()
    return session
  }

  /** เปิด pty ใหม่บน branch เดิมของ session ที่ปิดไปแล้ว */
  async reopen(id: string): Promise<Session> {
    const session = this.record(id)
    if (!session) throw new HttpError(404, 'ไม่พบ session')
    if (this.live.has(id)) return session

    const workspace = this.workspace(session.workspaceId)
    if (!workspace) throw new HttpError(400, 'workspace ของ session นี้ถูกลบไปแล้ว')
    if (!git.isUsablePath(workspace.path)) {
      throw new HttpError(400, `ไม่พบโฟลเดอร์ ${workspace.path}`)
    }

    const st = await git.status(workspace.path)
    if (st.branch !== session.branch) {
      if (st.isDirty) {
        throw new HttpError(409, `working tree มีไฟล์ค้าง ${st.dirtyCount} ไฟล์ — จัดการก่อนแล้วค่อยกลับเข้า session`)
      }
      await git.checkoutExisting(workspace.path, session.branch)
    }

    session.state = 'working'
    session.closedAt = undefined
    session.lastActivityAt = new Date().toISOString()
    this.spawn(session, buildPrompt(session.defects))
    this.persist()
    return session
  }

  /** เพิ่ม defect เข้า session ที่เปิดอยู่ แล้วส่งงานใหม่เข้า pty เดิม */
  async append(id: string, defects: Defect[]): Promise<Session> {
    const session = this.record(id)
    if (!session) throw new HttpError(404, 'ไม่พบ session')
    const live = this.live.get(id)
    if (!live || live.exited) throw new HttpError(409, 'session นี้ปิดไปแล้ว')

    const fresh = defects.filter(d => !session.defectIds.includes(d.id))
    if (fresh.length === 0) return session

    session.defectIds.push(...fresh.map(d => d.id))
    session.defects.push(...fresh)
    session.lastActivityAt = new Date().toISOString()

    const line = writeTaskFile(live.cwd, buildPrompt(fresh))
    live.pty.write(`${line}\r`)
    this.persist()
    return session
  }

  private spawn(session: Session, prompt: string): void {
    const workspace = this.workspace(session.workspaceId)
    if (!workspace) throw new HttpError(400, 'ไม่พบ workspace')

    const pty = loadPty()

    let term: IPty
    try {
      term = pty.spawn('claude', [], {
        name: 'xterm-256color',
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        cwd: workspace.path,
        // ส่ง env ทั้งก้อน ไม่งั้น claude หา credential ใน ~/.claude ไม่เจอ
        env: process.env as Record<string, string>,
      })
    } catch (err) {
      throw new HttpError(
        500,
        `เปิด claude ไม่ได้: ${err instanceof Error ? err.message : String(err)}\n` +
        'เช็คว่า claude อยู่ใน PATH แล้วลองใหม่',
      )
    }

    const live: LiveSession = {
      id: session.id,
      pty: term,
      cwd: workspace.path,
      buffer: [],
      bufferBytes: 0,
      clients: new Set(),
      lastOutputAt: Date.now(),
      lastDiffAt: 0,
      exited: false,
    }
    this.live.set(session.id, live)

    term.onData(data => {
      live.lastOutputAt = Date.now()
      this.appendBuffer(live, data)
      this.broadcast(live, { type: 'output', data })
    })

    term.onExit(({ exitCode }) => {
      live.exited = true
      this.broadcast(live, { type: 'exit', code: exitCode })
      this.finish(session.id, 'closed')
      this.live.delete(session.id)
    })

    // prompt ไปทางไฟล์ ส่งเข้า pty แค่บรรทัดเดียว — ดูเหตุผลใน core/prompt.ts
    const line = writeTaskFile(workspace.path, prompt)
    term.write(`${line}\r`)
  }

  private appendBuffer(live: LiveSession, data: string): void {
    live.buffer.push(data)
    live.bufferBytes += data.length
    while (live.bufferBytes > REPLAY_BUFFER_BYTES && live.buffer.length > 1) {
      const dropped = live.buffer.shift()
      live.bufferBytes -= dropped?.length ?? 0
    }
  }

  // ── client ──────────────────────────────────────────────────

  attach(id: string, client: TerminalClient): boolean {
    const live = this.live.get(id)
    const session = this.record(id)
    if (!live || !session) return false

    live.clients.add(client)
    // ส่ง output ที่ค้างไว้ก่อน แล้วค่อย stream ต่อ — refresh แล้วจอต้องไม่ว่าง
    if (live.buffer.length > 0) {
      client.send({ type: 'output', data: live.buffer.join('') })
    }
    client.send({ type: 'state', state: session.state })
    void this.sendDiff(live, client)
    return true
  }

  detach(id: string, client: TerminalClient): void {
    this.live.get(id)?.clients.delete(client)
  }

  input(id: string, data: string): void {
    const live = this.live.get(id)
    if (!live || live.exited) return
    live.pty.write(data)
    // คนพิมพ์ = มี activity ทันที ไม่ต้องรอ output
    live.lastOutputAt = Date.now()
  }

  resize(id: string, cols: number, rows: number): void {
    const live = this.live.get(id)
    if (!live || live.exited) return
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return
    const c = Math.max(20, Math.min(500, Math.floor(cols)))
    const r = Math.max(5, Math.min(200, Math.floor(rows)))
    try {
      live.pty.resize(c, r)
    } catch {
      // pty เพิ่งตายพอดี ปล่อยผ่าน
    }
  }

  private broadcast(live: LiveSession, msg: ServerMessage): void {
    for (const c of live.clients) c.send(msg)
  }

  // ── สถานะ ───────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now()
    for (const live of this.live.values()) {
      const session = this.record(live.id)
      if (!session || live.exited) continue

      const silent = now - live.lastOutputAt
      const next: SessionState = silent < IDLE_AFTER_MS
        ? 'working'
        : looksLikeQuestion(live.buffer.join('').slice(-4000)) ? 'waiting' : 'idle'

      if (next !== session.state) {
        session.state = next
        session.lastActivityAt = new Date().toISOString()
        this.broadcast(live, { type: 'state', state: next })
        this.persist()
        // งานเพิ่งหยุด — ตอนนี้แหละที่ diff นิ่งและน่าสนใจที่สุด
        // ถ้ารอแต่รอบ 5 วิของ state working ช่วงงานสั้นๆ จะไม่ได้อัปเดตเลย
        live.lastDiffAt = now
        void this.sendDiff(live)
      }

      if (next === 'working' && now - live.lastDiffAt >= DIFF_BROADCAST_MS) {
        live.lastDiffAt = now
        void this.sendDiff(live)
      }
    }
  }

  private async sendDiff(live: LiveSession, only?: TerminalClient): Promise<void> {
    const session = this.record(live.id)
    if (!session) return
    let stat: DiffStat
    try {
      stat = await git.diffStat(live.cwd, session.baseCommit)
    } catch {
      return // repo อาจอยู่ระหว่าง checkout ข้ามรอบนี้ไป
    }
    const msg: ServerMessage = { type: 'diff', stat }
    if (only) only.send(msg)
    else this.broadcast(live, msg)
  }

  async diff(id: string): Promise<DiffStat> {
    const session = this.record(id)
    if (!session) throw new HttpError(404, 'ไม่พบ session')
    const workspace = this.workspace(session.workspaceId)
    if (!workspace) throw new HttpError(400, 'workspace ของ session นี้ถูกลบไปแล้ว')
    return git.diffStat(workspace.path, session.baseCommit)
  }

  // ── ปิด / ทิ้ง ───────────────────────────────────────────────

  private finish(id: string, state: SessionState): void {
    const session = this.record(id)
    if (!session) return
    session.state = state
    session.closedAt = new Date().toISOString()
    session.lastActivityAt = session.closedAt
    this.persist()
  }

  /** ปิด pty แต่เก็บ branch ไว้ */
  async close(id: string): Promise<Session> {
    const session = this.record(id)
    if (!session) throw new HttpError(404, 'ไม่พบ session')
    await this.killPty(id)
    this.finish(id, 'closed')
    return session
  }

  /** reset + กลับ base branch + ลบ branch ที่ pat สร้าง */
  async discard(id: string): Promise<Session> {
    const session = this.record(id)
    if (!session) throw new HttpError(404, 'ไม่พบ session')
    const workspace = this.workspace(session.workspaceId)
    if (!workspace) throw new HttpError(400, 'workspace ของ session นี้ถูกลบไปแล้ว')

    await this.killPty(id)
    await git.discard(workspace.path, session.branch, workspace.baseBranch, session.createdBranch)
    this.finish(id, 'closed')
    return session
  }

  private async killPty(id: string): Promise<void> {
    const live = this.live.get(id)
    if (!live) return
    this.live.delete(id)
    if (live.exited) return

    // รอ exit จริง ไม่ใช่แค่ลบออกจาก Map
    await new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(hard)
        resolve()
      }
      live.pty.onExit(done)
      const hard = setTimeout(() => {
        try {
          live.pty.kill('SIGKILL')
        } catch { /* ตายไปแล้ว */ }
        resolve()
      }, 3000)
      try {
        live.pty.kill()
      } catch {
        done()
      }
    })

    for (const c of live.clients) c.close()
    live.clients.clear()
  }

  /** ปิดทุก session ตอน server จะดับ */
  async shutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer)
    await Promise.all([...this.live.keys()].map(id => this.killPty(id)))
  }
}

// ── error ที่แปลงเป็น HTTP response ได้ ──────────────────────────

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export class DirtyError extends Error {
  constructor(readonly dirtyCount: number, readonly branch: string) {
    super('working tree ไม่สะอาด')
  }
}
