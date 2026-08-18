import type { Workspace, WorkspaceColor } from '@shared/types'
import { WORKSPACE_COLOR_HEX } from '@shared/types'

export function ColorDot({ color, size = 8 }: { color: WorkspaceColor; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: WORKSPACE_COLOR_HEX[color] }}
    />
  )
}

/** ชิปเฉยๆ — ใช้เมื่อไม่มีอะไรให้เลือก */
export function WorkspaceChip({ workspace }: { workspace: Workspace }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ColorDot color={workspace.color} />
      <span className="font-mono text-xs">{workspace.id}</span>
    </span>
  )
}

interface SelectProps {
  workspaces: Workspace[]
  value: string | null
  onChange: (id: string) => void
  disabled?: boolean
}

/**
 * มี repo เดียว → ชิปเฉยๆ · หลาย repo → dropdown แก้ได้ในแถว · ยังไม่เลือก → กรอบประ
 * ใช้ select จริงซ้อนทับแบบโปร่งใส เพื่อให้ keyboard กับ screen reader ใช้ได้ตามปกติ
 */
export function WorkspaceSelect({ workspaces, value, onChange, disabled }: SelectProps) {
  const selected = workspaces.find(w => w.id === value)

  if (workspaces.length === 1 && selected) {
    return <WorkspaceChip workspace={selected} />
  }

  return (
    <span className="relative inline-flex">
      <span
        className={
          'inline-flex items-center gap-1.5 rounded border bg-paper px-2.5 py-1 ' +
          (selected ? 'border-line' : 'border-dashed border-line text-faint')
        }
      >
        {selected ? (
          <>
            <ColorDot color={selected.color} />
            <span className="font-mono text-xs">{selected.id}</span>
          </>
        ) : (
          <span className="text-[13px]">เลือก repo</span>
        )}
        <span className="text-[10px] text-faint">▾</span>
      </span>
      <select
        aria-label="เลือก repo"
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
      >
        {!selected && <option value="">เลือก repo</option>}
        {workspaces.map(w => (
          <option key={w.id} value={w.id}>
            {w.id}
          </option>
        ))}
      </select>
    </span>
  )
}
