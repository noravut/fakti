import { useState } from 'react'
import { Link } from 'wouter'
import type { Workspace } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { Header } from '../components/Header'
import { BackLink, useEscapeBack } from '../components/BackLink'
import { WorkspaceForm } from '../components/WorkspaceForm'
import { ColorDot } from '../components/WorkspaceChip'
import { parseBranchList } from '../format'
import { Button, Card, Input, SectionTitle } from '../components/ui'

export function Settings() {
  const {
    workspaces, activeWorkspaceId, sources, activeSourceId,
    refreshWorkspaces, refreshStatus, setActiveWorkspace, setActiveSource, myName, setMyName,
    protectedBranches, setProtectedBranches,
  } = useStore()
  const [editing, setEditing] = useState<Workspace | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState(myName ?? '')
  const [protectedDraft, setProtectedDraft] = useState(protectedBranches.join(', '))
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
                  <span className="text-xs text-faint">
                    {sources.find(s => s.id === (w.sourceId ?? activeSourceId))?.label ?? 'ไม่มี source'}
                  </span>
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

        <div className="border-t border-hair px-5 pb-4 pt-[18px]">
          <SectionTitle>ชื่อของคุณใน tracker</SectionTitle>
          <p className="mb-3 mt-1.5 text-[13px] text-faint">
            ใช้เทียบกับช่องผู้รับผิดชอบ เพื่อให้ตัวกรอง “ของฉัน” ในหน้า Defect ทำงานได้ —
            ต้องสะกดตรงกับที่ tracker บันทึกไว้เป๊ะๆ
          </p>
          <div className="flex items-center gap-2.5">
            <Input
              value={nameDraft}
              spellCheck={false}
              placeholder="เช่น Noravut Chanthalay"
              onChange={e => setNameDraft(e.target.value)}
              className="w-[280px]"
            />
            <Button
              size="sm"
              disabled={nameDraft.trim() === (myName ?? '')}
              onClick={() => void setMyName(nameDraft.trim() || null)}
            >
              บันทึก
            </Button>
            {myName && nameDraft.trim() === myName && (
              <span className="text-[13px] text-pine">บันทึกแล้ว</span>
            )}
          </div>
        </div>

        <div className="border-t border-hair px-5 pb-4 pt-[18px]">
          <SectionTitle>Branch ที่ห้ามแก้ทับ</SectionTitle>
          <p className="mb-3 mt-1.5 text-[13px] text-faint">
            อยู่บน branch พวกนี้แล้วจะเลือก “ทำต่อบน branch ปัจจุบัน” ไม่ได้ —
            คนละเรื่องกับ base branch ซึ่งแค่บอกว่าสร้าง branch ใหม่จากตรงไหน ·
            คั่นด้วยจุลภาค · ตั้งเฉพาะ repo ได้ที่ปุ่ม “แก้” ด้านบน
          </p>
          <div className="flex items-center gap-2.5">
            <Input
              value={protectedDraft}
              spellCheck={false}
              placeholder="main, master, develop"
              onChange={e => setProtectedDraft(e.target.value)}
              className="w-[380px] max-w-full"
            />
            <Button
              size="sm"
              disabled={parseBranchList(protectedDraft).join(',') === protectedBranches.join(',')}
              onClick={() => void setProtectedBranches(parseBranchList(protectedDraft))}
            >
              บันทึก
            </Button>
          </div>
        </div>

        <div className="border-t border-hair px-5 pb-4 pt-[18px]">
          <SectionTitle>Defect source ตั้งต้น</SectionTitle>
          <p className="mb-3 mt-1.5 text-[13px] text-faint">
            repo ที่ไม่ได้เลือก source ของตัวเองจะใช้ตัวนี้ — ตั้งค่าราย repo ได้ที่ปุ่ม “แก้” ด้านบน
          </p>

          <div className="overflow-hidden rounded-card border border-hair bg-paper">
            {sources.length === 0 ? (
              <div className="px-4 py-4 text-sm text-faint">
                ไม่มี source เลย — ตรวจ ~/.pat/sources.json
              </div>
            ) : (
              sources.map(s => (
                <div key={s.id} className="flex items-center gap-3 border-t border-hair px-4 py-3 first:border-t-0">
                  <span className="font-mono text-[13px] font-medium">{s.id}</span>
                  <span className="flex-1 truncate text-[13px] text-muted">{s.label}</span>
                  {s.network === 'internal' && (
                    <span className="rounded-chip bg-warn/10 px-2 py-0.5 text-[11px] text-warn-deep">
                      ในเน็ตเวิร์กบริษัท
                    </span>
                  )}
                  <span className="truncate font-mono text-xs text-faint">{s.baseUrl}</span>
                  {s.id === activeSourceId ? (
                    <span className="rounded-chip bg-pine/10 px-2 py-0.5 text-[11px] text-pine">ตั้งต้น</span>
                  ) : (
                    <Button size="sm" onClick={() => void setActiveSource(s.id)}>ใช้อันนี้</Button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-hair bg-paper px-5 py-3.5">
          <span className="text-[13px] text-faint">config เก็บที่ ~/.pat/ — sources.json แชร์เข้า repo ได้ ส่วน token อยู่ใน secrets.json</span>
          <span className="flex-1" />
          <Link href="/sessions" className="text-[13px] text-pine hover:text-pine-deep">
            ดู session ย้อนหลัง →
          </Link>
        </div>
      </Card>
    </>
  )
}
