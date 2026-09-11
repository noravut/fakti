import { useEffect } from 'react'
import { useLocation } from 'wouter'
import type { SessionState } from '@shared/types'
import { AGENT_LABELS } from '@shared/types'
import { useStore } from '../store'
import { relativeTime } from '../format'
import { BackLink, useEscapeBack } from '../components/BackLink'
import { ColorDot } from '../components/WorkspaceChip'
import { Button, Card, EmptyState, SectionTitle, StatusBadge } from '../components/ui'

/** สีมาจาก token ใน StatusBadge — ที่นี่เก็บแค่คำ */
const STATE_LABEL: Record<SessionState, string> = {
  working: 'กำลังทำงาน',
  waiting: 'รอคุณตอบ',
  idle: 'พร้อมรับคำสั่ง',
  closed: 'ปิดแล้ว',
}

export function Sessions() {
  const [, navigate] = useLocation()
  const { sessions, workspaces, refreshSessions } = useStore()
  useEscapeBack('/')

  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  return (
    <>
      <BackLink href="/" label="กลับไป Defect list" />

      <Card>
        <div className="px-5 pb-3 pt-4">
          <SectionTitle>Session ย้อนหลัง</SectionTitle>
        </div>

        <div className="mx-5 mb-4 overflow-hidden rounded-card border border-hair bg-paper">
          {sessions.length === 0 ? (
            <EmptyState
              title="ยังไม่เคยเปิด session"
              hint="เลือก defect จากหน้าแรก หรือสั่งงานเองแล้วให้ agent ลงมือ"
            />
          ) : (
            sessions.map(s => {
              const workspace = workspaces.find(w => w.id === s.workspaceId)
              return (
                <div key={s.id} className="flex items-center gap-3 border-t border-hair px-4 py-3 first:border-t-0">
                  {workspace ? (
                    <ColorDot color={workspace.color} />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-line" />
                  )}
                  <span className="font-mono text-sm font-medium">{s.branch}</span>
                  <span className="text-sm text-faint">{AGENT_LABELS[s.agent]}</span>
                  <span className="flex-1 truncate text-sm text-muted">
                    {s.feature ? s.feature.title : s.defects.map(d => d.key).join(' · ')}
                  </span>
                  <span className="text-sm text-faint">{relativeTime(s.createdAt)}</span>
                  <StatusBadge tone={s.state} className="w-23 justify-center">
                    {STATE_LABEL[s.state]}
                  </StatusBadge>
                  <Button size="sm" onClick={() => navigate(`/session/${s.id}`)}>เปิด</Button>
                  <Button size="sm" onClick={() => navigate(`/session/${s.id}/summary`)}>สรุป</Button>
                </div>
              )
            })
          )}
        </div>
      </Card>
    </>
  )
}
