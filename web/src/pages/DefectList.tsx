import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Defect } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { relativeTime } from '../format'
import {
  DEFAULT_FILTERS, NO_FILTERS, applyFilters, type Filters,
} from '../filters'
import { Header } from '../components/Header'
import { DefectRow, DefectRowSkeleton } from '../components/DefectRow'
import { DefectFilters } from '../components/DefectFilters'
import { BulkBar } from '../components/BulkBar'
import { ConfirmDialog, type ConfirmPayload } from '../components/ConfirmDialog'
import { Button, Card, EmptyState, ErrorBox, SectionTitle } from '../components/ui'

/** กรองใน memory เร็วอยู่แล้ว หน่วงแค่พอให้ไม่ re-render ทุกตัวอักษร */
const SEARCH_DEBOUNCE_MS = 150
/** หนึ่ง session รับได้เท่านี้ — เยอะกว่านี้ agent ทำพร้อมกันไม่ไหว */
const MAX_SELECT = 5
const ROW_ESTIMATE_PX = 52

function clockTime(iso: string | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso)
  return Number.isNaN(t.getTime())
    ? '—'
    : t.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

export function DefectList() {
  const [, navigate] = useLocation()
  const {
    defects, facets, defectsMeta, defectsLoading, defectsRefreshing, defectsError, loadDefects,
    workspaces, activeWorkspaceId, sessions, gitStatus, refreshSessions, myName, sourceFor,
  } = useStore()

  // repo ต่อแถว ตั้งต้นที่ workspace ที่กำลังใช้อยู่ ผู้ใช้แก้รายแถวได้
  const [rowWorkspace, setRowWorkspace] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  // ยังไม่ได้ตั้งชื่อตัวเอง → preset "ของฉัน" กรองจนเหลือ 0 เสมอ อย่าเปิดไว้ตั้งแต่แรก
  const [filters, setFilters] = useState<Filters>(
    () => (myName ? DEFAULT_FILTERS : { ...DEFAULT_FILTERS, presets: [] }),
  )
  // ช่องค้นหาต้องตอบสนองทันที ส่วนการกรองค่อยตามมาหลัง debounce
  const [typed, setTyped] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadDefects()
  }, [loadDefects])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  // กด / ที่ไหนก็ได้เพื่อกลับมาที่ช่องค้นหา
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey) return
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      e.preventDefault()
      searchRef.current?.focus()
      searchRef.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setFilters(f => ({ ...f, search: typed })), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [typed])

  const workspaceFor = (id: string) => rowWorkspace[id] ?? activeWorkspaceId

  /** defect ที่เคยถูกหยิบไปแก้ — ใช้ทั้ง preset "ที่เคยแตะ" และป้ายในแถว */
  const touchedIds = useMemo(
    () => new Set(sessions.flatMap(s => s.defectIds)),
    [sessions],
  )

  const openStatuses = useMemo(
    () => sourceFor(workspaces.find(w => w.id === activeWorkspaceId))?.openStatuses ?? [],
    [sourceFor, workspaces, activeWorkspaceId],
  )

  const visible = useMemo(
    () => applyFilters(defects, filters, { me: myName, openStatuses, touchedIds, now: Date.now() }),
    [defects, filters, myName, openStatuses, touchedIds],
  )

  const selectedDefects = useMemo(
    () => defects.filter(d => selected.includes(d.id)),
    [defects, selected],
  )

  const selectedWorkspaceIds = useMemo(
    () => [...new Set(selectedDefects.map(d => workspaceFor(d.id)).filter(Boolean))] as string[],
    [selectedDefects, rowWorkspace, activeWorkspaceId],
  )

  const mixed = selectedWorkspaceIds.length > 1
  const targetWorkspace = workspaces.find(w => w.id === selectedWorkspaceIds[0]) ?? null
  const stale = defectsMeta?.stale

  /** defect นี้เคยถูกหยิบไปแก้ใน session ไหน */
  const fixedIn = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of [...sessions].reverse()) {
      for (const id of s.defectIds) map[id] = s.branch
    }
    return map
  }, [sessions])

  // แถวกางออกได้ ความสูงเลยไม่คงที่ ต้องวัดจริงด้วย measureElement
  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    getItemKey: useCallback((i: number) => visible[i]?.id ?? i, [visible]),
    overscan: 8,
  })

  const openSessions = useMemo(
    () => sessions.filter(s => s.state !== 'closed' && s.workspaceId === targetWorkspace?.id),
    [sessions, targetWorkspace],
  )

  function toggleSelect(defect: Defect) {
    setSelected(prev => {
      if (prev.includes(defect.id)) return prev.filter(id => id !== defect.id)
      return prev.length >= MAX_SELECT ? prev : [...prev, defect.id]
    })
  }

  async function start(payload: ConfirmPayload) {
    if (!targetWorkspace) return

    const session = payload.mode === 'append' && payload.sessionId
      ? await api.sessions.append(payload.sessionId, selected)
      : await api.sessions.create({
        workspaceId: targetWorkspace.id,
        defectIds: selected,
        branch: payload.branch,
        dirtyStrategy: payload.dirtyStrategy,
        prompt: payload.prompt,
      })

    await refreshSessions()
    setConfirming(false)
    setSelected([])
    navigate(`/session/${session.id}`)
  }

  return (
    <>
      <Card>
        <Header />

        <div className="flex items-center justify-between px-5 pb-3 pt-[18px]">
          <SectionTitle>Defect ที่รอแก้</SectionTitle>
          <div className="flex items-center gap-3">
            {defectsRefreshing && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-faint pat-pulse" />
                กำลังดึงข้อมูลใหม่
              </span>
            )}
            {defectsMeta && !defectsRefreshing && (
              <span className="text-[13px] text-faint">
                {defectsMeta.sourceLabel} · อัปเดต{relativeTime(defectsMeta.fetchedAt)}
              </span>
            )}
            <Button size="sm" onClick={() => void loadDefects(true)} disabled={defectsRefreshing}>
              โหลดใหม่
            </Button>
          </div>
        </div>

        {!defectsLoading && !defectsError && defects.length > 0 && (
          <div className="flex flex-col gap-2.5 px-5 pb-3">
            <DefectFilters
              ref={searchRef}
              filters={{ ...filters, search: typed }}
              facets={facets}
              canFilterMine={Boolean(myName)}
              onChange={next => {
                setTyped(next.search)
                setFilters(next)
              }}
            />
            <div className="flex items-center gap-3 text-[13px] text-faint">
              <span>แสดง {visible.length} จาก {defects.length} รายการ</span>
              {defectsMeta?.filtered && (
                <span>· source กรองมาแล้วจาก {defectsMeta.filtered.total}</span>
              )}
              {selected.length >= MAX_SELECT && (
                <span className="text-warn-deep">· เลือกได้สูงสุด {MAX_SELECT} รายการต่อ session</span>
              )}
            </div>
          </div>
        )}

        {stale && (
          <div className="mx-5 mb-3 flex flex-col gap-1 rounded border border-warn bg-warn/5 px-3.5 py-3">
            <span className="text-[13px] text-warn-deep">
              ข้อมูลจากเมื่อ {clockTime(defectsMeta?.fetchedAt)} · ต่อเซิร์ฟเวอร์ไม่ได้ตอนนี้
            </span>
            <span className="text-[13px] text-muted">{stale.reason}</span>
            <span className="text-[13px] text-faint">
              {stale.network === 'internal'
                ? 'ปิดปุ่มแก้ไว้ก่อนเพราะข้อมูลอาจเก่า — ต่อ VPN แล้วกดโหลดใหม่ หรือสลับไป source ตัวอย่างเพื่อทำงานต่อ'
                : 'ปิดปุ่มแก้ไว้ก่อนเพราะข้อมูลอาจเก่า — กดโหลดใหม่เมื่อต่อเน็ตได้'}
            </span>
          </div>
        )}

        <div className="mx-5 mb-4">
          {defectsLoading ? (
            <div className="overflow-hidden rounded-card border border-hair bg-paper">
              <DefectRowSkeleton />
              <DefectRowSkeleton />
              <DefectRowSkeleton />
            </div>
          ) : defectsError ? (
            <ErrorBox
              title={`โหลด defect ไม่สำเร็จ — ${defectsError}`}
              hint="เช็คว่า pat ยังรันอยู่ แล้วลองอีกครั้ง"
              action={<Button size="sm" onClick={() => void loadDefects()}>ลองใหม่</Button>}
            />
          ) : defects.length === 0 ? (
            <EmptyState
              title="source นี้ไม่มี defect เลย"
              hint="โหลดใหม่ดูก่อน หรือเช็คการตั้งค่า source"
              action={<Button size="sm" onClick={() => void loadDefects(true)}>โหลดใหม่</Button>}
            />
          ) : visible.length === 0 ? (
            <EmptyState
              title="ไม่มีรายการที่ตรงกับตัวกรอง"
              hint={
                filters.presets.includes('mine') && myName
                  ? `จาก ${defects.length} รายการ ไม่มีอันไหนที่ทั้งยังไม่ปิดและมอบหมายให้ ${myName}`
                  : `กรองจาก ${defects.length} รายการแล้วไม่เหลือเลย`
              }
              action={
                <Button size="sm" onClick={() => { setTyped(''); setFilters(NO_FILTERS) }}>
                  ดูทั้งหมด {defects.length} รายการ
                </Button>
              }
            />
          ) : (
            <div
              ref={scrollRef}
              className="max-h-[62vh] overflow-y-auto rounded-card border border-hair bg-paper"
            >
              {/* virtual scrolling — 1000 แถวจริงๆ ทำให้หน้าหน่วง */}
              <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map(item => {
                  const d = visible[item.index]
                  if (!d) return null
                  return (
                    <div
                      key={item.key}
                      data-index={item.index}
                      ref={virtualizer.measureElement}
                      className={item.index === 0 ? '' : 'border-t border-hair'}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${item.start}px)`,
                      }}
                    >
                      <DefectRow
                        defect={d}
                        workspaces={workspaces}
                        workspaceId={workspaceFor(d.id)}
                        onWorkspaceChange={id => setRowWorkspace(prev => ({ ...prev, [d.id]: id }))}
                        selected={selected.includes(d.id)}
                        selectable={selected.includes(d.id) || selected.length < MAX_SELECT}
                        onToggleSelect={() => toggleSelect(d)}
                        expanded={expanded === d.id}
                        onToggleExpand={() => setExpanded(prev => (prev === d.id ? null : d.id))}
                        fixedIn={fixedIn[d.id]}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <BulkBar
            count={selected.length}
            workspace={targetWorkspace}
            mixed={mixed}
            max={MAX_SELECT}
            blocked={stale ? 'ข้อมูลเป็นของเก่า — โหลดใหม่ให้สำเร็จก่อนถึงจะสั่งแก้ได้' : null}
            onCancel={() => setSelected([])}
            onStart={() => setConfirming(true)}
          />
        )}
      </Card>

      {confirming && targetWorkspace && (
        <ConfirmDialog
          defects={selectedDefects}
          workspace={targetWorkspace}
          openSessions={openSessions}
          dirtyCount={
            // สถานะที่ poll ไว้เป็นของ workspace ที่กำลังใช้อยู่เท่านั้น
            targetWorkspace.id === activeWorkspaceId && gitStatus?.isDirty ? gitStatus.dirtyCount : 0
          }
          onCancel={() => setConfirming(false)}
          onSubmit={start}
        />
      )}
    </>
  )
}
