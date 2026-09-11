import { forwardRef } from 'react'
import { CircleAlert, CircleCheck, Loader, TriangleAlert, X } from 'lucide-react'
import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes,
} from 'react'

/* ---------------------------------------------------------------- ปุ่ม */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'border-pine-btn bg-pine-btn font-medium text-pine-on hover:border-pine-btn-hover hover:bg-pine-btn-hover',
  secondary: 'border-line bg-paper text-ink hover:bg-raised',
  ghost: 'border-transparent bg-transparent text-muted hover:bg-paper hover:text-ink',
  // ปุ่มทำลายเป็น outline เสมอ ยกเว้นปุ่มยืนยันใน modal ที่เป็น dangerSolid
  danger: 'border-danger-line bg-transparent text-danger hover:bg-danger-soft',
  dangerSolid: 'border-danger-btn bg-danger-btn font-medium text-white',
}

const DISABLED: Record<Variant, string> = {
  primary: 'disabled:opacity-40',
  secondary: 'disabled:border-hair disabled:bg-paper disabled:text-faint',
  ghost: 'disabled:bg-transparent disabled:text-faint',
  danger: 'disabled:border-hair disabled:bg-transparent disabled:text-faint',
  dangerSolid: 'disabled:opacity-40',
}

const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5',
  md: 'h-9 px-4',
}

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded border font-sans text-sm ' +
  'transition-colors disabled:cursor-not-allowed'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** กำลังทำงาน — ขึ้น spinner และกดซ้ำไม่ได้ */
  loading?: boolean
}

// forwardRef เพราะ Radix asChild ส่ง ref มาให้ (เช่น Popover.Close) ถ้าไม่รับ React จะเตือนและ ref หาย
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'secondary', size = 'md', loading = false, disabled, className = '', children, ...rest
}, ref) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled ?? loading}
      {...rest}
      className={`${BASE} ${VARIANT[variant]} ${DISABLED[variant]} ${SIZE[size]} ${className}`}
    >
      {loading && <Loader aria-hidden size={16} className="pat-pulse" />}
      {children}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** icon button ต้องมีชื่อเสมอ ไม่งั้น screen reader อ่านไม่ออกว่าปุ่มอะไร */
  label: string
  variant?: Extract<Variant, 'secondary' | 'ghost'>
  size?: Size
  children: ReactNode
}

export function IconButton({
  label, variant = 'ghost', size = 'md', className = '', children, ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={
        `${BASE} ${VARIANT[variant]} ${DISABLED[variant]} p-0 ` +
        `${size === 'sm' ? 'h-7 w-7' : 'h-9 w-9'} ${className}`
      }
    >
      {children}
    </button>
  )
}

/* ------------------------------------------------------------ ช่องกรอก */

const CONTROL =
  'w-full rounded border bg-paper px-3 text-base text-ink placeholder:text-faint ' +
  'disabled:cursor-not-allowed disabled:border-hair disabled:text-faint'

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ invalid = false, className = '', ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      {...rest}
      className={`${CONTROL} h-9 ${invalid ? 'border-danger' : 'border-line'} ${className}`}
    />
  )
})

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid = false, className = '', ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      {...rest}
      className={`${CONTROL} py-2 leading-relaxed ${invalid ? 'border-danger' : 'border-line'} ${className}`}
    />
  )
})

/** label + hint/error ชุดเดียวกันทุกฟอร์ม — error ทับ hint เพราะสำคัญกว่า */
export function Field({
  label, hint, error, children,
}: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-muted">{label}</span>
      {children}
      {error ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-danger">
          <CircleAlert aria-hidden size={14} className="shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="text-sm text-faint">{hint}</span>
      ) : null}
    </label>
  )
}

/* --------------------------------------------------- กดได้ vs อ่านอย่างเดียว */

/**
 * กฎเดียวที่ห้ามแหก (design doc §6): ของที่กดได้เป็นแคปซูลมีขอบเต็ม
 * ส่วน Tag ข้างล่างเป็นสี่เหลี่ยมมุม 4px ไม่มีขอบเข้ม — ห้ามทำให้สองอันนี้เหมือนกัน
 */
export function Toggle({
  pressed, tone = 'pine', className = '', children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean; tone?: 'pine' | 'ok' }) {
  const on = tone === 'ok'
    ? 'border-ok bg-ok-soft font-medium text-ok'
    : 'border-pine bg-pine-soft font-medium text-pine'
  return (
    <button
      type="button"
      aria-pressed={pressed}
      {...rest}
      className={
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 font-sans text-sm ' +
        'transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:border-hair ' +
        'disabled:bg-paper disabled:text-faint ' +
        (pressed ? on : 'border-line bg-paper text-muted hover:border-pine-line hover:text-ink ') +
        className
      }
    >
      {children}
    </button>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
}

/** ตัวเลือกไม่กี่อัน เห็นครบทุกอันพร้อมกัน — ใช้แทน native select ที่ค่าว่างตลอด (D7) */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-0.5 self-start rounded border border-line bg-paper p-0.5"
    >
      {options.map(o => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={
              'h-7 rounded-chip border px-3 font-sans text-sm transition-colors ' +
              'disabled:cursor-not-allowed disabled:text-faint ' +
              (on
                ? 'border-pine-line bg-pine-soft font-medium text-pine'
                : 'border-transparent text-muted hover:text-ink')
            }
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

type TagTone = 'danger' | 'warn' | 'neutral' | 'faint' | 'outline'

const TAG_TONE: Record<TagTone, string> = {
  danger: 'bg-danger-soft text-danger',
  warn: 'bg-warn-soft text-warn',
  neutral: 'bg-hairline text-muted',
  faint: 'bg-hairline text-faint',
  outline: 'border border-hair text-muted',
}

/** อ่านอย่างเดียว — severity, tag จาก tracker, ป้ายบอกที่มา */
export function Tag({
  tone = 'neutral', className = '', children,
}: { tone?: TagTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={
        `inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2 py-0.5 text-xs font-medium ` +
        `${TAG_TONE[tone]} ${className}`
      }
    >
      {children}
    </span>
  )
}

type StatusTone = 'waiting' | 'working' | 'idle' | 'closed'

const STATUS_TONE: Record<StatusTone, { box: string; dot: string }> = {
  waiting: { box: 'bg-warn-soft text-warn', dot: 'bg-warn pat-pulse' },
  working: { box: 'bg-pine-soft text-pine', dot: 'bg-pine' },
  idle: { box: 'bg-hairline text-muted', dot: 'bg-muted' },
  closed: { box: 'border border-hair text-faint', dot: 'bg-faint' },
}

/** สถานะ session — จุดสี + คำ ต้องอ่านออกภายใน 1 วินาที (§9) */
export function StatusBadge({
  tone, children, className = '',
}: { tone: StatusTone; children: ReactNode; className?: string }) {
  const s = STATUS_TONE[tone]
  return (
    <span
      className={
        `inline-flex shrink-0 items-center gap-1.5 rounded-chip px-2.5 py-1 text-sm font-medium ` +
        `${s.box} ${className}`
      }
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${s.dot}`} />
      {children}
    </span>
  )
}

/* --------------------------------------------------------------- กล่อง */

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`card overflow-hidden ${className}`}>{children}</div>
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <span className="text-lg font-medium">{children}</span>
}

export function Mono({ className = '', children }: { className?: string; children: ReactNode }) {
  return <span className={`font-mono ${className}`}>{children}</span>
}

/** รูปร่างเท่าของจริงเสมอ — ใช้แทนข้อความ "กำลังโหลด" (G9) */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span className={`pat-skeleton block rounded-chip bg-hairline ${className}`} />
}

/* ------------------------------------------------- modal · toast · banner */

interface ModalProps {
  title: string
  /** บรรทัดรองใต้ชื่อ เช่น "ขั้นที่ 1 จาก 2" */
  step?: string
  size?: 'sm' | 'md'
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}

/** โครง modal ที่ใช้ร่วมกันทุกกล่อง — backdrop, กรอบ, หัว, ท้าย */
export function Modal({ title, step, size = 'md', onClose, footer, children }: ModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6"
    >
      <div
        className={
          'flex max-h-full flex-col overflow-hidden rounded-card border border-line bg-raised shadow-2xl ' +
          (size === 'sm' ? 'w-95' : 'w-140')
        }
      >
        <div className="flex items-center gap-4 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-xl font-semibold">{title}</span>
            {step && <span className="text-sm text-muted">{step}</span>}
          </div>
          <span className="flex-1" />
          <IconButton label="ปิด" size="sm" onClick={onClose}>
            <X aria-hidden size={18} />
          </IconButton>
        </div>

        <div className="flex min-h-dialog flex-col gap-4 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline bg-surface px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** ผลของ action ที่เพิ่งกด — เส้นซ้ายบอกผลลัพธ์ ไม่ต้องอ่านข้อความก็รู้ว่าดีหรือร้าย */
export function Toast({
  tone, message, action,
}: { tone: 'ok' | 'error'; message: ReactNode; action?: ReactNode }) {
  const ok = tone === 'ok'
  return (
    <div
      role="status"
      className={
        'flex items-center gap-3 rounded-card border border-l-4 bg-raised px-3.5 py-3 shadow-lg ' +
        (ok ? 'border-pine-line border-l-ok' : 'border-danger-line border-l-danger')
      }
    >
      {ok
        ? <CircleCheck aria-hidden size={18} className="shrink-0 text-ok" />
        : <CircleAlert aria-hidden size={18} className="shrink-0 text-danger" />}
      <span className="flex-1 text-sm">{message}</span>
      {action}
    </div>
  )
}

/** ข้อมูลค้าง / คำเตือนจาก server — อยู่กับที่ ไม่หายเอง */
export function Banner({
  tone = 'warn', title, hint, action,
}: { tone?: 'warn' | 'danger'; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  const warn = tone === 'warn'
  return (
    <div
      className={
        'flex gap-3 rounded-card border p-3.5 ' +
        (warn ? 'border-warn-line bg-warn-soft' : 'border-danger-line bg-danger-soft')
      }
    >
      <TriangleAlert
        aria-hidden
        size={18}
        className={`mt-0.5 shrink-0 ${warn ? 'text-warn' : 'text-danger'}`}
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="whitespace-pre-wrap text-sm text-ink">{title}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
        {action && <div className="mt-0.5 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  )
}

/* -------------------------------------------------------- empty · error */

/** แถบ error แบบเดียวกันทั้งแอป — บอกเหตุ + ทางไปต่อ ไม่ขอโทษ */
export function ErrorBox({
  title, hint, action,
}: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-danger-line bg-danger-soft px-5 py-4">
      <span className="text-sm font-medium text-danger">{title}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
      {action && <div className="mt-1 self-start">{action}</div>}
    </div>
  )
}

export function EmptyState({
  icon, title, hint, action,
}: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2.5 px-6 py-8 text-center">
      {icon && <span className="text-faint">{icon}</span>}
      <span className="text-base text-ink">{title}</span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
