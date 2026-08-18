import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { z } from 'zod'
import type { BootstrapResponse } from '@shared/types'
import {
  DEFAULT_PORT, PAT_DIR, getWarnings, readSettings, readWorkspaces, writeSettings,
} from './core/config'
import { SessionManager, checkPty } from './core/session'
import { workspaceRoutes } from './routes/workspaces'
import { defectRoutes } from './routes/defects'
import { sessionRoutes } from './routes/sessions'
import { attachTerminalBridge } from './ws'

// bind แค่ loopback — server ตัวนี้ spawn process ได้ เปิดออกเน็ตไม่ได้เด็ดขาด
const HOST = '127.0.0.1'
const WEB_DIST = path.resolve(__dirname, '../../web/dist')

const manager = new SessionManager(readWorkspaces)
const pty = checkPty()

const app = new Hono()

app.get('/api/bootstrap', c => {
  const workspaces = readWorkspaces()
  const settings = readSettings()
  const warnings = getWarnings()
  if (!pty.ok && pty.message) warnings.push(pty.message)

  // active ที่ชี้ไป workspace ที่ถูกลบไปแล้ว ให้ตกมาที่ตัวแรก
  const active = workspaces.some(w => w.id === settings.activeWorkspaceId)
    ? settings.activeWorkspaceId
    : workspaces[0]?.id ?? null

  const body: BootstrapResponse = {
    workspaces,
    activeWorkspaceId: active,
    sessions: manager.list(),
    needsSetup: workspaces.length === 0,
    warnings,
  }
  return c.json(body)
})

const settingsBody = z.object({
  activeWorkspaceId: z.string().nullable().optional(),
  port: z.number().int().min(1).max(65535).optional(),
})

app.get('/api/settings', c => c.json({ ...readSettings(), configDir: PAT_DIR }))

app.patch('/api/settings', async c => {
  const parsed = settingsBody.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'ข้อมูลไม่ถูกต้อง' }, 400)
  const next = { ...readSettings(), ...parsed.data }
  writeSettings(next)
  return c.json(next)
})

app.route('/api/workspaces', workspaceRoutes)
app.route('/api/defects', defectRoutes)
app.route('/api/sessions', sessionRoutes(manager))

app.all('/api/*', c => c.json({ error: 'ไม่มี endpoint นี้' }, 404))

// ── static (prod) ───────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const hasWebBuild = fs.existsSync(path.join(WEB_DIST, 'index.html'))

app.get('*', c => {
  if (!hasWebBuild) {
    return c.text('ยังไม่ได้ build หน้าเว็บ — รัน pnpm dev แล้วเปิด http://127.0.0.1:5173', 404)
  }
  const requested = path.resolve(WEB_DIST, `.${new URL(c.req.url).pathname}`)
  const file = requested.startsWith(WEB_DIST) && fs.existsSync(requested) && fs.statSync(requested).isFile()
    ? requested
    : path.join(WEB_DIST, 'index.html') // SPA fallback

  return c.body(fs.readFileSync(file), 200, {
    'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
  })
})

// ── boot ────────────────────────────────────────────────────────

const port = readSettings().port || DEFAULT_PORT
const server = serve({ fetch: app.fetch, hostname: HOST, port }, info => {
  const url = `http://${HOST}:${info.port}`
  console.log(`\n  ปัด (pat) — ${url}`)
  console.log(`  config   ${PAT_DIR}`)
  if (!pty.ok) console.error(`\n  [!] ${pty.message}\n`)
  if (hasWebBuild) {
    openBrowser(url)
  } else {
    console.log('  dev mode — เปิด http://127.0.0.1:5173 (Vite proxy /api และ /ws มาที่นี่)\n')
  }
})

attachTerminalBridge(server as unknown as import('node:http').Server, manager)
manager.start()

function openBrowser(url: string): void {
  if (process.env.PAT_NO_OPEN) return
  const [cmd, args] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]]
  execFile(cmd as string, args as string[], () => {
    /* เปิดไม่ได้ก็ไม่เป็นไร URL อยู่ใน log แล้ว */
  })
}

let shuttingDown = false
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    console.log('\n  ปิด session ทั้งหมด…')
    void manager.shutdown().finally(() => {
      server.close(() => process.exit(0))
      setTimeout(() => process.exit(0), 2000).unref()
    })
  })
}
