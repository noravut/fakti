import { useState } from 'react'
import { Link } from 'wouter'
import type { Workspace } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Header } from '../components/Header'
import { BackLink, useEscapeBack } from '../components/BackLink'
import { WorkspaceForm } from '../components/WorkspaceForm'
import { ColorDot } from '../components/WorkspaceChip'
import { Button, Card, SectionTitle } from '../components/ui'

export function Settings() {
  const { workspaces, activeWorkspaceId, refreshWorkspaces, refreshStatus, setActiveWorkspace } = useStore()
  const [editing, setEditing] = useState<Workspace | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEscapeBack('/')

  async function reload() {
    await refreshWorkspaces()
    await refreshStatus()
    setEditing(null)
    setAdding(false)
  }

  async function remove(id: string) {
    setError(null)
    try {
      await api.workspaces.remove(id)
      setConfirmDelete(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
    }
  }

  return (
    <>
      <BackLink href="/" label="กลับไป Defect list" />

      <Card>
        <Header crumbs={[{ label: 'ตั้งค่า' }]} />

        <div className="flex items-center justify-between px-5 pb-3 pt-[18px]">
          <SectionTitle>Repo ที่ลงทะเบียนไว้</SectionTitle>
          <Button size="sm" onClick={() => { setAdding(true); setEditing(null) }}>เพิ่ม repo</Button>
        </div>

        <div className="mx-5 mb-4 overflow-hidden rounded-card border border-hair bg-paper">
          {workspaces.length === 0 ? (
            <div className="px-4 py-4 text-sm text-faint">ยังไม่มี repo — กดเพิ่ม repo เพื่อเริ่ม</div>
          ) : (
            workspaces.map(w => (
              <div key={w.id} className="flex flex-col gap-3 border-t border-hair px-4 py-3 first:border-t-0">
                <div className="flex items-center gap-3">
                  <ColorDot color={w.color} />
                  <span className="font-mono text-[13px] font-medium">{w.id}</span>
                  <span className="flex-1 truncate font-mono text-xs text-faint">{w.path}</span>
                  <span className="font-mono text-xs text-muted">{w.baseBranch}</span>

                  {w.id === activeWorkspaceId ? (
                    <span className="rounded-chip bg-pine/10 px-2 py-0.5 text-[11px] text-pine">ใช้อยู่</span>
                  ) : (
                    <Button size="sm" onClick={() => void setActiveWorkspace(w.id)}>ใช้อันนี้</Button>
                  )}

                  <Button size="sm" onClick={() => { setEditing(w); setAdding(false) }}>แก้</Button>
                  <Button size="sm" variant="danger" onClick={() => setConfirmDelete(w.id)}>ลบ</Button>
                </div>

                {confirmDelete === w.id && (
                  <div className="flex items-center gap-3 rounded border border-danger bg-danger/5 px-3.5 py-3">
                    <span className="flex-1 text-[13px] text-muted">
                      เอา {w.id} ออกจาก pat — โฟลเดอร์กับ branch ในเครื่องไม่ถูกแตะต้อง
                    </span>
                    <Button size="sm" onClick={() => setConfirmDelete(null)}>ยกเลิก</Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(w.id)}>เอาออก</Button>
                  </div>
                )}

                {editing?.id === w.id && (
                  <div className="rounded border border-hair bg-surface px-4 py-4">
                    <WorkspaceForm
                      initial={w}
                      takenColors={workspaces.filter(x => x.id !== w.id).map(x => x.color)}
                      onSaved={() => void reload()}
                      onCancel={() => setEditing(null)}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {adding && (
          <div className="mx-5 mb-4 rounded-card border border-hair bg-paper px-4 py-4">
            <WorkspaceForm
              takenColors={workspaces.map(w => w.color)}
              onSaved={() => void reload()}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        {error && <div className="px-5 pb-3 text-[13px] text-danger">{error}</div>}

        <div className="flex items-center gap-3 border-t border-hair bg-paper px-5 py-3.5">
          <span className="text-[13px] text-faint">config เก็บที่ ~/.pat/ แก้ด้วย editor ได้ตรงๆ</span>
          <span className="flex-1" />
          <Link href="/sessions" className="text-[13px] text-pine hover:text-pine-deep">
            ดู session ย้อนหลัง →
          </Link>
        </div>
      </Card>
    </>
  )
}
