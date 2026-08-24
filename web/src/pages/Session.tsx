import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import type { DiffStat, Session as SessionRecord, SessionState } from '@shared/types'
import { ApiError, api } from '../api'
import { useStore } from '../store'
import { useGoHomeWithMessage } from '../components/GoHome'
import { Terminal } from '../components/Terminal'
import { Header } from '../components/Header'
import { BackLink } from '../components/BackLink'
import { ColorDot } from '../components/WorkspaceChip'
import { Button, Card, DangerButton, ErrorBox, Input } from '../components/ui'

const STATE_STYLE: Record<SessionState, { label: string; color: string; dot: string; pulse: boolean; bold: boolean }> = {
  working: { label: 'กำลังทำงาน', color: '#A66A0F', dot: '#A66A0F', pulse: true, bold: false },
  waiting: { label: 'รอคุณตอบ', color: '#7A4E0B', dot: '#7A4E0B', pulse: false, bold: true },
  idle: { label: 'พร้อมรับคำสั่ง', color: '#5C6068', dot: '#8E939C', pulse: false, bold: false },
  closed: { label: 'จบแล้ว', color: '#1F5F52', dot: '#1F5F52', pulse: false, bold: false },
}

export function Session({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const goHome = useGoHomeWithMessage()
  const { workspaces, refreshSessions } = useStore()

  const [session, setSession] = useState<(SessionRecord & { live: boolean }) | null>(null)
  const [state, setState] = useState<SessionState>('working')
  const [diff, setDiff] = useState<DiffStat | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameTo, setRenameTo] = useState('')
  const [takenBranches, setTakenBranches] = useState<string[]>([])
  const menuRef = useRef<HTMLDivElement>(null)

  const workspace = workspaces.find(w => w.id === session?.workspaceId)

  const load = useCallback(async () => {
    try {
      const s = await api.sessions.get(id)
      setSession(s)
      setState(s.state)
      setDiff(await api.sessions.diff(id).catch(() => null))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        goHome('ไม่พบ session นี้ — อาจถูกลบไปแล้ว')
        return
      }
      setError(err instanceof Error ? err.message : 'โหลด session ไม่ได้')
    }
    // goHome ถูกสร้างใหม่ทุก render จงใจไม่ใส่เป็น dep ไม่งั้น load วนไม่จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // ปิดเมนูเมื่อคลิกที่อื่น — ในหน้านี้ห้าม bind Esc เพราะ terminal ต้องใช้
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  // รายชื่อ branch ไว้กันตั้งชื่อซ้ำ — ดึงตอนเปิด dialog เท่านั้น
  useEffect(() => {
    if (!renaming || !session) return
    let cancelled = false
    void api.workspaces.branches(session.workspaceId)
      .then(list => {
        if (!cancelled) setTakenBranches(list.map(b => b.name))
      })
      .catch(() => { /* ตรวจซ้ำไม่ได้ก็ปล่อยให้ server ตอบ 409 แทน */ })
    return () => { cancelled = true }
  }, [renaming, session?.workspaceId])

  // สถานะ "รอคุณตอบ" ต้องเห็นได้จาก tab อื่น
  useEffect(() => {
    document.title = state === 'waiting' ? '● รอคุณตอบ — Defect fixer' : 'Defect fixer'
    return () => {
      document.title = 'Defect fixer'
    }
  }, [state])

  /** defect ไหนมี commit อ้างถึงแล้ว ถือว่าแก้เสร็จ — ที่เหลือเดาจากลำดับ */
  const defectStatus = useMemo(() => {
    const subjects = (diff?.commits ?? []).map(c => c.subject).join('\n')
    const done = new Set(
      (session?.defects ?? []).filter(d => subjects.includes(d.key)).map(d => d.id),
    )
    const nextUp = (session?.defects ?? []).find(d => !done.has(d.id))
    return (defectId: string) => {
      if (done.has(defectId)) return { label: '✓ แก้แล้ว', color: '#1F5F52' }
      if (state === 'working' && nextUp?.id === defectId) return { label: '⟳ กำลังแก้', color: '#A66A0F' }
      return { label: '○ รออยู่', color: '#8E939C' }
    }
  }, [diff, session, state])

  async function doRename() {
    await act(
      async () => {
        const updated = await api.sessions.rename(id, renameTo)
        setSession(s => (s ? { ...s, branch: updated.branch } : s))
      },
      () => setRenaming(false),
    )
  }

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
    return (
      <ErrorBox
        title={error}
        action={<Button size="sm" onClick={() => navigate('/')}>กลับไป Defect list</Button>}
      />
    )
  }

  if (!session || !workspace) {
    return (
      <Card>
        <Header showWorkspace={false} />
        <div className="px-5 py-8 text-[15px] text-faint">กำลังเปิด session…</div>
      </Card>
    )
  }

  const style = STATE_STYLE[state]
  // branch ของผู้ใช้เอง fakti ไม่มีสิทธิ์เปลี่ยนชื่อหรือลบ
  const ownsBranch = session.branchOwnership === 'created'
  const renameValid = /^[a-zA-Z0-9._/-]+$/.test(renameTo) && !renameTo.startsWith('-')
  const renameTaken = renameValid && renameTo !== session.branch && takenBranches.includes(renameTo)

  return (
    <>
      {/* session ยังรันอยู่เบื้องหลัง กลับหน้าหลักไม่ได้ทำให้มันตาย */}
      <BackLink href="/" label="ย่อเก็บ" />

      <Card>
        <Header
          showWorkspace={false}
          crumbs={[
            { label: 'Defect', href: '/' },
            { label: session.branch, mono: true },
          ]}
        />

        <div className="flex h-[52px] items-center justify-between border-b border-hair px-5">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5">
              <ColorDot color={workspace.color} />
              <span className="font-mono text-xs">{workspace.id}</span>
            </span>
            <span className="text-line">·</span>
            <span className="font-mono text-[13px] font-medium">{session.branch}</span>
          </div>

          <div className="flex items-center gap-4">
            <span
              className={`inline-flex items-center gap-[7px] text-[13px] ${style.bold ? 'font-semibold' : 'font-medium'}`}
              style={{ color: style.color }}
            >
              <span
                className={`h-2 w-2 rounded-full ${style.pulse ? 'pat-pulse' : ''}`}
                style={{ background: style.dot }}
              />
              {style.label}
            </span>

            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="เมนู session"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(o => !o)}
                className="rounded border border-line bg-paper px-2 py-1 text-[13px] text-muted hover:text-ink"
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 z-20 w-[240px] overflow-hidden rounded-card border border-line bg-paper shadow-sm">
                  {ownsBranch && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false)
                          setRenameTo(session.branch)
                          setRenaming(true)
                        }}
                        className="w-full px-4 py-2.5 text-left text-[13px] hover:bg-hairline"
                      >
                        เปลี่ยนชื่อ branch
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false)
                          setConfirmDelete(true)
                        }}
                        className="w-full border-t border-hair px-4 py-2.5 text-left text-[13px] text-danger hover:bg-danger/5"
                      >
                        ลบ branch นี้
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={!session.live}
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirmClose(true)
                    }}
                    className="w-full border-t border-hair px-4 py-2.5 text-left text-[13px] text-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:text-faint"
                  >
                    ปิด session นี้
                  </button>
                  <div className="border-t border-hair px-4 py-2 text-[11px] text-faint">
                    {!ownsBranch
                      ? `${session.branch} เป็น branch ของคุณเอง fakti ไม่แตะชื่อหรือลบให้`
                      : session.live
                        ? 'ปิด session = หยุด claude จริงๆ แต่ branch กับงานที่ทำไว้ยังอยู่'
                        : 'session นี้ปิดไปแล้ว'}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-b border-hair">
          {session.defects.map(d => {
            const status = defectStatus(d.id)
            return (
              <div key={d.id} className="flex items-center gap-3 border-t border-hairline px-5 py-[9px] first:border-t-0">
                <span className="font-mono text-[13px] font-medium">{d.key}</span>
                <span className="flex-1 truncate text-sm">{d.title}</span>
                <span className="text-[13px]" style={{ color: status.color }}>{status.label}</span>
              </div>
            )
          })}
        </div>

        {session.live ? (
          <Terminal
            sessionId={id}
            onState={setState}
            onDiff={setDiff}
            onExit={() => setState('closed')}
            onDisconnect={() => void load()}
          />
        ) : (
          <div className="flex flex-col items-center gap-3 bg-term-bg px-6 py-12 text-center">
            <span className="font-mono text-[13px] text-term-dim">
              session นี้ปิดไปแล้ว — branch {session.branch} ยังอยู่ครบ
            </span>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void act(() => api.sessions.reopen(id), () => void load())}
            >
              เปิด session ใหม่บน branch เดิม
            </Button>
          </div>
        )}

        {error && <div className="border-t border-hair px-5 py-3 text-[13px] text-danger">{error}</div>}

        <div className="flex items-center gap-4 border-t border-hair bg-paper px-5 py-3">
          <span className="font-mono text-[13px]">{diff?.files.length ?? 0} ไฟล์เปลี่ยน</span>
          <span className="font-mono text-[13px] text-pine">+{diff?.totalAdded ?? 0}</span>
          <span className="font-mono text-[13px] text-danger">−{diff?.totalRemoved ?? 0}</span>
          <span className="flex-1" />
          <Button disabled={busy} onClick={() => void act(() => api.sessions.openEditor(id))}>
            เปิดใน VSCode
          </Button>
          <Button onClick={() => navigate(`/session/${id}/summary`)}>ดูสรุป</Button>
        </div>
      </Card>

      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/15 p-9">
          <button
            type="button"
            aria-label="ปิดหน้าต่าง"
            className="absolute inset-0 cursor-default"
            onClick={() => setRenaming(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex w-[480px] max-w-full flex-col gap-3 rounded-card border border-line bg-paper p-[22px]"
          >
            <span className="text-base font-semibold">เปลี่ยนชื่อ branch</span>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] text-faint">
                ชื่อเดิม <span className="font-mono">{session.branch}</span>
              </span>
              <Input
                autoFocus
                value={renameTo}
                spellCheck={false}
                onChange={e => setRenameTo(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && renameValid && !renameTaken) void doRename()
                }}
              />
              {!renameValid && renameTo !== '' && (
                <span className="text-[13px] text-danger">ใช้ได้แค่ a-z 0-9 . _ / -</span>
              )}
              {renameTaken && <span className="text-[13px] text-danger">มี branch ชื่อนี้อยู่แล้ว</span>}
            </div>
            <div className="mt-1 flex justify-end gap-2.5">
              <Button onClick={() => setRenaming(false)} disabled={busy}>ยกเลิก</Button>
              <Button
                variant="primary"
                disabled={busy || !renameValid || renameTaken || renameTo === session.branch}
                onClick={() => void doRename()}
              >
                เปลี่ยนชื่อ
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/15 p-9">
          <button
            type="button"
            aria-label="ปิดหน้าต่าง"
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmDelete(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex w-[480px] max-w-full flex-col gap-3 rounded-card border border-line bg-paper p-[22px]"
          >
            <span className="text-base font-semibold">
              ลบ branch <span className="font-mono text-sm">{session.branch}</span>?
            </span>
            <span className="text-sm leading-[1.7] text-muted">
              claude จะถูกหยุด แล้วลบ branch นี้ทิ้งพร้อม commit
              {(diff?.commits.length ?? 0) > 0 && <> {diff?.commits.length} ตัว</>}{' '}
              และไฟล์ที่ยังไม่ commit — working tree กลับไปที่{' '}
              <span className="font-mono text-[13px]">{workspace.baseBranch}</span> เอาคืนไม่ได้
            </span>
            <div className="mt-1 flex justify-end gap-2.5">
              <Button onClick={() => setConfirmDelete(false)} disabled={busy}>ยกเลิก</Button>
              <DangerButton
                disabled={busy}
                onClick={() => void act(() => api.sessions.discard(id), () => navigate('/'))}
              >
                ลบ branch
              </DangerButton>
            </div>
          </div>
        </div>
      )}

      {confirmClose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/15 p-9">
          <button
            type="button"
            aria-label="ปิดหน้าต่าง"
            className="absolute inset-0 cursor-default"
            onClick={() => setConfirmClose(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex w-[480px] max-w-full flex-col gap-3 rounded-card border border-line bg-paper p-[22px]"
          >
            <span className="text-base font-semibold">
              ปิด session บน <span className="font-mono text-sm">{session.branch}</span>?
            </span>
            <span className="text-sm leading-[1.7] text-muted">
              claude จะถูกหยุดจริงๆ บทสนทนาที่ค้างอยู่หายไป — แต่ branch,
              commit และไฟล์ที่แก้ไปแล้วยังอยู่ครบ เปิด session ใหม่บน branch เดิมได้ทีหลัง
              <br />
              <span className="text-faint">ถ้าแค่อยากไปทำอย่างอื่นก่อน กด "ย่อเก็บ" มุมซ้ายบนพอ</span>
            </span>
            <div className="mt-1 flex justify-end gap-2.5">
              <Button onClick={() => setConfirmClose(false)} disabled={busy}>ยกเลิก</Button>
              <DangerButton
                disabled={busy}
                onClick={() => void act(
                  () => api.sessions.close(id),
                  () => {
                    setConfirmClose(false)
                    navigate(`/session/${id}/summary`)
                  },
                )}
              >
                ปิด session
              </DangerButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
