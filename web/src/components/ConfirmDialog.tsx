import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  BranchChoice, BranchInfo, Defect, DirtyStrategy, FeatureSpec, Session, SessionAgent, Workspace,
} from '@shared/types'
import { AGENT_LABELS, SESSION_AGENTS } from '@shared/types'
import { ApiError, api } from '../api'
import { relativeTime, suggestBranch, suggestFeatureBranch } from '../format'
import { Button, Input } from './ui'
import { WorkspaceChip } from './WorkspaceChip'

/** มี branch เยอะกว่านี้ถึงจะมีช่องค้นหา */
const SEARCH_THRESHOLD = 10

type Mode = BranchChoice['kind'] | 'append'

export interface ConfirmPayload {
  mode: 'new' | 'append'
  agent?: SessionAgent
  branch: BranchChoice
  sessionId?: string
  dirtyStrategy?: DirtyStrategy
  /** prompt ที่ผู้ใช้อ่าน/แก้แล้ว — ไม่ส่ง = ให้ server สร้างเอง */
  prompt?: string
}

interface Props {
  /** defect จาก tracker — feature session ส่ง [] มา */
  defects: Defect[]
  /** มีค่า = เริ่ม feature session แทนการแก้ defect */
  feature?: FeatureSpec
  workspace: Workspace
  /** session ที่ยังเปิดอยู่บน workspace นี้ — ให้เลือก "ต่อใน session ที่เปิดอยู่" ได้ */
  openSessions: Session[]
  /** จำนวนไฟล์ค้างที่รู้ตั้งแต่ก่อนเปิด dialog (0 = สะอาด) */
  dirtyCount: number
  onCancel: () => void
  onSubmit: (payload: ConfirmPayload) => Promise<void>
}

export function ConfirmDialog({
  defects, feature, workspace, openSessions, dirtyCount, onCancel, onSubmit,
}: Props) {
  const [mode, setMode] = useState<Mode>('new')
  const [agent, setAgent] = useState<SessionAgent>('claude')
  const [sessionId, setSessionId] = useState(openSessions[0]?.id ?? '')
  const [dirty, setDirty] = useState(dirtyCount)
  const [dirtyStrategy, setDirtyStrategy] = useState<DirtyStrategy | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(() => (feature ? suggestFeatureBranch(feature.title) : suggestBranch(defects)))
  const [from, setFrom] = useState(workspace.baseBranch)
  const [existing, setExisting] = useState('')
  const [search, setSearch] = useState('')
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [branchError, setBranchError] = useState<string | null>(null)

  // ร่าง prompt ที่จะเขียนลง .pat-task.md — ผู้ใช้เปิดดู/แก้ได้ก่อนเริ่ม
  const [prompt, setPrompt] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => nameRef.current?.focus(), [])

  useEffect(() => {
    let cancelled = false
    void api.workspaces.branches(workspace.id)
      .then(list => {
        if (cancelled) return
        setBranches(list)
        setExisting(list.find(b => !b.isProtected)?.name ?? '')
      })
      .catch(err => {
        if (!cancelled) setBranchError(err instanceof Error ? err.message : 'อ่านรายชื่อ branch ไม่ได้')
      })
    return () => { cancelled = true }
  }, [workspace.id])

  useEffect(() => {
    let cancelled = false
    void api.sessions.previewPrompt(workspace.id, defects.map(d => d.id), feature)
      .then(res => {
        if (!cancelled) setPrompt(res.prompt)
      })
      .catch(() => {
        // โหลดร่างไม่ได้ไม่ถึงกับบล็อก — เริ่มได้ แต่ server จะสร้าง prompt เองแบบเดิม
        if (!cancelled) setPromptError('โหลดร่าง prompt ไม่ได้ — ถ้าเริ่มเลย ระบบจะสรุปให้เองแบบเดิม')
      })
    return () => { cancelled = true }
    // defects ถูกเลือกจบก่อนเปิด dialog — ยึดชุดตอน mount พอ
  }, [workspace.id])

  // Esc ปิดได้เสมอ ไม่ว่า focus จะอยู่ตรงไหนใน dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // กด Tab แล้วต้องวนอยู่ใน dialog ไม่หลุดไปหน้าเบื้องหลัง
  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const focusable = [...el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter(x => x.offsetParent !== null)
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [])

  const current = branches.find(b => b.isCurrent)
  const onProtected = current?.isProtected ?? false
  // ตัดออกเฉพาะ branch ที่ห้ามแก้ทับ — baseBranch อาจเป็น branch งานที่ทำต่อได้ตามปกติ
  const others = useMemo(() => branches.filter(b => !b.isProtected), [branches])
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? others.filter(b => b.name.toLowerCase().includes(q)) : others
  }, [others, search])

  const nameValid = /^[a-zA-Z0-9._/-]+$/.test(name) && !name.startsWith('-')
  const duplicate = nameValid && branches.some(b => b.name === name)
  const selected = others.find(b => b.name === existing)

  const canUseExisting = others.length > 0
  const canUseCurrent = Boolean(current) && !onProtected
  const canAppend = openSessions.length > 0

  // รายการที่โชว์ใต้หัว dialog — feature ใช้ REQ แทน defect
  const items = feature
    ? feature.requirements.map(r => ({ id: r.key, key: r.key, title: r.text }))
    : defects
  const heading = feature ? `เริ่มทำ ${feature.title}` : `เริ่มแก้ ${defects.length} รายการ`

  const ready =
    mode === 'append' ? sessionId !== ''
      : mode === 'existing' ? existing !== ''
        : mode === 'current' ? canUseCurrent
          : nameValid && !duplicate

  // ต่อใน session เดิมไม่ต้องแตะ working tree เลย เรื่องไฟล์ค้างจึงไม่เกี่ยว
  const needsDirtyChoice = mode !== 'append' && dirty > 0 && !dirtyStrategy
  const canSubmit = !busy && !needsDirtyChoice && ready

  /** เหลือทางเลือกเดียวก็ไม่ต้องให้เลือก — แสดงเป็นข้อความพอ */
  const optionCount = 1 + Number(canUseExisting) + Number(canUseCurrent) + Number(canAppend)
  const single = optionCount === 1

  function choice(): BranchChoice {
    if (mode === 'existing') return { kind: 'existing', name: existing }
    if (mode === 'current') return { kind: 'current' }
    return { kind: 'new', name, from }
  }

  async function submit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(
        mode === 'append'
          ? { mode: 'append', branch: choice(), sessionId }
          : { mode: 'new', agent, branch: choice(), dirtyStrategy, prompt: prompt.trim() ? prompt : undefined },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/15 p-9">
      <button type="button" aria-label="ปิด" className="absolute inset-0 cursor-default" onClick={onCancel} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onKeyDown={e => {
          const tag = (e.target as HTMLElement).tagName
          if (e.key === 'Enter' && !e.shiftKey && tag !== 'SELECT' && tag !== 'TEXTAREA') {
            void submit()
          }
        }}
        className="relative flex max-h-full w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-card border border-line bg-paper p-6"
      >
        {mode !== 'append' && dirty > 0 && (
          <div className="flex min-w-0 flex-col gap-2.5 rounded border border-warn/40 bg-warn/10 px-3.5 py-3">
            <span className="inline-flex items-center gap-[7px] text-sm text-warn-deep">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              working tree มีไฟล์ค้าง {dirty} ไฟล์ — เลือกก่อนเริ่ม
            </span>
            <div className="flex flex-wrap gap-2.5">
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
                เอาไฟล์ค้างไปด้วย
              </Button>
            </div>
            {dirtyStrategy === 'keep' && (
              <span className="text-[13px] text-muted">
                ไฟล์ที่ยังไม่ commit จะติดไปกับ branch ที่เลือกด้านล่าง
              </span>
            )}
          </div>
        )}

        <span className="text-base font-semibold">{heading}</span>

        <div className="flex min-w-0 items-center gap-2">
          <WorkspaceChip workspace={workspace} />
          <span className="truncate font-mono text-xs text-faint">· {workspace.path}</span>
        </div>

        {branchError && <span className="text-[13px] text-danger">{branchError}</span>}

        {mode !== 'append' && (
          <label className="flex flex-col gap-1.5 text-[13px]">
            ผู้ช่วยเขียนโค้ด
            <select
              value={agent}
              onChange={e => setAgent(e.target.value as SessionAgent)}
              disabled={busy}
              className="rounded border border-line bg-paper px-2.5 py-1.5"
            >
              {SESSION_AGENTS.map(value => <option key={value} value={value}>{AGENT_LABELS[value]}</option>)}
            </select>
            <span className="text-faint">ต้องติดตั้ง {AGENT_LABELS[agent]} และล็อกอินบนเครื่องนี้ก่อน</span>
          </label>
        )}

        <div className="flex min-w-0 flex-col gap-1.5">
          <Option
            checked={mode === 'new'}
            single={single}
            onSelect={() => setMode('new')}
            label="สร้าง branch ใหม่"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="w-14 shrink-0 text-[13px] text-faint">ชื่อ</span>
              <Input
                ref={nameRef}
                value={name}
                spellCheck={false}
                onChange={e => setName(e.target.value)}
                onFocus={() => setMode('new')}
                className="w-full min-w-0 flex-1"
              />
            </div>
            {!nameValid && name !== '' && (
              <span className="text-[13px] text-danger">ใช้ได้แค่ a-z 0-9 . _ / -</span>
            )}
            {duplicate && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] text-danger">มี branch นี้อยู่แล้ว</span>
                {canUseExisting && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('existing')
                      setExisting(name)
                      setSearch('')
                    }}
                    className="text-[13px] text-pine underline hover:text-pine-deep"
                  >
                    ใช้ branch ที่มีอยู่แล้วแทน
                  </button>
                )}
              </div>
            )}
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="w-14 shrink-0 text-[13px] text-faint">แตกจาก</span>
              <select
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="w-full min-w-0 flex-1 rounded border border-line bg-paper px-2.5 py-1.5 font-mono text-[13px]"
              >
                {branches.length === 0 && <option value={workspace.baseBranch}>{workspace.baseBranch}</option>}
                {branches.map(b => (
                  <option key={b.name} value={b.name}>
                    {b.name}{b.isBase ? ' (base)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </Option>

          <Option
            checked={mode === 'existing'}
            single={single}
            onSelect={() => setMode('existing')}
            label="ใช้ branch ที่มีอยู่แล้ว"
            disabled={!canUseExisting}
            disabledHint={branches.length > 0 ? 'ยังไม่มี branch อื่นนอกจาก base' : undefined}
          >
            {others.length > SEARCH_THRESHOLD && (
              <Input
                value={search}
                placeholder="ค้นหาชื่อ branch"
                spellCheck={false}
                onChange={e => setSearch(e.target.value)}
                className="w-full min-w-0"
              />
            )}
            <select
              value={existing}
              onChange={e => setExisting(e.target.value)}
              className="w-full min-w-0 rounded border border-line bg-paper px-2.5 py-1.5 font-mono text-[13px]"
            >
              {matches.length === 0 && <option value="">ไม่พบ branch ที่ตรงกับคำค้น</option>}
              {matches.map(b => (
                <option key={b.name} value={b.name}>
                  {b.name} · {short(b.lastCommitSubject)} · {relativeTime(b.lastCommitDate)}
                </option>
              ))}
            </select>
            {selected && (
              <span className="min-w-0 truncate text-[13px] text-faint">
                commit ล่าสุด: {selected.lastCommitSubject || '—'} · {relativeTime(selected.lastCommitDate)}
                {selected.isCurrent && ' · อยู่บน branch นี้อยู่แล้ว'}
              </span>
            )}
            <span className="text-[13px] text-faint">จะ checkout ไป branch นี้ ไม่สร้างใหม่</span>
          </Option>

          <Option
            checked={mode === 'current'}
            single={single}
            onSelect={() => setMode('current')}
            label="ทำต่อบน branch ปัจจุบัน"
            disabled={!canUseCurrent}
            disabledHint={
              onProtected && current
                ? `ตอนนี้อยู่บน ${current.name} ซึ่งเป็น branch ที่ป้องกันไว้ เลือกสร้าง branch ใหม่แทน`
                : undefined
            }
          >
            <span className="min-w-0 truncate text-[13px]">
              ทำต่อบน <span className="font-mono">{current?.name ?? '—'}</span>
            </span>
            {current && (
              <span className="min-w-0 truncate text-[13px] text-faint">
                commit ล่าสุด {current.lastCommitSubject || '—'} · {relativeTime(current.lastCommitDate)}
              </span>
            )}
            {dirty > 0 && (
              <span className="text-[13px] text-warn-deep">
                มีไฟล์ที่แก้ค้างไว้ {dirty} ไฟล์ การเปลี่ยนแปลงรอบนี้จะรวมอยู่ด้วย
              </span>
            )}
          </Option>

          {canAppend && (
            <Option
              checked={mode === 'append'}
              single={single}
              onSelect={() => setMode('append')}
              label="ต่อใน session ที่เปิดอยู่"
            >
              {openSessions.map(s => (
                <label key={s.id} className="flex min-w-0 cursor-pointer items-center gap-2">
                  {openSessions.length > 1 && (
                    <input
                      type="radio"
                      name="append-target"
                      checked={sessionId === s.id}
                      onChange={() => {
                        setSessionId(s.id)
                        setMode('append')
                      }}
                      className="h-3.5 w-3.5 shrink-0 accent-pine"
                    />
                  )}
                  <span className="truncate font-mono text-xs text-muted">{s.branch}</span>
                  <span className="shrink-0 text-[13px] text-faint">· {AGENT_LABELS[s.agent]}</span>
                  <span className="shrink-0 text-[13px] text-faint">· {s.defectIds.length} defect</span>
                </label>
              ))}
            </Option>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-[13px] text-faint">รวมอยู่ใน</span>
          {items.map((d, i) => (
            <div key={d.id} className="flex min-w-0 items-center gap-2.5">
              <span className="w-4 shrink-0 text-right font-mono text-[13px] text-faint">{i + 1}.</span>
              <span className="shrink-0 font-mono text-[13px] font-medium">{d.key}</span>
              <span className="truncate text-sm" title={d.title}>{d.title}</span>
            </div>
          ))}
        </div>

        {mode !== 'append' && (
          <div className="flex min-w-0 flex-col gap-2">
            <button
              type="button"
              onClick={() => setPromptOpen(o => !o)}
              className="self-start text-[13px] text-pine underline hover:text-pine-deep"
            >
              {promptOpen ? `ซ่อน prompt ที่จะส่งให้ ${AGENT_LABELS[agent]}` : `ดู/แก้ prompt ที่จะส่งให้ ${AGENT_LABELS[agent]}`}
            </button>
            {promptError && <span className="text-[13px] text-warn-deep">{promptError}</span>}
            {promptOpen && (
              <>
                <span className="text-[13px] text-muted">
                  เนื้อหานี้จะถูกเขียนลง .pat-task.md ให้ {AGENT_LABELS[agent]} อ่านเป็นงานตั้งต้น — แก้ได้ทุกบรรทัด
                  ลบทิ้งทั้งหมด = ให้ระบบสรุปเองแบบเดิม
                </span>
                <textarea
                  value={prompt}
                  spellCheck={false}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={promptError ? '' : prompt === '' ? 'กำลังเตรียม prompt…' : ''}
                  className="min-h-[240px] w-full resize-y rounded border border-line bg-paper px-3 py-2 font-mono text-[13px] leading-[1.6] text-ink"
                />
              </>
            )}
          </div>
        )}

        {error && <span className="whitespace-pre-wrap text-[13px] text-danger">{error}</span>}

        <div className="mt-1 flex justify-end gap-2.5">
          <Button onClick={onCancel} disabled={busy}>ยกเลิก</Button>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'กำลังเริ่ม…' : feature ? 'เริ่มทำ' : 'เริ่มแก้'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface OptionProps {
  checked: boolean
  /** เหลือทางเลือกเดียว — ไม่ต้องมี radio ให้กด */
  single: boolean
  onSelect: () => void
  label: string
  disabled?: boolean
  disabledHint?: string
  children: ReactNode
}

/**
 * ตัวเลือกที่ยังไม่ถูกเลือกจะยุบเหลือแค่บรรทัดชื่อ
 * ใช้ grid-template-rows 0fr→1fr เพราะ animate height ได้จริงโดยไม่ต้องรู้ความสูงล่วงหน้า
 */
function Option({ checked, single, onSelect, label, disabled, disabledHint, children }: OptionProps) {
  if (disabled && !disabledHint) return null

  return (
    <div
      className={
        'flex min-w-0 gap-2.5 rounded border-l-[3px] py-2 pl-2.5 pr-3 transition-colors motion-reduce:transition-none ' +
        (disabled
          ? 'border-l-transparent opacity-50'
          : checked
            ? 'border-l-pine'
            : 'border-l-transparent hover:border-l-line')
      }
    >
      {!single && (
        <input
          type="radio"
          name="branch-mode"
          checked={checked}
          disabled={disabled}
          onChange={onSelect}
          aria-label={label}
          className="mt-1 h-3.5 w-3.5 shrink-0 accent-pine"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <button
          type="button"
          disabled={disabled || single}
          onClick={onSelect}
          className={
            'self-start text-left text-sm disabled:cursor-default ' +
            (checked ? 'font-medium' : 'text-muted')
          }
        >
          {label}
        </button>

        {disabled ? (
          <span className="pt-1 text-[13px] text-warn-deep">{disabledHint}</span>
        ) : (
          <div
            aria-hidden={!checked}
            className="grid transition-[grid-template-rows] duration-150 motion-reduce:transition-none"
            style={{ gridTemplateRows: checked ? '1fr' : '0fr' }}
          >
            <div className="min-w-0 overflow-hidden">
              <div className="flex min-w-0 flex-col gap-2 pt-2">{children}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function short(subject: string): string {
  const trimmed = subject.trim()
  return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed || 'ไม่มี commit'
}
