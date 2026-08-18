import type { Defect, Workspace } from '@shared/types'
import { SEVERITY_STYLE, relativeTime } from '../format'
import { WorkspaceSelect } from './WorkspaceChip'

interface Props {
  defect: Defect
  workspaces: Workspace[]
  workspaceId: string | null
  onWorkspaceChange: (id: string) => void
  selected: boolean
  onToggleSelect: () => void
  expanded: boolean
  onToggleExpand: () => void
  /** branch ของ session ที่เคยหยิบ defect นี้ไปแก้ */
  fixedIn?: string
}

export function DefectRow({
  defect, workspaces, workspaceId, onWorkspaceChange,
  selected, onToggleSelect, expanded, onToggleExpand, fixedIn,
}: Props) {
  const severity = SEVERITY_STYLE[defect.severity]
  // ไม่รู้ว่าจะให้แก้ที่ repo ไหน ก็เลือกไปแก้ไม่ได้
  const selectable = workspaceId !== null

  return (
    <div className="flex flex-col gap-1.5 border-t border-hair px-4 py-3 first:border-t-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`เลือก ${defect.key}`}
          disabled={!selectable}
          onClick={onToggleSelect}
          className={
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-chip border text-[11px] ' +
            (selected
              ? 'border-pine bg-pine text-white'
              : 'border-line bg-surface disabled:cursor-not-allowed disabled:opacity-60')
          }
        >
          {selected ? '✓' : ''}
        </button>

        <span className="font-mono text-[13px] font-medium">{defect.key}</span>

        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex-1 text-left text-[15px]"
        >
          {defect.title}
        </button>

        {fixedIn && (
          <span className="shrink-0 rounded-chip border border-hair px-2 py-0.5 text-[11px] text-faint">
            เคยแก้ใน <span className="font-mono">{fixedIn}</span>
          </span>
        )}

        <span
          className="rounded-chip px-2 py-0.5 font-mono text-[11px]"
          style={{ color: severity.color, background: severity.background }}
        >
          {defect.severity}
        </span>

        <WorkspaceSelect workspaces={workspaces} value={workspaceId} onChange={onWorkspaceChange} />
      </div>

      <div className="pl-7 text-[13px] text-faint">
        {defect.reporter ? `เปิดโดย ${defect.reporter} · ` : ''}
        {relativeTime(defect.createdAt)}
      </div>

      {expanded && (
        <div className="mb-0.5 ml-7 mt-1.5 flex flex-col gap-2 rounded border border-hair bg-surface px-3.5 py-3">
          <span className="text-sm leading-[1.7] text-muted">{defect.description}</span>
          {defect.url && (
            <a
              href={defect.url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-pine hover:text-pine-deep"
            >
              เปิด ticket <span className="font-mono">{defect.key}</span> ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

export function DefectRowSkeleton() {
  return (
    <div className="flex flex-col gap-2 border-t border-hair px-4 py-3.5 first:border-t-0">
      <div className="flex items-center gap-3">
        <span className="pat-skeleton h-4 w-4 rounded-chip bg-hair" />
        <span className="pat-skeleton h-3 w-16 rounded-chip bg-hair" />
        <span className="pat-skeleton h-3 flex-1 rounded-chip bg-hair" />
      </div>
      <span className="pat-skeleton ml-7 h-2.5 w-32 rounded-chip bg-hairline" />
    </div>
  )
}
