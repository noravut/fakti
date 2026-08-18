import { useEffect, useMemo, useRef, useState } from 'react'
import type { ValidateResult, Workspace, WorkspaceColor } from '@shared/types'
import { WORKSPACE_COLORS, WORKSPACE_COLOR_HEX } from '@shared/types'
import { api } from '../api'
import { Button, Input } from './ui'

const VALIDATE_DEBOUNCE_MS = 400

interface Props {
  initial?: Workspace
  takenColors: WorkspaceColor[]
  onSaved: () => void
  onCancel?: () => void
}

export function WorkspaceForm({ initial, takenColors, onSaved, onCancel }: Props) {
  const [path, setPath] = useState(initial?.path ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [baseBranch, setBaseBranch] = useState(initial?.baseBranch ?? 'main')
  const [color, setColor] = useState<WorkspaceColor>(
    initial?.color ?? WORKSPACE_COLORS.find(c => !takenColors.includes(c)) ?? 'blue',
  )

  const [check, setCheck] = useState<ValidateResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // ผู้ใช้แก้ชื่อเองแล้วอย่าไปเดาทับ
  const nameTouched = useRef(Boolean(initial))

  useEffect(() => {
    const trimmed = path.trim()
    if (!trimmed) {
      setCheck(null)
      return
    }
    setChecking(true)
    const timer = setTimeout(async () => {
      try {
        const result = await api.workspaces.validate(trimmed)
        setCheck(result)
        if (result.ok && !nameTouched.current) {
          setName(trimmed.replace(/\/+$/, '').split('/').pop() ?? '')
        }
        if (result.ok && result.branches?.length) {
          setBaseBranch(prev =>
            result.branches?.includes(prev)
              ? prev
              : result.branches?.find(b => b === 'main' || b === 'master') ?? result.branches?.[0] ?? prev,
          )
        }
      } catch {
        setCheck({ ok: false, error: 'ตรวจ path ไม่ได้' })
      } finally {
        setChecking(false)
      }
    }, VALIDATE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [path])

  const canSave = useMemo(
    () => Boolean(check?.ok && name.trim() && baseBranch.trim() && !saving),
    [check, name, baseBranch, saving],
  )

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const payload = { path: path.trim(), name: name.trim(), baseBranch: baseBranch.trim(), color }
    try {
      if (initial) await api.workspaces.update(initial.id, payload)
      else await api.workspaces.create(payload)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">path ของ repo</span>
        <Input
          value={path}
          spellCheck={false}
          placeholder="/Users/you/work/next-timecraft"
          onChange={e => setPath(e.target.value)}
        />
        {checking ? (
          <span className="text-[13px] text-faint">กำลังตรวจ…</span>
        ) : check?.ok ? (
          <span className="text-[13px] text-pine">
            ใช้ได้ · {check.remote ?? 'ไม่มี remote'}
            {check.branches?.length ? ` · ${check.branches.length} branch` : ''}
          </span>
        ) : check?.error ? (
          <span className="text-[13px] text-danger">{check.error}</span>
        ) : (
          <span className="text-[13px] text-faint">ใส่ absolute path ของ git repo ในเครื่อง</span>
        )}
      </label>

      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] text-muted">ชื่อที่ใช้เรียก</span>
          <Input
            value={name}
            onChange={e => {
              nameTouched.current = true
              setName(e.target.value)
            }}
          />
        </label>

        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[13px] text-muted">base branch</span>
          {check?.branches?.length ? (
            <select
              value={baseBranch}
              onChange={e => setBaseBranch(e.target.value)}
              className="rounded border border-line bg-paper px-2.5 py-1.5 font-mono text-[13px]"
            >
              {check.branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          ) : (
            <Input value={baseBranch} spellCheck={false} onChange={e => setBaseBranch(e.target.value)} />
          )}
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-muted">สีประจำ repo</span>
        <div className="flex gap-2">
          {WORKSPACE_COLORS.map(c => (
            <button
              key={c}
              type="button"
              aria-label={c}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={
                'h-3.5 w-3.5 rounded-full ring-offset-2 transition-all ' +
                (color === c ? 'ring-2 ring-ink' : takenColors.includes(c) ? 'opacity-40' : '')
              }
              style={{ background: WORKSPACE_COLOR_HEX[c] }}
            />
          ))}
        </div>
      </div>

      {error && <span className="text-[13px] text-danger">{error}</span>}

      <div className="flex justify-end gap-2.5">
        {onCancel && <Button onClick={onCancel} disabled={saving}>ยกเลิก</Button>}
        <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
          {saving ? 'กำลังบันทึก…' : initial ? 'บันทึก' : 'เพิ่ม repo'}
        </Button>
      </div>
    </div>
  )
}
