import { Fragment } from 'react'
import { Link } from 'wouter'
import { useStore } from '../store'
import { ColorDot, WorkspaceSelect } from './WorkspaceChip'

export interface Crumb {
  label: string
  /** ไม่ใส่ = คลิกไม่ได้ · ชิ้นสุดท้ายคลิกไม่ได้เสมอถึงจะใส่มา */
  href?: string
  mono?: boolean
}

interface Props {
  crumbs?: Crumb[]
  /** หน้าที่มี context bar ของตัวเองอยู่แล้ว (session/summary) ไม่ต้องโชว์ chip + git status ซ้ำ */
  showWorkspace?: boolean
}

/** header 52px ที่อยู่บนสุดของทุกหน้า — ตาม design doc 4.0 + breadcrumb */
export function Header({ crumbs = [], showWorkspace = true }: Props) {
  const {
    workspaces, activeWorkspaceId, gitStatus, gitStatusError, setActiveWorkspace, sessions,
  } = useStore()
  const active = workspaces.find(w => w.id === activeWorkspaceId)

  // นับทุก session ที่ pty ยังไม่ตาย ไม่ใช่แค่ working/waiting
  // เพราะ idle = ว่างรอคำสั่ง ยังพิมพ์ต่อได้ ถ้าซ่อนไปผู้ใช้จะลืมว่ามันค้างอยู่
  const running = sessions.filter(s => s.state !== 'closed')
  const waiting = running.some(s => s.state === 'waiting')

  return (
    <div className="flex h-[52px] items-center justify-between gap-4 border-b border-hair px-5">
      <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-2">
        <Link href="/" className="shrink-0 text-[15px] font-semibold">
          Defect fixer
        </Link>
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1
          const text = `text-[13px] ${crumb.mono ? 'font-mono text-xs' : ''}`
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <span className="shrink-0 text-line">/</span>
              {last || !crumb.href ? (
                <span aria-current={last ? 'page' : undefined} className={`truncate text-ink ${text}`}>
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className={`shrink-0 text-muted hover:text-ink ${text}`}>
                  {crumb.label}
                </Link>
              )}
            </Fragment>
          )
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-4">
        {showWorkspace && active && (
          <div className="flex items-center gap-2 text-[13px]">
            {workspaces.length > 1 ? (
              <WorkspaceSelect
                workspaces={workspaces}
                value={active.id}
                onChange={id => void setActiveWorkspace(id)}
              />
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <ColorDot color={active.color} />
                <span className="font-mono text-xs">{active.id}</span>
              </span>
            )}

            {gitStatusError ? (
              <span className="text-danger">· {gitStatusError}</span>
            ) : gitStatus ? (
              <>
                <span className="font-mono text-xs text-muted">{gitStatus.branch}</span>
                {gitStatus.isDirty ? (
                  <span className="inline-flex items-center gap-1.5 text-warn">
                    ·<span className="h-1.5 w-1.5 rounded-full bg-warn" />
                    มีไฟล์ค้าง {gitStatus.dirtyCount} ไฟล์
                  </span>
                ) : (
                  <span className="text-muted">· สะอาด</span>
                )}
              </>
            ) : (
              <span className="text-faint">· กำลังอ่านสถานะ…</span>
            )}
          </div>
        )}

        <RunningSessions count={running.length} waiting={waiting} />

        <Link href="/settings" aria-label="ตั้งค่า" className="text-base text-muted hover:text-ink">
          ⚙
        </Link>
      </div>
    </div>
  )
}

/** บอกตลอดว่ามี session ทำงานค้างอยู่กี่อัน — waiting = รอคนตอบ ต้องสะดุดตากว่า */
function RunningSessions({ count, waiting }: { count: number; waiting: boolean }) {
  if (count === 0) return null

  return (
    <Link
      href="/sessions"
      title={waiting ? 'มี session รอคุณตอบอยู่' : 'มี session กำลังทำงาน'}
      className={
        'inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[13px] transition-colors ' +
        (waiting
          ? 'border-warn/40 bg-warn/10 font-medium text-warn-deep hover:bg-warn/20'
          : 'border-line bg-paper text-muted hover:text-ink')
      }
    >
      <span aria-hidden className={waiting ? 'pat-pulse' : ''}>⟳</span>
      {count} session
    </Link>
  )
}
