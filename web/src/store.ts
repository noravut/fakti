import { create } from 'zustand'
import type {
  DefectListResponse, GitStatus, Session, SourceConfig, Workspace,
} from '@shared/types'
import { api } from './api'
import { buildFacets, indexDefects, type Facets, type IndexedDefect } from './filters'

/** poll สถานะ git ทุก 5 วินาที เพื่อให้เห็นการสลับ branch จาก VSCode */
const STATUS_POLL_MS = 5000

const EMPTY_FACETS: Facets = { status: [], severity: [], assignee: [] }

/** id ของ defect ที่ผู้ใช้ทำเครื่องหมายเองว่าแก้แล้ว — เก็บแค่ id ไว้ในเครื่อง ไม่ยุ่งกับ tracker */
const MARKED_KEY = 'pat.markedFixed'

/** ธีมกับฟอนต์ที่ผู้ใช้เลือก — index.html อ่าน key นี้ก่อน React mount เพื่อกันจอกระพริบ */
const APPEARANCE_KEY = 'fakti.appearance'

function readAppearance(): { theme: Theme; font: Font } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? '{}')
    const o = (raw ?? {}) as Record<string, unknown>
    return {
      theme: o.theme === 'light' ? 'light' : 'dark',
      font: o.font === 'anuphan' ? 'anuphan' : 'plex',
    }
  } catch {
    return { theme: 'dark', font: 'plex' } // localStorage ปิดอยู่ — ใช้ค่าเริ่มต้น dark-first
  }
}

export type Theme = 'dark' | 'light'
export type Font = 'plex' | 'anuphan'

function readMarked(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(MARKED_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return [] // localStorage ปิดอยู่หรือค่าเสีย — ถือว่ายังไม่เคย mark อะไร ห้ามให้ทั้งหน้าพัง
  }
}

/** ทำ index + นับ facet ตรงนี้ที่เดียว จะได้ทำครั้งเดียวต่อการโหลดหนึ่งครั้ง */
function toDefectState(res: DefectListResponse) {
  const { defects, ...meta } = res
  const indexed = indexDefects(defects)
  return { defects: indexed, facets: buildFacets(indexed), defectsMeta: meta }
}

interface State {
  ready: boolean
  needsSetup: boolean
  warnings: string[]
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  sessions: Session[]
  defects: IndexedDefect[]
  /** ค่าที่พบจริงในแต่ละ field พร้อมจำนวน — คำนวณครั้งเดียวตอนโหลด */
  facets: Facets
  /** ข้อมูลประกอบรายการ defect — มาจาก source ไหน สดหรือของเก่า กรองไปเท่าไหร่ */
  defectsMeta: Omit<DefectListResponse, 'defects'> | null
  defectsError: string | null
  /** true เฉพาะตอนที่ยังไม่มีอะไรให้แสดงเลย — ตัวที่ทำให้ขึ้น skeleton */
  defectsLoading: boolean
  /** ยิงอยู่เบื้องหลังทั้งที่มีข้อมูลแสดงอยู่แล้ว — แค่ตัวบอกสถานะเล็กๆ ห้ามบล็อกจอ */
  defectsRefreshing: boolean
  /** id ของ defect ที่ทำเครื่องหมายว่าแก้แล้ว อ่านจาก localStorage ตอนเปิดหน้า */
  markedFixed: string[]
  myName: string | null
  protectedBranches: string[]
  sources: SourceConfig[]
  activeSourceId: string | null
  gitStatus: GitStatus | null
  gitStatusError: string | null
  /** ข้อความที่เด้งบนหน้าหลักหลังถูก redirect มา เช่น เปิด session ที่ถูกลบไปแล้ว */
  flash: string | null
  theme: Theme
  font: Font

  setFlash: (message: string | null) => void
  setTheme: (theme: Theme) => void
  setFont: (font: Font) => void
  /** ติ๊ก/เอาติ๊กออกว่าแก้ defect นี้แล้ว */
  toggleMarkedFixed: (id: string) => void
  bootstrap: () => Promise<void>
  /** force = ข้าม cache ยิงใหม่เลย (ปุ่มโหลดใหม่) */
  loadDefects: (force?: boolean) => Promise<void>
  setMyName: (name: string | null) => Promise<void>
  setProtectedBranches: (list: string[]) => Promise<void>
  setActiveWorkspace: (id: string) => Promise<void>
  setActiveSource: (id: string) => Promise<void>
  refreshWorkspaces: () => Promise<void>
  refreshSessions: () => Promise<void>
  refreshStatus: () => Promise<void>
  activeWorkspace: () => Workspace | undefined
  sourceFor: (workspace: Workspace | undefined) => SourceConfig | undefined
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
  facets: EMPTY_FACETS,
  defectsMeta: null,
  defectsError: null,
  defectsLoading: false,
  defectsRefreshing: false,
  markedFixed: readMarked(),
  myName: null,
  protectedBranches: [],
  sources: [],
  activeSourceId: null,
  gitStatus: null,
  gitStatusError: null,
  flash: null,
  ...readAppearance(),

  setFlash(message) {
    set({ flash: message })
  },

  setTheme(theme) {
    set({ theme })
    applyAppearance(theme, get().font)
  },

  setFont(font) {
    set({ font })
    applyAppearance(get().theme, font)
  },

  toggleMarkedFixed(id) {
    const next = get().markedFixed.includes(id)
      ? get().markedFixed.filter(x => x !== id)
      : [...get().markedFixed, id]
    set({ markedFixed: next })
    try {
      localStorage.setItem(MARKED_KEY, JSON.stringify(next))
    } catch {
      // เขียนไม่ได้ (โหมดส่วนตัว/พื้นที่เต็ม) — ยังใช้ต่อได้ในรอบนี้ แค่ไม่ค้างข้ามรอบ
    }
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
        sources: b.sources,
        activeSourceId: b.activeSourceId,
        myName: b.myName,
        protectedBranches: b.protectedBranches,
      })
      await get().refreshStatus()
    } catch (err) {
      set({ ready: true, warnings: [err instanceof Error ? err.message : 'โหลดข้อมูลเริ่มต้นไม่สำเร็จ'] })
    }
  },

  /**
   * แสดงของ cache ทันทีแล้วค่อยยิงใหม่เบื้องหลัง
   * skeleton ขึ้นเฉพาะตอนที่ยังไม่เคยมี cache เลยจริงๆ
   */
  async loadDefects(force = false) {
    const workspaceId = get().activeWorkspaceId
    set({ defectsError: null })

    if (!force) {
      try {
        const cached = await api.defects.list(workspaceId, 'cache')
        if (cached) set({ ...toDefectState(cached), defectsLoading: false })
        else set({ defectsLoading: get().defects.length === 0 })
      } catch {
        // อ่าน cache ไม่ได้ก็ไปยิงจริงต่อได้เลย
      }
    }

    set({ defectsRefreshing: true })
    try {
      const fresh = await api.defects.list(workspaceId, 'fresh')
      if (fresh) set({ ...toDefectState(fresh), defectsLoading: false })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'โหลด defect ไม่สำเร็จ'
      // ยิงไม่ผ่านแต่มีของเก่าแสดงอยู่ — เก็บของเก่าไว้ อย่าล้างจอ
      if (get().defects.length > 0) set({ defectsError: message })
      else set({ defects: [], facets: EMPTY_FACETS, defectsMeta: null, defectsError: message })
      set({ defectsLoading: false })
    } finally {
      set({ defectsRefreshing: false })
    }
  },

  async setMyName(name) {
    set({ myName: name })
    await api.settings.patch({ myName: name })
  },

  async setProtectedBranches(list) {
    set({ protectedBranches: list })
    await api.settings.patch({ protectedBranches: list })
  },

  async setActiveWorkspace(id) {
    set({ activeWorkspaceId: id, gitStatus: null, gitStatusError: null })
    await api.settings.patch({ activeWorkspaceId: id })
    await Promise.all([get().refreshStatus(), get().loadDefects()])
  },

  async setActiveSource(id) {
    set({ activeSourceId: id })
    await api.settings.patch({ activeSourceId: id })
    await get().loadDefects()
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

  sourceFor(workspace) {
    const { sources, activeSourceId } = get()
    const wanted = workspace?.sourceId ?? activeSourceId
    return sources.find(s => s.id === wanted) ?? sources[0]
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

/** เขียนลง <html> ที่เดียว — CSS variable ทั้งชุดผูกกับ data-theme/data-font สองตัวนี้ */
function applyAppearance(theme: Theme, font: Font) {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.font = font
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme, font }))
  } catch {
    // เขียนไม่ได้ — ธีมยังเปลี่ยนได้ในรอบนี้ แค่ไม่ค้างข้ามรอบ
  }
}
