import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { ClientMessage, DiffStat, ServerMessage, SessionState } from '@shared/types'

interface Props {
  sessionId: string
  onState: (state: SessionState) => void
  onDiff: (stat: DiffStat) => void
  onExit: (code: number) => void
  onDisconnect: (reason: 'gone' | 'error') => void
}

/** ตรงกับ palette ของ terminal ใน design doc */
const THEME = {
  background: '#16171B',
  foreground: '#D6D8DC',
  cursor: '#7CBFA5',
  cursorAccent: '#16171B',
  selectionBackground: '#8FBFE855',
  black: '#16171B',
  red: '#D9756B',
  green: '#7CBFA5',
  yellow: '#D9A44A',
  blue: '#8FBFE8',
  magenta: '#B99BE0',
  cyan: '#7FC7C7',
  white: '#D6D8DC',
  brightBlack: '#8E939C',
  brightRed: '#E58C82',
  brightGreen: '#93D3B8',
  brightYellow: '#E8BC6B',
  brightBlue: '#A8CFF0',
  brightMagenta: '#CBB2EC',
  brightCyan: '#9AD6D6',
  brightWhite: '#FAFAF9',
}

export function Terminal({ sessionId, onState, onDiff, onExit, onDisconnect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  // handler ล่าสุดโดยไม่ต้อง re-run effect (จะทำให้ pty หลุดการเชื่อมต่อ)
  const handlers = useRef({ onState, onDiff, onExit, onDisconnect })
  handlers.current = { onState, onDiff, onExit, onDisconnect }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const term = new XTerm({
      // ต้องมีฟอนต์ไทยต่อท้าย ไม่งั้น prompt ภาษาไทยที่ส่งเข้า pty โผล่มาเป็นกล่องเปล่า
      fontFamily: "'JetBrains Mono', 'IBM Plex Sans Thai', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.35,
      theme: THEME,
      cursorBlink: !reduced,
      scrollback: 10000,
      convertEol: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/ws/sessions/${sessionId}`)
    const send = (msg: ClientMessage) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    }

    ws.onopen = () => {
      send({ type: 'resize', cols: term.cols, rows: term.rows })
      term.focus()
    }

    ws.onmessage = event => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage
      } catch {
        return
      }
      if (msg.type === 'output') term.write(msg.data)
      else if (msg.type === 'state') handlers.current.onState(msg.state)
      else if (msg.type === 'diff') handlers.current.onDiff(msg.stat)
      else if (msg.type === 'exit') {
        term.write(`\r\n\x1b[90m— claude ปิดไปแล้ว (exit ${msg.code}) —\x1b[0m\r\n`)
        handlers.current.onExit(msg.code)
      }
    }

    // ต่อไม่ติด = session ปิดไปแล้ว (server ตอบ 410) หรือ server ดับ
    ws.onerror = () => handlers.current.onDisconnect('error')
    ws.onclose = event => {
      if (event.code !== 1000) handlers.current.onDisconnect('gone')
    }

    // ทุกปุ่มรวม Ctrl+C / Esc / ลูกศร ส่งดิบไป pty ไม่ดักเอง
    const dataSub = term.onData(data => send({ type: 'input', data }))

    const observer = new ResizeObserver(() => {
      try {
        fit.fit()
        send({ type: 'resize', cols: term.cols, rows: term.rows })
      } catch {
        /* host ถูกถอดออกไปแล้ว */
      }
    })
    observer.observe(host)

    return () => {
      observer.disconnect()
      dataSub.dispose()
      ws.onclose = null
      ws.close(1000)
      term.dispose()
    }
  }, [sessionId])

  return <div ref={hostRef} className="h-[420px] w-full bg-term-bg px-2 py-2" />
}
