import { forwardRef } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import type { Severity } from '@shared/types'
import { PRESETS, activeChips, type Facet, type Facets, type Filters, type PresetId } from '../filters'
import { Button, Input, Toggle } from './ui'

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
          <FilterPopover filters={filters} facets={facets} onChange={onChange} />
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

const GROUPS = [
  { key: 'statuses', label: 'status', facetKey: 'status' },
  { key: 'severities', label: 'ความรุนแรง', facetKey: 'severity' },
  { key: 'assignees', label: 'ผู้รับผิดชอบ', facetKey: 'assignee' },
] as const

/**
 * ตัวกรองหลายค่าพร้อมจำนวน แทน native select 3 ตัวที่ค่าว่างตลอด (D1, D7)
 * ใช้ Radix Popover เพราะ Card ครอบด้วย overflow-hidden — ต้อง portal ออกไปไม่งั้นโดนตัดขอบ
 * ติ๊กแล้วกรองทันที ไม่มีปุ่ม "ใช้ตัวกรอง" เพราะกรองใน memory ผลเปลี่ยนให้เห็นเลย
 */
function FilterPopover({ filters, facets, onChange }: Props) {
  const chosenCount = filters.statuses.length + filters.severities.length + filters.assignees.length
  const on = chosenCount > 0

  const toggle = (key: (typeof GROUPS)[number]['key'], value: string) => {
    const current: string[] = filters[key]
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value]
    onChange({ ...filters, [key]: next as Severity[] & string[] })
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={
            'inline-flex h-7 shrink-0 items-center gap-2 rounded border px-3 font-sans text-sm ' +
            'transition-colors ' +
            (on
              ? 'border-pine bg-pine-soft text-ink'
              : 'border-line bg-paper text-muted hover:text-ink')
          }
        >
          <SlidersHorizontal aria-hidden size={16} />
          ตัวกรอง
          {on && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-pine px-1 text-xs font-medium text-pine-on">
              {chosenCount}
            </span>
          )}
          <ChevronDown aria-hidden size={16} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          className="z-30 flex max-h-list w-70 flex-col overflow-hidden rounded-card border border-line bg-raised p-1.5 shadow-2xl"
        >
          <div className="flex flex-col overflow-y-auto">
            {GROUPS.map(g => {
              const options = facets[g.facetKey]
              if (options.length === 0) return null
              return (
                <div key={g.key} className="flex flex-col">
                  <span className="px-2.5 py-2 text-xs uppercase tracking-wide text-faint">
                    {g.label}
                  </span>
                  {options.map(o => (
                    <FacetOption
                      key={o.value}
                      option={o}
                      checked={(filters[g.key] as string[]).includes(o.value)}
                      onToggle={() => toggle(g.key, o.value)}
                    />
                  ))}
                </div>
              )
            })}
          </div>

          <div className="mt-1 flex items-center justify-between border-t border-hairline px-2.5 pb-0.5 pt-2">
            <button
              type="button"
              disabled={!on}
              onClick={() => onChange({ ...filters, statuses: [], severities: [], assignees: [] })}
              className="text-sm text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-faint"
            >
              ล้างทั้งหมด
            </button>
            <Popover.Close asChild>
              <Button size="sm" variant="primary">เสร็จ</Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function FacetOption({
  option, checked, onToggle,
}: { option: Facet; checked: boolean; onToggle: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-chip px-2.5 py-1.5 hover:bg-paper">
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      <span
        aria-hidden
        className={
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-chip border ' +
          (checked ? 'border-pine bg-pine text-pine-on' : 'border-line bg-paper')
        }
      >
        {checked && <Check aria-hidden size={12} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{option.value}</span>
      <span className="shrink-0 text-xs text-faint">{option.count.toLocaleString('th-TH')}</span>
    </label>
  )
}
