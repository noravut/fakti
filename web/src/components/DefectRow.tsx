import { useEffect, useState } from 'react'
import type { Defect, Workspace } from '@shared/types'
import { api } from '../api'
import { Check, Circle, CircleCheck, ExternalLink } from 'lucide-react'
import { SEVERITY_TONE, relativeTime } from '../format'
import { Skeleton, Tag, Toggle } from './ui'
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
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-chip border ' +
            (selected
              ? 'border-pine bg-pine text-pine-on'
              : 'border-line bg-surface disabled:cursor-not-allowed disabled:opacity-60')
          }
        >
          {selected && <Check aria-hidden size={12} strokeWidth={3} />}
        </button>

        {/* ไม่แสดงรหัส — tracker ไม่ได้ใช้รหัสนั้นเรียกงาน คนอ่านจำจากวงเล็บหน้า title แทน */}
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          title={defect.title}
          className="min-w-0 flex-1 truncate text-left text-base"
        >
          {defect.title}
        </button>

        <Tag tone={SEVERITY_TONE[defect.severity]}>{defect.severityLabel ?? defect.severity}</Tag>

        <WorkspaceSelect workspaces={workspaces} value={workspaceId} onChange={onWorkspaceChange} />
      </div>

      {/* ย้ายป้าย "เคยแก้ใน" ลงบรรทัดล่าง เพื่อคืนที่ให้ title */}
      <div className="flex min-w-0 items-center gap-2 pl-7 text-sm text-faint">
        <span className="truncate">
          {defect.reporter ? `เปิดโดย ${defect.reporter} · ` : ''}
          {relativeTime(defect.createdAt)}
        </span>
        {defect.tags?.map(t => (
          <Tag key={t} tone="outline">{t}</Tag>
        ))}
        {fixedIn && (
          <Tag tone="outline">
            เคยแก้ใน <span className="font-mono">{fixedIn}</span>
          </Tag>
        )}
        <Toggle
          pressed={markedFixed}
          tone="ok"
          onClick={onToggleMarkedFixed}
          title={markedFixed ? 'เอาเครื่องหมายออก' : 'ทำเครื่องหมายว่าแก้แล้ว'}
        >
          {markedFixed
            ? <CircleCheck aria-hidden size={14} strokeWidth={2.25} />
            : <Circle aria-hidden size={14} strokeWidth={2} />}
          แก้แล้ว
        </Toggle>
      </div>

      {expanded && (
        <div className="mb-0.5 ml-7 mt-1.5 flex flex-col gap-2 rounded border border-hair bg-surface px-3.5 py-3">
          <span className="whitespace-pre-line text-sm leading-relaxed text-muted">{detail}</span>
          {defect.url && (
            <a
              href={defect.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1.5 text-sm text-pine hover:text-pine-btn-hover"
            >
              เปิด ticket <span className="font-mono">{defect.key}</span>
              <ExternalLink aria-hidden size={14} />
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
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-3.5 flex-1" />
      </div>
      <Skeleton className="ml-7 h-3 w-32" />
    </div>
  )
}
