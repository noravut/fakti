import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  message: string | null
}

/**
 * กันจอขาว — React 18 ถอด tree ทิ้งทั้งก้อนถ้า render throw
 * เช่น mock/defects.json ใส่ severity ผิดค่า
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(err: unknown): State {
    return { message: err instanceof Error ? err.message : String(err) }
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error('pat: render พัง', err, info.componentStack)
  }

  override render(): ReactNode {
    if (this.state.message === null) return this.props.children

    return (
      <div className="flex flex-col gap-2 rounded-card border border-danger bg-danger-soft px-5 py-4">
        <span className="text-sm font-semibold text-danger">หน้านี้แสดงผลไม่ได้</span>
        <span className="font-mono text-sm text-muted">{this.state.message}</span>
        <span className="text-sm text-muted">
          รายละเอียดเต็มอยู่ใน console ของ browser
        </span>
        <div className="mt-1 flex gap-2.5">
          <button
            type="button"
            onClick={() => this.setState({ message: null })}
            className="rounded border border-line bg-paper px-3 py-1.5 text-sm"
          >
            ลองแสดงใหม่
          </button>
          <a
            href="/"
            className="rounded border border-line bg-paper px-3 py-1.5 text-sm text-ink no-underline"
          >
            กลับไป Defect list
          </a>
        </div>
      </div>
    )
  }
}
