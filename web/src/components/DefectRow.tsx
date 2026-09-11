import { useEffect, useState } from 'react'
import type { Defect, Workspace } from '@shared/types'
import { api } from '../api'
import { SEVERITY_STYLE, relativeTime } from '../format'
import { WorkspaceSelect } from './WorkspaceChip'

interface Props {
  defect: Defect
  workspaces: Workspace[]
  workspaceId: string | null
  onWorkspaceChange: (id: string) => void
  selected: boolean
  /** เลือกครบโควตาของ session แล้ว — ติ๊กเพิ่มไม่ได้ */
  selectable?: boolean
  onToggleSelect: () => void
  expanded: boolean
  onToggleExpand: () => void
  /** branch ของ session ที่เคยหยิบ defect นี้ไปแก้ */
  fixedIn?: string
  /** ผู้ใช้ทำเครื่องหมายเองว่าแก้แล้ว — เก็บในเครื่อง ไม่เกี่ยวกับ status ใน tracker */
  markedFixed: boolean
  onToggleMarkedFixed: () => void
}

export function DefectRow({
  defect, workspaces, workspaceId, onWorkspaceChange,
  selected, selectable: withinQuota = true, onToggleSelect, expanded, onToggleExpand, fixedIn,
  markedFixed, onToggleMarkedFixed,
}: Props) {
  const severity = SEVERITY_STYLE[defect.severity]
  // ไม่รู้ว่าจะให้แก้ที่ repo ไหน ก็เลือกไปแก้ไม่ได้
  const selectable = workspaceId !== null && withinQuota
  const detail = useDescription(defect, workspaceId, expanded)

  return (
    // เส้นคั่นอยู่ที่ตัวห่อฝั่ง list เพราะแต่ละแถวถูกวางแบบ absolute ตอน virtual scroll
    <div className="flex flex-col gap-1.5 px-4 py-3">
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

        {/* ไม่แสดงรหัส — tracker ไม่ได้ใช้รหัสนั้นเรียกงาน คนอ่านจำจากวงเล็บหน้า title แทน */}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          title={defect.title}
          className="min-w-0 flex-1 truncate text-left text-[15px]"
        >
          {defect.title}
        </button>

        <span
          className="shrink-0 rounded-chip px-2 py-0.5 font-mono text-[11px]"
          style={{ color: severity.color, background: severity.background }}
        >
          {defect.severityLabel ?? defect.severity}
        </span>

        <WorkspaceSelect workspaces={workspaces} value={workspaceId} onChange={onWorkspaceChange} />
      </div>

      {/* ย้ายป้าย "เคยแก้ใน" ลงบรรทัดล่าง เพื่อคืนที่ให้ title */}
      <div className="flex min-w-0 items-center gap-2 pl-7 text-[13px] text-faint">
        <span className="truncate">
          {defect.reporter ? `เปิดโดย ${defect.reporter} · ` : ''}
          {relativeTime(defect.createdAt)}
        </span>
        {defect.tags?.map(t => (
          <span
            key={t}
            className="shrink-0 rounded-chip bg-surface px-2 py-0.5 font-mono text-[11px] text-muted"
          >
            {t}
          </span>
        ))}
        {fixedIn && (
          <span className="shrink-0 rounded-chip border border-hair px-2 py-0.5 text-[11px] text-faint">
            เคยแก้ใน <span className="font-mono">{fixedIn}</span>
          </span>
        )}
        <button
          type="button"
          aria-pressed={markedFixed}
          onClick={onToggleMarkedFixed}
          title={markedFixed ? 'เอาเครื่องหมายออก' : 'ทำเครื่องหมายว่าแก้แล้ว'}
          className={
            'shrink-0 rounded-chip border px-2 py-0.5 text-[11px] transition-colors ' +
            (markedFixed
              ? 'border-pine bg-pine/10 text-pine'
              : 'border-hair text-faint hover:text-ink')
          }
        >
          {markedFixed ? '✓ แก้แล้ว' : 'แก้แล้ว'}
        </button>
      </div>

      {expanded && (
        <div className="mb-0.5 ml-7 mt-1.5 flex flex-col gap-2 rounded border border-hair bg-surface px-3.5 py-3">
          <span className="whitespace-pre-line text-sm leading-[1.7] text-muted">{detail}</span>
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

/**
 * tracker หลายเจ้าไม่ส่ง description มากับ list — ตามไปดึงตอนกางดูเท่านั้น
 * ไม่ยิงทั้งหน้าเพราะรายการเดียวก็หลายสิบ request
 */
function useDescription(defect: Defect, workspaceId: string | null, expanded: boolean): string {
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!expanded || defect.description || loaded !== null || failed) return
    let cancelled = false
    void api.defects.get(defect.id, workspaceId)
      .then(full => {
        if (!cancelled) setLoaded(full.description)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [expanded, defect.id, defect.description, workspaceId, loaded, failed])

  if (defect.description) return defect.description
  if (loaded) return loaded
  if (failed) return 'ดึงรายละเอียดไม่สำเร็จ — ลองกดโหลดใหม่'
  if (loaded === '') return 'ไม่มีรายละเอียดเพิ่มเติม'
  return expanded ? 'กำลังโหลดรายละเอียด…' : ''
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
