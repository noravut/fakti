import { useLocation } from 'wouter'
import { useStore } from '../store'
import { Header } from '../components/Header'
import { BackLink, useEscapeBack } from '../components/BackLink'
import { WorkspaceForm } from '../components/WorkspaceForm'
import { Card } from '../components/ui'

/** หน้าแรกสุดตอนยังไม่มี repo ลงทะเบียนเลย */
export function Setup() {
  const [, navigate] = useLocation()
  const { workspaces, refreshWorkspaces, refreshStatus } = useStore()

  // ยังไม่มี repo เลย = ไม่มีหน้าให้กลับไป ปุ่มย้อนกลับกับ Esc จึงไม่ควรมี
  const canLeave = workspaces.length > 0
  useEscapeBack(canLeave ? '/' : null)

  return (
    <>
      {canLeave && <BackLink href="/" label="กลับไป Defect list" />}

      <Card>
        <Header crumbs={[{ label: 'เพิ่ม repo' }]} showWorkspace={canLeave} />

        <div className="flex flex-col gap-1.5 border-b border-hair px-5 py-[18px]">
          <span className="text-[15px] font-semibold">เพิ่ม repo แรกก่อนเริ่ม</span>
          <span className="text-[13px] text-muted">
            pat ต้องรู้ว่าจะให้ Claude Code ไปแก้โค้ดที่ไหน — ชี้ไปที่โฟลเดอร์ git repo ในเครื่อง
          </span>
        </div>

        <div className="px-5 py-5">
          <WorkspaceForm
            takenColors={workspaces.map(w => w.color)}
            onSaved={async () => {
              await refreshWorkspaces()
              await refreshStatus()
              navigate('/')
            }}
          />
        </div>
      </Card>
    </>
  )
}
