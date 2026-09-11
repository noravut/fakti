import { CircleAlert, GitBranch, Plus, SlidersHorizontal, Terminal } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import type { ReactNode } from 'react'
import { useStore } from '../store'
import { ColorDot, WorkspaceSelect } from './WorkspaceChip'

interface Item {
  href: string
  label: string
  icon: ReactNode
}

const ITEMS: Item[] = [
  { href: '/', label: 'Defect', icon: <CircleAlert aria-hidden size={18} /> },
  { href: '/feature/new', label: 'สร้าง feature', icon: <Plus aria-hidden size={18} /> },
  { href: '/sessions', label: 'Session', icon: <Terminal aria-hidden size={18} /> },
  { href: '/settings', label: 'ตั้งค่า', icon: <SlidersHorizontal aria-hidden size={18} /> },
]

/**
 * Sidebar กว้างมีชื่อเมนู อยู่ทุกหน้า — Sessions กับ Settings เข้าได้คลิกเดียวเสมอ
 * แม้ไม่มี session รันอยู่ (G1) · repo + git status อยู่ที่เดียวคือล่าง sidebar ไม่ซ้ำในเนื้อหา
 */
export function NavShell({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  const { defects, sessions } = useStore()

  // นับทุก session ที่ pty ยังไม่ตาย ไม่ใช่แค่ working/waiting
  // เพราะ idle = ว่างรอคำสั่ง ยังพิมพ์ต่อได้ ถ้าซ่อนไปผู้ใช้จะลืมว่ามันค้างอยู่
  const running = sessions.filter(s => s.state !== 'closed')
  const waiting = running.some(s => s.state === 'waiting')

  const countFor = (href: string) => {
    if (href === '/') return defects.length || null
    if (href === '/sessions') return running.length
    return null
  }

  return (
    <div className="flex min-h-screen">
      <nav className="flex w-58 shrink-0 flex-col gap-1 border-r border-line bg-surface px-3 py-4">
        <Link href="/" className="flex items-center gap-2 px-2.5 pb-4 pt-1">
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded bg-pine-btn text-xs font-semibold text-pine-on"
          >
            f
          </span>
          <span className="text-lg font-medium text-ink">fakti</span>
        </Link>

        {ITEMS.map(item => {
          // หน้า /session/:id กับ /session/:id/summary ก็คือหมวด Session ต้องไฮไลต์ด้วย
          const active = item.href === '/'
            ? location === '/'
            : item.href === '/sessions'
              ? location.startsWith('/session')
              : location.startsWith(item.href)
          const count = countFor(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                'relative flex items-center gap-2.5 rounded px-2.5 py-2 text-base transition-colors ' +
                (active ? 'bg-pine-soft text-ink' : 'text-muted hover:bg-paper hover:text-ink')
              }
            >
              {active && (
                <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-pine" />
              )}
              {item.icon}
              <span className="flex-1 truncate">{item.label}</span>
              {count !== null && <NavCount value={count} waiting={item.href === '/sessions' && waiting} />}
            </Link>
          )
        })}

        <span className="flex-1" />
        <GitFooter />
      </nav>

      <main className="flex min-w-0 max-w-page flex-1 flex-col gap-4 px-7 py-6">{children}</main>
    </div>
  )
}

/** ตัวนับอยู่ใน nav ตลอด แม้ = 0 · มี session รอคุณตอบเมื่อไหร่ ป้ายเปลี่ยนเป็น warn + กะพริบ (S2) */
function NavCount({ value, waiting }: { value: number; waiting: boolean }) {
  return (
    <span
      className={
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium ' +
        (waiting ? 'bg-warn-soft text-warn' : 'bg-hairline text-muted')
      }
    >
      {waiting && <span aria-hidden className="pat-pulse h-1.5 w-1.5 rounded-full bg-warn" />}
      {value.toLocaleString('th-TH')}
    </span>
  )
}

function GitFooter() {
  const {
    workspaces, activeWorkspaceId, gitStatus, gitStatusError, setActiveWorkspace,
  } = useStore()
  const active = workspaces.find(w => w.id === activeWorkspaceId)

  if (!active) return null

  return (
    <div className="flex flex-col gap-2 border-t border-hairline px-2.5 pb-1 pt-3">
      {workspaces.length > 1 ? (
        <WorkspaceSelect
          workspaces={workspaces}
          value={active.id}
          onChange={id => void setActiveWorkspace(id)}
        />
      ) : (
        <span className="flex items-center gap-2 text-sm text-ink">
          <ColorDot color={active.color} />
          <span className="truncate">{active.id}</span>
        </span>
      )}

      {gitStatusError ? (
        <span className="text-sm text-danger">{gitStatusError}</span>
      ) : gitStatus ? (
        <>
          <span className="flex min-w-0 items-center gap-1.5 text-muted">
            <GitBranch aria-hidden size={13} className="shrink-0" />
            <span className="truncate font-mono text-xs">{gitStatus.branch}</span>
          </span>
          {gitStatus.isDirty ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-warn">
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
              มีไฟล์ค้าง {gitStatus.dirtyCount} ไฟล์
            </span>
          ) : (
            <span className="text-sm text-muted">working tree สะอาด</span>
          )}
        </>
      ) : (
        <span className="text-sm text-faint">กำลังอ่านสถานะ…</span>
      )}
    </div>
  )
}
