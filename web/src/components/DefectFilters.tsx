import { forwardRef } from 'react'
import { X } from 'lucide-react'
import type { Severity } from '@shared/types'
import { PRESETS, activeChips, type Facets, type Filters, type PresetId } from '../filters'
import { Input, Toggle } from './ui'

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
              <Toggle key={p.id} pressed={on} onClick={() => togglePreset(p.id)}>
                {p.label}
              </Toggle>
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
                className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-line bg-paper px-3 text-sm text-muted transition-colors hover:border-danger hover:text-danger"
              >
                {/* ชื่อ field ห้ามหด ย่อได้เฉพาะค่า */}
                {c.field && <span className="shrink-0">{c.field}:</span>}
                <span className="min-w-0 truncate">{c.value}</span>
                <X aria-hidden size={14} className="shrink-0 text-faint" />
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
      className="h-7 rounded border border-line bg-paper px-2 text-sm text-muted disabled:cursor-not-allowed disabled:opacity-40"
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
