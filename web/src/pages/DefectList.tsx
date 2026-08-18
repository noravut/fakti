import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import type { Defect } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Header } from '../components/Header'
import { DefectRow, DefectRowSkeleton } from '../components/DefectRow'
import { BulkBar } from '../components/BulkBar'
import { ConfirmDialog, type ConfirmPayload } from '../components/ConfirmDialog'
import { Button, Card, EmptyState, ErrorBox, SectionTitle } from '../components/ui'

export function DefectList() {
  const [, navigate] = useLocation()
  const {
    defects, defectsLoading, defectsError, loadDefects,
    workspaces, activeWorkspaceId, sessions, gitStatus, refreshSessions,
  } = useStore()

  // repo ต่อแถว ตั้งต้นที่ workspace ที่กำลังใช้อยู่ ผู้ใช้แก้รายแถวได้
  const [rowWorkspace, setRowWorkspace] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    void loadDefects()
  }, [loadDefects])

  const workspaceFor = (id: string) => rowWorkspace[id] ?? activeWorkspaceId

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

  /** defect นี้เคยถูกหยิบไปแก้ใน session ไหน */
  const fixedIn = useMemo(() => {
    const map: Record<string, string> = {}
    for (const s of [...sessions].reverse()) {
      for (const id of s.defectIds) map[id] = s.branch
    }
    return map
  }, [sessions])

  const openSessions = useMemo(
    () => sessions.filter(s => s.state !== 'closed' && s.workspaceId === targetWorkspace?.id),
    [sessions, targetWorkspace],
  )

  function toggleSelect(defect: Defect) {
    setSelected(prev =>
      prev.includes(defect.id) ? prev.filter(id => id !== defect.id) : [...prev, defect.id],
    )
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
          <Button size="sm" onClick={() => void loadDefects()} disabled={defectsLoading}>
            โหลดใหม่
          </Button>
        </div>

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
              title="ไม่มี defect ที่รอแก้อยู่ตอนนี้"
              hint="โหลดใหม่ดูก่อน หรือกลับมาเช็คทีหลังก็ได้"
              action={<Button size="sm" onClick={() => void loadDefects()}>โหลดใหม่</Button>}
            />
          ) : (
            <div className="overflow-hidden rounded-card border border-hair bg-paper">
              {defects.map(d => (
                <DefectRow
                  key={d.id}
                  defect={d}
                  workspaces={workspaces}
                  workspaceId={workspaceFor(d.id)}
                  onWorkspaceChange={id => setRowWorkspace(prev => ({ ...prev, [d.id]: id }))}
                  selected={selected.includes(d.id)}
                  onToggleSelect={() => toggleSelect(d)}
                  expanded={expanded === d.id}
                  onToggleExpand={() => setExpanded(prev => (prev === d.id ? null : d.id))}
                  fixedIn={fixedIn[d.id]}
                />
              ))}
            </div>
          )}
        </div>

        {selected.length > 0 && (
          <BulkBar
            count={selected.length}
            workspace={targetWorkspace}
            mixed={mixed}
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
