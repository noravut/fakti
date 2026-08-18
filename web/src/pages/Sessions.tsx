import { useEffect } from 'react'
import { useLocation } from 'wouter'
import type { SessionState } from '@shared/types'
import { useStore } from '../store'
import { relativeTime } from '../format'
import { Header } from '../components/Header'
import { BackLink, useEscapeBack } from '../components/BackLink'
import { ColorDot } from '../components/WorkspaceChip'
import { Button, Card, SectionTitle } from '../components/ui'

const STATE_LABEL: Record<SessionState, { label: string; color: string }> = {
  working: { label: 'กำลังทำงาน', color: '#A66A0F' },
  waiting: { label: 'รอคุณตอบ', color: '#7A4E0B' },
  idle: { label: 'พร้อมรับคำสั่ง', color: '#5C6068' },
  closed: { label: 'ปิดแล้ว', color: '#8E939C' },
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
        <Header crumbs={[{ label: 'Session ที่เปิดอยู่' }]} />

        <div className="px-5 pb-3 pt-[18px]">
          <SectionTitle>Session ย้อนหลัง</SectionTitle>
        </div>

        <div className="mx-5 mb-4 overflow-hidden rounded-card border border-hair bg-paper">
          {sessions.length === 0 ? (
            <div className="px-4 py-4 text-sm text-faint">ยังไม่เคยเปิด session</div>
          ) : (
            sessions.map(s => {
              const workspace = workspaces.find(w => w.id === s.workspaceId)
              const state = STATE_LABEL[s.state]
              return (
                <div key={s.id} className="flex items-center gap-3 border-t border-hair px-4 py-3 first:border-t-0">
                  {workspace ? (
                    <ColorDot color={workspace.color} />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-line" />
                  )}
                  <span className="font-mono text-[13px] font-medium">{s.branch}</span>
                  <span className="flex-1 truncate text-[13px] text-muted">
                    {s.defects.map(d => d.key).join(' · ')}
                  </span>
                  <span className="text-[13px] text-faint">{relativeTime(s.createdAt)}</span>
                  <span className="w-[92px] text-right text-[13px]" style={{ color: state.color }}>
                    {state.label}
                  </span>
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
