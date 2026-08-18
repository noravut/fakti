import type { Workspace } from '@shared/types'
import { Button } from './ui'
import { WorkspaceChip } from './WorkspaceChip'

interface Props {
  count: number
  /** workspace เดียวกันทั้งหมดหรือเปล่า — ถ้าไม่ ทำต่อไม่ได้ */
  workspace: Workspace | null
  mixed: boolean
  onCancel: () => void
  onStart: () => void
}

export function BulkBar({ count, workspace, mixed, onCancel, onStart }: Props) {
  return (
    <div className="flex items-center gap-3 border-t border-line bg-paper px-5 py-3">
      {mixed ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-warn">
          <span className="h-1.5 w-1.5 rounded-full bg-warn" />
          เลือกได้ทีละ repo เท่านั้น
        </span>
      ) : (
        <>
          <span className="text-sm">เลือกไว้ {count} รายการ ·</span>
          {workspace && <WorkspaceChip workspace={workspace} />}
        </>
      )}

      <span className="flex-1" />
      <Button onClick={onCancel}>ยกเลิก</Button>
      <Button variant="primary" disabled={mixed || count === 0} onClick={onStart}>
        แก้ที่เลือก
      </Button>
    </div>
  )
}
