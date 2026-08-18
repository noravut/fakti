import { useEffect, useRef, useState } from 'react'
import type { Defect, DirtyStrategy, Session, Workspace } from '@shared/types'
import { ApiError } from '../api'
import { suggestBranch } from '../format'
import { Button, Input } from './ui'
import { WorkspaceChip } from './WorkspaceChip'

export interface ConfirmPayload {
  mode: 'new' | 'append'
  branch: string
  sessionId?: string
  dirtyStrategy?: DirtyStrategy
}

interface Props {
  defects: Defect[]
  workspace: Workspace
  /** session ที่ยังเปิดอยู่บน workspace นี้ — ให้เลือก "ต่อใน session ที่เปิดอยู่" ได้ */
  openSessions: Session[]
  /** จำนวนไฟล์ค้างที่รู้ตั้งแต่ก่อนเปิด dialog (0 = สะอาด) */
  dirtyCount: number
  onCancel: () => void
  onSubmit: (payload: ConfirmPayload) => Promise<void>
}

export function ConfirmDialog({
  defects, workspace, openSessions, dirtyCount, onCancel, onSubmit,
}: Props) {
  const [mode, setMode] = useState<'new' | 'append'>('new')
  const [branch, setBranch] = useState(() => suggestBranch(defects))
  const [sessionId, setSessionId] = useState(openSessions[0]?.id ?? '')
  const [dirty, setDirty] = useState(dirtyCount)
  const [dirtyStrategy, setDirtyStrategy] = useState<DirtyStrategy | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const branchRef = useRef<HTMLInputElement>(null)

  useEffect(() => branchRef.current?.focus(), [])

  const branchValid = /^[a-zA-Z0-9._/-]+$/.test(branch) && !branch.startsWith('-')
  // ต่อใน session เดิมไม่ต้องแตะ working tree เลย เรื่องไฟล์ค้างจึงไม่เกี่ยว
  const needsDirtyChoice = mode === 'new' && dirty > 0 && !dirtyStrategy
  const canSubmit = !busy && !needsDirtyChoice
    && (mode === 'append' ? sessionId !== '' : branchValid)

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(
        mode === 'append'
          ? { mode, branch, sessionId }
          : { mode, branch, dirtyStrategy },
      )
    } catch (err) {
      const conflict = err instanceof ApiError ? err.dirty : null
      if (conflict) {
        // working tree เพิ่งสกปรกระหว่างที่ dialog เปิดอยู่
        setDirty(conflict.dirtyCount)
        setDirtyStrategy(undefined)
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : 'เริ่ม session ไม่สำเร็จ')
      }
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/15 p-9"
      onKeyDown={e => {
        if (e.key === 'Escape') onCancel()
        if (e.key === 'Enter' && !e.shiftKey) void submit()
      }}
    >
      <button type="button" aria-label="ปิด" className="absolute inset-0 cursor-default" onClick={onCancel} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`เริ่มแก้ ${defects.length} รายการ`}
        className="relative flex w-[560px] max-w-full flex-col gap-4 rounded-card border border-line bg-paper p-6"
      >
        {mode === 'new' && dirty > 0 && (
          <div className="flex flex-col gap-2.5 rounded border border-warn/40 bg-warn/10 px-3.5 py-3">
            <span className="inline-flex items-center gap-[7px] text-sm text-warn-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" />
              working tree มีไฟล์ค้าง {dirty} ไฟล์ — เลือกก่อนเริ่ม
            </span>
            <div className="flex gap-2.5">
              <Button
                size="sm"
                variant={dirtyStrategy === 'stash' ? 'primary' : 'warn'}
                onClick={() => setDirtyStrategy('stash')}
              >
                stash ให้
              </Button>
              <Button
                size="sm"
                variant={dirtyStrategy === 'keep' ? 'primary' : 'default'}
                onClick={() => setDirtyStrategy('keep')}
              >
                ทำต่อบน branch ปัจจุบัน
              </Button>
            </div>
            {dirtyStrategy === 'keep' && (
              <span className="text-[13px] text-muted">
                จะไม่แตก branch ใหม่ — งานทั้งหมดลงบน branch ที่เปิดอยู่ตอนนี้
              </span>
            )}
          </div>
        )}

        <span className="text-base font-semibold">เริ่มแก้ {defects.length} รายการ</span>

        <div className="flex items-center gap-2">
          <WorkspaceChip workspace={workspace} />
          <span className="font-mono text-xs text-faint">· {workspace.path}</span>
        </div>

        <div className="overflow-hidden rounded-card border border-hair">
          <label
            className={`flex cursor-pointer gap-3 px-4 py-3.5 ${mode === 'new' ? 'bg-pine/[0.04]' : ''}`}
          >
            <input
              type="radio"
              name="session-mode"
              checked={mode === 'new'}
              onChange={() => setMode('new')}
              className="mt-1 h-4 w-4 shrink-0 accent-pine"
            />
            <div className="flex flex-1 flex-col gap-2">
              <span className="text-[15px] font-medium">session ใหม่</span>
              <div className="flex items-center gap-2.5">
                <span className="text-[13px] text-faint">branch</span>
                <Input
                  ref={branchRef}
                  value={branch}
                  spellCheck={false}
                  onChange={e => setBranch(e.target.value)}
                  onFocus={() => setMode('new')}
                  className="flex-1"
                />
              </div>
              {!branchValid && (
                <span className="text-[13px] text-danger">ใช้ได้แค่ a-z 0-9 . _ / -</span>
              )}
              <span className="text-[13px] text-faint">
                แตกจาก <span className="font-mono">{workspace.baseBranch}</span>
              </span>
            </div>
          </label>

          {openSessions.length > 0 && (
            <label className="flex cursor-pointer gap-3 border-t border-hair px-4 py-3.5">
              <input
                type="radio"
                name="session-mode"
                checked={mode === 'append'}
                onChange={() => setMode('append')}
                className="mt-1 h-4 w-4 shrink-0 accent-pine"
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-[15px] text-muted">ต่อใน session ที่เปิดอยู่</span>
                {openSessions.map(s => (
                  <label key={s.id} className="flex cursor-pointer items-center gap-2">
                    {openSessions.length > 1 && (
                      <input
                        type="radio"
                        name="append-target"
                        checked={sessionId === s.id}
                        onChange={() => {
                          setSessionId(s.id)
                          setMode('append')
                        }}
                        className="h-3.5 w-3.5 accent-pine"
                      />
                    )}
                    <WorkspaceChip workspace={workspace} />
                    <span className="font-mono text-xs text-muted">· {s.branch}</span>
                    <span className="text-[13px] text-faint">· {s.defectIds.length} defect</span>
                  </label>
                ))}
              </div>
            </label>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-faint">รวมอยู่ใน</span>
          {defects.map(d => (
            <div key={d.id} className="flex items-center gap-2.5">
              <span className="text-[13px] text-pine">✓</span>
              <span className="font-mono text-[13px] font-medium">{d.key}</span>
              <span className="truncate text-sm">{d.title}</span>
            </div>
          ))}
        </div>

        {error && <span className="whitespace-pre-wrap text-[13px] text-danger">{error}</span>}

        <div className="mt-1 flex justify-end gap-2.5">
          <Button onClick={onCancel} disabled={busy}>ยกเลิก</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'กำลังเริ่ม…' : 'เริ่มแก้'}
          </Button>
        </div>
      </div>
    </div>
  )
}
