import { create } from 'zustand'
import type { Defect, GitStatus, Session, Workspace } from '@shared/types'
import { api } from './api'

/** poll สถานะ git ทุก 5 วินาที เพื่อให้เห็นการสลับ branch จาก VSCode */
const STATUS_POLL_MS = 5000

interface State {
  ready: boolean
  needsSetup: boolean
  warnings: string[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  sessions: Session[]
  defects: Defect[]
  defectsError: string | null
  defectsLoading: boolean
  gitStatus: GitStatus | null
  gitStatusError: string | null
  /** ข้อความที่เด้งบนหน้าหลักหลังถูก redirect มา เช่น เปิด session ที่ถูกลบไปแล้ว */
  flash: string | null

  setFlash: (message: string | null) => void
  bootstrap: () => Promise<void>
  loadDefects: () => Promise<void>
  setActiveWorkspace: (id: string) => Promise<void>
  refreshWorkspaces: () => Promise<void>
  refreshSessions: () => Promise<void>
  refreshStatus: () => Promise<void>
  activeWorkspace: () => Workspace | undefined
  dismissWarnings: () => void
}

export const useStore = create<State>((set, get) => ({
  ready: false,
  needsSetup: false,
  warnings: [],
  workspaces: [],
  activeWorkspaceId: null,
  sessions: [],
  defects: [],
  defectsError: null,
  defectsLoading: false,
  gitStatus: null,
  gitStatusError: null,
  flash: null,

  setFlash(message) {
    set({ flash: message })
  },

  async bootstrap() {
    try {
      const b = await api.bootstrap()
      set({
        ready: true,
        needsSetup: b.needsSetup,
        warnings: b.warnings,
        workspaces: b.workspaces,
        activeWorkspaceId: b.activeWorkspaceId,
        sessions: b.sessions,
      })
      await get().refreshStatus()
    } catch (err) {
      set({ ready: true, warnings: [err instanceof Error ? err.message : 'โหลดข้อมูลเริ่มต้นไม่สำเร็จ'] })
    }
  },

  async loadDefects() {
    set({ defectsLoading: true, defectsError: null })
    try {
      set({ defects: await api.defects.list(), defectsLoading: false })
    } catch (err) {
      set({
        defectsLoading: false,
        defectsError: err instanceof Error ? err.message : 'โหลด defect ไม่สำเร็จ',
      })
    }
  },

  async setActiveWorkspace(id) {
    set({ activeWorkspaceId: id, gitStatus: null, gitStatusError: null })
    await api.settings.patch({ activeWorkspaceId: id })
    await get().refreshStatus()
  },

  async refreshWorkspaces() {
    const workspaces = await api.workspaces.list()
    const active = workspaces.some(w => w.id === get().activeWorkspaceId)
      ? get().activeWorkspaceId
      : workspaces[0]?.id ?? null
    set({ workspaces, activeWorkspaceId: active, needsSetup: workspaces.length === 0 })
  },

  async refreshSessions() {
    set({ sessions: await api.sessions.list() })
  },

  async refreshStatus() {
    const id = get().activeWorkspaceId
    if (!id) {
      set({ gitStatus: null, gitStatusError: null })
      return
    }
    try {
      set({ gitStatus: await api.workspaces.status(id), gitStatusError: null })
    } catch (err) {
      set({ gitStatus: null, gitStatusError: err instanceof Error ? err.message : 'อ่านสถานะ git ไม่ได้' })
    }
  },

  activeWorkspace() {
    return get().workspaces.find(w => w.id === get().activeWorkspaceId)
  },

  dismissWarnings() {
    set({ warnings: [] })
  },
}))

/**
 * เรียกครั้งเดียวตอนแอปขึ้น
 * ดึงทั้ง git status และรายการ session เพราะ pill ใน header ต้องรู้ตลอดว่ามีอะไรรันอยู่
 * แม้ผู้ใช้จะไม่ได้อยู่หน้า session ก็ตาม
 */
export function startPolling(): () => void {
  const timer = setInterval(() => {
    if (document.visibilityState !== 'visible') return
    const s = useStore.getState()
    void s.refreshStatus()
    void s.refreshSessions().catch(() => {
      /* server ดับชั่วคราว ไม่ต้องรบกวนผู้ใช้ รอบหน้าค่อยว่ากัน */
    })
  }, STATUS_POLL_MS)
  return () => clearInterval(timer)
}
