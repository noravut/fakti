import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

type Variant = 'default' | 'primary' | 'danger' | 'warn'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  default: 'bg-paper border-line text-ink hover:bg-hairline',
  primary: 'bg-pine border-pine text-white hover:bg-pine-deep hover:border-pine-deep',
  danger: 'bg-paper border-danger text-danger hover:bg-danger/5',
  warn: 'bg-paper border-warn text-warn-deep hover:bg-warn/5',
}

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-[13px]',
  md: 'px-3.5 py-[7px] text-sm',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'default', size = 'md', className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={
        `rounded border font-sans transition-colors ${VARIANT[variant]} ${SIZE[size]} ` +
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-inherit ' +
        className
      }
    />
  )
}

/** ปุ่มทึบสีแดง ใช้เฉพาะการยืนยันลบที่เอาคืนไม่ได้ */
export function DangerButton({ className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={
        'rounded border border-danger bg-danger px-3.5 py-[7px] text-sm text-white ' +
        `transition-colors hover:brightness-110 disabled:opacity-40 ${className}`
      }
    />
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return (
      <input
        ref={ref}
        {...rest}
        className={
          'rounded border border-line bg-paper px-2.5 py-1.5 font-mono text-[13px] text-ink ' +
          `placeholder:font-sans placeholder:text-faint ${className}`
        }
      />
    )
  },
)

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card overflow-hidden ${className}`}>{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-[15px] font-semibold">{children}</span>
}

export function Mono({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`font-mono ${className}`}>{children}</span>
}

/** แถบ error แบบเดียวกันทั้งแอป — บอกเหตุ + ทางไปต่อ ไม่ขอโทษ */
export function ErrorBox({
  title, hint, action,
}: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-danger bg-danger/5 px-5 py-[18px]">
      <span className="text-sm font-semibold text-danger">{title}</span>
      {hint && <span className="text-[13px] text-muted">{hint}</span>}
      {action && <div className="mt-1 self-start">{action}</div>}
    </div>
  )
}

export function EmptyState({
  title, hint, action,
}: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2.5 rounded-card border border-line bg-paper px-6 py-8">
      <span className="text-[15px] text-muted">{title}</span>
      {hint && <span className="text-[13px] text-faint">{hint}</span>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
