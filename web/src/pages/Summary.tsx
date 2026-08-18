import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import type { DiffStat, Session as SessionRecord } from '@shared/types'
import { ApiError, api } from '../api'
import { useStore } from '../store'
import { useGoHomeWithMessage } from '../components/GoHome'
import { Header } from '../components/Header'
import { BackLink, useEscapeBack } from '../components/BackLink'
import { ColorDot } from '../components/WorkspaceChip'
import { Button, Card, DangerButton, ErrorBox, SectionTitle } from '../components/ui'

/** แถบสัดส่วน + / − ท้ายแถวไฟล์ กว้างสุด 60px ตาม design doc */
function DiffBar({ added, removed, max }: { added: number; removed: number; max: number }) {
  const scale = max > 0 ? 60 / max : 0
  const a = Math.max(added > 0 ? 2 : 0, Math.round(added * scale))
  const r = Math.max(removed > 0 ? 2 : 0, Math.round(removed * scale))
  return (
    <span className="inline-flex h-1.5 overflow-hidden rounded-[3px]" style={{ width: a + r }}>
      <span className="bg-pine" style={{ width: a }} />
      <span className="bg-danger" style={{ width: r }} />
    </span>
  )
}

export function Summary({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const goHome = useGoHomeWithMessage()
  const { workspaces, refreshSessions } = useStore()
  useEscapeBack(`/session/${id}`)

  const [session, setSession] = useState<SessionRecord | null>(null)
  const [diff, setDiff] = useState<DiffStat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [busy, setBusy] = useState(false)

  const workspace = workspaces.find(w => w.id === session?.workspaceId)

  useEffect(() => {
    void (async () => {
      try {
        setSession(await api.sessions.get(id))
        setDiff(await api.sessions.diff(id))
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          goHome('ไม่พบ session นี้ — อาจถูกลบไปแล้ว')
          return
        }
        setError(err instanceof Error ? err.message : 'โหลดสรุปไม่ได้')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function act(fn: () => Promise<unknown>, then?: () => void) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refreshSessions()
      then?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (error && !session) {
    return <ErrorBox title={error} action={<Button size="sm" onClick={() => navigate('/')}>กลับไป Defect list</Button>} />
  }
  if (!session || !workspace) {
    return (
      <Card>
        <Header showWorkspace={false} />
        <div className="px-5 py-8 text-[15px] text-faint">กำลังโหลดสรุป…</div>
      </Card>
    )
  }

  const files = diff?.files ?? []
  const commits = diff?.commits ?? []
  const maxChange = Math.max(1, ...files.map(f => f.added + f.removed))

  return (
    <>
      <BackLink href={`/session/${id}`} label="กลับไป session" />

      <Card>
        <Header
          showWorkspace={false}
          crumbs={[
            { label: 'Defect', href: '/' },
            { label: session.branch, href: `/session/${id}`, mono: true },
            { label: 'สรุป' },
          ]}
        />

        <div className="flex flex-col gap-2 border-b border-hair px-5 py-[18px]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5">
              <ColorDot color={workspace.color} />
              <span className="font-mono text-xs">{workspace.id}</span>
            </span>
            <span className="text-line">·</span>
            <span className="font-mono text-[13px] font-medium">{session.branch}</span>
          </div>
          <div className="flex gap-3.5">
            <span className="font-mono text-[13px]">{files.length} ไฟล์เปลี่ยน</span>
            <span className="font-mono text-[13px] text-pine">+{diff?.totalAdded ?? 0}</span>
            <span className="font-mono text-[13px] text-danger">−{diff?.totalRemoved ?? 0}</span>
            <span className="font-mono text-[13px] text-faint">· {commits.length} commit</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-5 py-4">
          <SectionTitle>Commit</SectionTitle>
          <div className="overflow-hidden rounded-card border border-hair bg-paper">
            {commits.length === 0 ? (
              <div className="px-4 py-3 text-sm text-faint">ยังไม่มี commit บน branch นี้</div>
            ) : (
              commits.map(c => (
                <div key={c.hash} className="flex flex-col gap-1 border-t border-hair px-4 py-3 first:border-t-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-[13px] font-medium text-muted">{c.hash.slice(0, 7)}</span>
                    <span className="text-sm">{c.subject}</span>
                  </div>
                  <span className="pl-[76px] font-mono text-xs text-faint">{c.fileCount} ไฟล์</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 px-5 pb-4 pt-1">
          <SectionTitle>ไฟล์ที่เปลี่ยน</SectionTitle>
          <div className="overflow-hidden rounded-card border border-hair bg-paper">
            {files.length === 0 ? (
              <div className="px-4 py-3 text-sm text-faint">ยังไม่มีไฟล์เปลี่ยนเทียบกับตอนเริ่ม session</div>
            ) : (
              files.map(f => (
                <div key={f.path} className="flex items-center gap-3.5 border-t border-hair px-4 py-2.5 first:border-t-0">
                  <span className="flex-1 truncate font-mono text-[13px]">{f.path}</span>
                  <span className="w-11 text-right font-mono text-[13px] text-pine">+{f.added}</span>
                  <span className="w-9 text-right font-mono text-[13px] text-danger">−{f.removed}</span>
                  <DiffBar added={f.added} removed={f.removed} max={maxChange} />
                </div>
              ))
            )}
          </div>
        </div>

        {error && <div className="border-t border-hair px-5 py-3 text-[13px] text-danger">{error}</div>}

        <div className="flex items-center gap-2.5 border-t border-hair bg-paper px-5 py-3.5">
          <Button disabled={busy} onClick={() => void act(() => api.sessions.openEditor(id))}>
            เปิดใน VSCode
          </Button>
          <Button onClick={() => navigate(`/session/${id}`)}>กลับเข้า session</Button>
          <span className="flex-1" />
          <Button variant="danger" disabled={busy} onClick={() => setConfirmDiscard(true)}>
            ทิ้ง branch นี้
          </Button>
          <Button variant="primary" onClick={() => navigate('/')}>เสร็จ</Button>
        </div>
      </Card>

      {confirmDiscard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/15 p-9"
          onKeyDown={e => e.key === 'Escape' && setConfirmDiscard(false)}
        >
          <button
            type="button"
            aria-label="ปิด"
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmDiscard(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex w-[480px] max-w-full flex-col gap-3 rounded-card border border-line bg-paper p-[22px]"
          >
            <span className="text-base font-semibold">
              ทิ้ง branch <span className="font-mono text-sm">{session.branch}</span>?
            </span>
            <span className="text-sm leading-[1.7] text-muted">
              {session.createdBranch ? (
                <>
                  จะลบ branch พร้อม commit {commits.length} ตัว
                  {commits.length > 0 && (
                    <> ({commits.map(c => c.hash.slice(0, 7)).join(', ')})</>
                  )}{' '}
                  — working tree กลับไปที่{' '}
                  <span className="font-mono text-[13px]">{workspace.baseBranch}</span> เอาคืนไม่ได้
                </>
              ) : (
                <>
                  session นี้ทำงานบน branch เดิมของคุณ จะล้างไฟล์ที่ยังไม่ commit แล้วกลับไปที่{' '}
                  <span className="font-mono text-[13px]">{workspace.baseBranch}</span>{' '}
                  — <span className="font-mono text-[13px]">{session.branch}</span> ไม่ถูกลบ
                </>
              )}
            </span>
            <div className="mt-1 flex justify-end gap-2.5">
              <Button onClick={() => setConfirmDiscard(false)} disabled={busy}>ยกเลิก</Button>
              <DangerButton
                disabled={busy}
                onClick={() => void act(() => api.sessions.discard(id), () => navigate('/'))}
              >
                ทิ้ง branch
              </DangerButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
