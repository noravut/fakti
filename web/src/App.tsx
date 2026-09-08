import { useEffect } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import { startPolling, useStore } from './store'
import { ErrorBoundary } from './components/ErrorBoundary'
import { GoHome } from './components/GoHome'
import { Setup } from './pages/Setup'
import { DefectList } from './pages/DefectList'
import { FeatureNew } from './pages/FeatureNew'
import { Session } from './pages/Session'
import { Summary } from './pages/Summary'
import { Sessions } from './pages/Sessions'
import { Settings } from './pages/Settings'

const FLASH_TIMEOUT_MS = 8000

export function App() {
  const { ready, needsSetup, warnings, bootstrap, dismissWarnings } = useStore()

  useEffect(() => {
    void bootstrap()
    return startPolling()
  }, [bootstrap])

  return (
    <div className="mx-auto flex max-w-page flex-col gap-4 px-6 py-9">
      {warnings.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card border border-warn/40 bg-warn/10 px-4 py-3.5">
          {warnings.map(w => (
            <span key={w} className="whitespace-pre-wrap text-[13px] text-warn-deep">{w}</span>
          ))}
          <button
            type="button"
            onClick={dismissWarnings}
            className="self-start text-[13px] text-muted underline"
          >
            รับทราบ
          </button>
        </div>
      )}

      <Flash />

      {!ready ? (
        <div className="px-1 text-[15px] text-faint">กำลังโหลด…</div>
      ) : (
        <ErrorBoundary>
          <Switch>
            <Route path="/setup" component={Setup} />
            <Route path="/settings" component={Settings} />
            <Route path="/sessions" component={Sessions} />
            <Route path="/feature/new" component={FeatureNew} />
            <Route path="/session/:id/summary">{p => <Summary id={p.id} />}</Route>
            <Route path="/session/:id">{p => <Session id={p.id} />}</Route>
            <Route path="/">{needsSetup ? <Redirect to="/setup" /> : <DefectList />}</Route>
            {/* URL มั่ว → กลับหน้าหลักพร้อมบอกเหตุ ห้ามปล่อยจอว่าง */}
            <Route><GoHome message="ไม่พบหน้าที่ขอ — พากลับมาหน้าหลักให้แล้ว" /></Route>
          </Switch>
        </ErrorBoundary>
      )}
    </div>
  )
}

function Flash() {
  const { flash, setFlash } = useStore()

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), FLASH_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [flash, setFlash])

  if (!flash) return null

  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-card border border-warn/40 bg-warn/10 px-4 py-3"
    >
      <span className="flex-1 text-[13px] text-warn-deep">{flash}</span>
      <button type="button" onClick={() => setFlash(null)} className="text-[13px] text-muted underline">
        ปิด
      </button>
    </div>
  )
}
