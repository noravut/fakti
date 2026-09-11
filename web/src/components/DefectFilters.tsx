import { forwardRef } from 'react'
import type { Severity } from '@shared/types'
import { PRESETS, activeChips, type Facets, type Filters, type PresetId } from '../filters'
import { Input } from './ui'

interface Props {
  filters: Filters
  facets: Facets
  onChange: (next: Filters) => void
}

/**
 * ทุกอย่างในนี้กรองใน memory ล้วน — เปลี่ยนอะไรก็ไม่ยิง API ใหม่
 * ตัวเลือกใน dropdown มาจากค่าที่พบจริงในข้อมูล ไม่ได้ hardcode
 */
export const DefectFilters = forwardRef<HTMLInputElement, Props>(
  function DefectFilters({ filters, facets, onChange }, searchRef) {
    const chips = activeChips(filters)

    const togglePreset = (id: PresetId) => {
      onChange({
        ...filters,
        presets: filters.presets.includes(id)
          ? filters.presets.filter(p => p !== id)
          : [...filters.presets, id],
      })
    }

    return (
      <div className="flex flex-col gap-2.5">
        <Input
          ref={searchRef}
          value={filters.search}
          spellCheck={false}
          placeholder="ค้นหาจากรหัสหรือชื่อ defect — กด / เพื่อกลับมาที่ช่องนี้"
          onChange={e => onChange({ ...filters, search: e.target.value })}
          className="w-full"
        />

        {/* preset ต้องขึ้นบรรทัดใหม่เมื่อที่ไม่พอ ห้าม scroll แนวนอนและห้ามถูกตัดขอบ */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(p => {
            const on = filters.presets.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePreset(p.id)}
                className={
                  'rounded-chip border px-2.5 py-1 text-[13px] transition-colors ' +
                  (on
                    ? 'border-pine bg-pine/10 text-pine'
                    : 'border-line bg-paper text-muted hover:text-ink')
                }
              >
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FacetSelect
            label="status"
            facet={facets.status}
            chosen={filters.statuses}
            onPick={v => onChange({ ...filters, statuses: [...filters.statuses, v] })}
          />
          <FacetSelect
            label="ความรุนแรง"
            facet={facets.severity}
            chosen={filters.severities}
            onPick={v => onChange({ ...filters, severities: [...filters.severities, v as Severity] })}
          />
          <FacetSelect
            label="ผู้รับผิดชอบ"
            facet={facets.assignee}
            chosen={filters.assignees}
            onPick={v => onChange({ ...filters, assignees: [...filters.assignees, v] })}
          />
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map(c => (
              <button
                key={c.id}
                type="button"
                title={c.full}
                onClick={() => onChange(c.without)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-chip border border-line bg-surface px-2 py-0.5 text-[13px] text-muted hover:border-danger hover:text-danger"
              >
                {/* ชื่อ field ห้ามหด ย่อได้เฉพาะค่า */}
                {c.field && <span className="shrink-0">{c.field}:</span>}
                <span className="min-w-0 truncate">{c.value}</span>
                <span aria-hidden className="shrink-0 text-faint">✕</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  },
)

interface FacetProps {
  label: string
  facet: { value: string; count: number }[]
  chosen: string[]
  onPick: (value: string) => void
}

function FacetSelect({ label, facet, chosen, onPick }: FacetProps) {
  const left = facet.filter(f => !chosen.includes(f.value))
  return (
    <select
      value=""
      disabled={left.length === 0}
      onChange={e => e.target.value && onPick(e.target.value)}
      className="rounded border border-line bg-paper px-2 py-1 text-[13px] text-muted disabled:opacity-40"
    >
      <option value="">{label}</option>
      {left.map(f => (
        <option key={f.value} value={f.value}>
          {f.value} ({f.count})
        </option>
      ))}
    </select>
  )
}
