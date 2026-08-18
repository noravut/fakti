import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMessage, ServerMessage } from '@shared/types'
import type { SessionManager, TerminalClient } from './core/session'

const WS_PATH_RE = /^\/ws\/sessions\/([A-Za-z0-9-]+)$/

export function attachTerminalBridge(server: Server, manager: SessionManager): void {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const match = WS_PATH_RE.exec(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)
    if (!match?.[1]) {
      socket.destroy()
      return
    }
    const id = match[1]
    if (!manager.isLive(id)) {
      // session ปิดไปแล้ว — ตอบ 410 ให้ client รู้ว่าไม่ต้อง retry
      socket.write('HTTP/1.1 410 Gone\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, ws => bind(ws, id, manager))
  })
}

function bind(ws: WebSocket, id: string, manager: SessionManager): void {
  const client: TerminalClient = {
    send(msg: ServerMessage) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
    },
    close() {
      ws.close()
    },
  }

  if (!manager.attach(id, client)) {
    ws.close()
    return
  }

  ws.on('message', raw => {
    let msg: ClientMessage
    try {
      msg = JSON.parse(String(raw)) as ClientMessage
    } catch {
      return
    }
    if (msg.type === 'input' && typeof msg.data === 'string') {
      manager.input(id, msg.data)
    } else if (msg.type === 'resize') {
      manager.resize(id, msg.cols, msg.rows)
    }
  })

  const drop = () => manager.detach(id, client)
  ws.on('close', drop)
  ws.on('error', drop)
}
