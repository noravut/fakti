import { useEffect } from 'react'
import { Redirect, Route, Switch } from 'wouter'
import { startPolling, useStore } from './store'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NavShell } from './components/NavShell'
import { GoHome } from './components/GoHome'
import { Banner, Button, Skeleton, Toast } from './components/ui'
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
    <NavShell>
      {warnings.length > 0 && (
        <Banner
          title={warnings.join('\n')}
          action={
            <Button size="sm" onClick={dismissWarnings}>รับทราบ</Button>
          }
        />
      )}

      <Flash />

      {!ready ? (
        // รูปร่างเท่าของจริงเสมอ ห้ามมีคำว่า "กำลังโหลด" ลอยๆ (G9)
        <div className="flex max-w-page flex-col gap-3">
          <Skeleton className="h-7 w-70" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
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
    </NavShell>
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
    <Toast
      tone="error"
      message={flash}
      action={<Button size="sm" variant="ghost" onClick={() => setFlash(null)}>ปิด</Button>}
    />
  )
}
