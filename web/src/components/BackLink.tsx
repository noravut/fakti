import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'wouter'

/**
 * ปุ่มย้อนกลับมุมซ้ายบนของหน้าย่อย
 * label ต้องบอกปลายทางจริง ไม่ใช่คำว่า "ย้อนกลับ" ลอยๆ
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 text-sm text-muted transition-colors hover:text-ink"
    >
      <ArrowLeft aria-hidden size={16} />
      {label}
    </Link>
  )
}

/**
 * Esc = กลับไปหน้าเดียวกับที่ปุ่มย้อนกลับพาไป
 *
 * ห้ามเรียกในหน้า session — terminal ต้องได้ Esc ไปใช้เอง
 * ถ้ามี dialog เปิดอยู่ให้ dialog จัดการ Esc ของตัวเองก่อน
 */
export function useEscapeBack(href: string | null): void {
  const [, navigate] = useLocation()

  useEffect(() => {
    if (!href) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      navigate(href)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [href, navigate])
}
