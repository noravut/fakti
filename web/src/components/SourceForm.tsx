import { useState } from 'react'
import type { CheckResult, CheckStage, SourceConfig } from '@shared/types'
import { api } from '../api'
import { Button, Input } from './ui'

const STAGE_LABEL: Record<CheckStage, string> = {
  resolve: 'เชื่อมต่อได้',
  tls: 'ใบรับรอง',
  http: 'HTTP',
  auth: 'สิทธิ์',
  parse: 'รูปแบบ JSON',
  shape: 'รูปแบบข้อมูล',
  map: 'Field mapping',
}

const PREVIEW_FIELDS = ['key', 'title', 'severity', 'status', 'reporter', 'assignee'] as const

interface Props {
  sources: SourceConfig[]
  sourceId: string | undefined
  vars: Record<string, string>
  /** ไม่ระบุ = ใช้ค่า default ของทั้งแอป */
  defaultLabel?: string
  workspaceId?: string
  onChange: (next: { sourceId: string | undefined; vars: Record<string, string> }) => void
}

/**
 * ช่องกรอกมาจาก vars ที่ source ประกาศไว้ ไม่ได้ hardcode ไว้ในโค้ด
 * เปลี่ยน source แล้วช่องเปลี่ยนตาม
 */
export function SourceForm({ sources, sourceId, vars, defaultLabel, workspaceId, onChange }: Props) {
  const [results, setResults] = useState<CheckResult[] | null>(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const source = sources.find(s => s.id === sourceId)
  const missingRequired = (source?.vars ?? []).filter(v => v.required && !vars[v.key]?.trim())

  async function test() {
    if (!source) return
    setTesting(true)
    setError(null)
    setResults(null)
    try {
      setResults(await api.sources.test(source.id, vars, workspaceId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ทดสอบไม่สำเร็จ')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">ดึง defect จาก</span>
        <select
          value={sourceId ?? ''}
          onChange={e => {
            // เปลี่ยน source แล้ว vars ชุดเดิมใช้ไม่ได้ ล้างทิ้ง
            onChange({ sourceId: e.target.value || undefined, vars: {} })
            setResults(null)
          }}
          className="rounded border border-line bg-paper px-2.5 py-1.5 text-[13px]"
        >
          {defaultLabel && <option value="">{defaultLabel}</option>}
          {sources.map(s => (
            <option key={s.id} value={s.id}>
              {s.label}{s.network === 'internal' ? ' (ในเน็ตเวิร์กบริษัท)' : ''}
            </option>
          ))}
        </select>
      </label>

      {source && source.vars.length > 0 && (
        <div className="flex flex-col gap-3">
          {source.vars.map(v => (
            <label key={v.key} className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">
                {v.label}
                {v.required && <span className="text-danger"> *</span>}
              </span>
              <Input
                value={vars[v.key] ?? ''}
                spellCheck={false}
                onChange={e => onChange({ sourceId, vars: { ...vars, [v.key]: e.target.value } })}
              />
              {v.hint && <span className="text-[13px] text-faint">{v.hint}</span>}
            </label>
          ))}
        </div>
      )}

      {source && source.vars.length === 0 && (
        <span className="text-[13px] text-faint">source นี้ไม่ต้องกรอกอะไรเพิ่ม ดึงมาทั้งหมด</span>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!source || testing || missingRequired.length > 0} onClick={() => void test()}>
          {testing ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
        </Button>
        {missingRequired.length > 0 && (
          <span className="text-[13px] text-faint">
            กรอก {missingRequired.map(v => v.label).join(', ')} ก่อน
          </span>
        )}
      </div>

      {error && <span className="text-[13px] text-danger">{error}</span>}
      {results && <CheckReport results={results} />}
    </div>
  )
}

function CheckReport({ results }: { results: CheckResult[] }) {
  const [showRaw, setShowRaw] = useState(false)
  const last = results[results.length - 1]
  const preview = results.find(r => r.preview)?.preview
  const raw = [...results].reverse().find(r => r.sample !== undefined)?.sample

  return (
    <div className="flex flex-col gap-2 rounded border border-hair bg-surface px-4 py-3.5">
      {results.map(r => (
        <div key={r.stage} className="flex flex-col gap-0.5">
          <div className="flex gap-2.5 text-[13px]">
            <span className={r.ok ? 'text-pine' : 'text-danger'}>{r.ok ? '✓' : '✗'}</span>
            <span className="w-28 shrink-0 text-muted">{STAGE_LABEL[r.stage]}</span>
            <span className={r.ok ? 'text-ink' : 'text-danger'}>{r.detail}</span>
          </div>
          {r.fix && <span className="pl-[136px] text-[13px] text-warn-deep">{r.fix}</span>}
          {r.availableKeys && r.availableKeys.length > 0 && (
            <div className="flex flex-wrap gap-1 pl-[136px] pt-1">
              {r.availableKeys.map(k => (
                <span key={k} className="rounded-chip bg-paper px-1.5 py-0.5 font-mono text-[11px] text-muted">
                  {k}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {preview && (
        <div className="mt-1.5 flex flex-col gap-1 border-t border-hair pt-3">
          <span className="text-[13px] text-muted">ตัวอย่างรายการแรก</span>
          {PREVIEW_FIELDS.map(f => (
            <div key={f} className="flex gap-2.5 text-[13px]">
              <span className="w-20 shrink-0 font-mono text-faint">{f}</span>
              <span className="truncate">{preview[f] || '—'}</span>
            </div>
          ))}
        </div>
      )}

      {raw !== undefined && (
        <div className="mt-1 flex flex-col gap-2 border-t border-hair pt-3">
          <button
            type="button"
            onClick={() => setShowRaw(v => !v)}
            className="self-start text-[13px] text-pine hover:text-pine-deep"
          >
            {showRaw ? 'ซ่อน payload ดิบ' : 'ดู payload ดิบ'}
          </button>
          {showRaw && (
            <pre className="max-h-64 overflow-auto rounded border border-hair bg-paper p-3 font-mono text-[11px] leading-relaxed">
              {typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)}
            </pre>
          )}
        </div>
      )}

      {last && !last.ok && (
        <span className="pt-1 text-[13px] text-faint">
          แก้ที่ ~/.pat/sources.json แล้วกดทดสอบใหม่ได้เลย ไม่ต้องรีสตาร์ท
        </span>
      )}
    </div>
  )
}
