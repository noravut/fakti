import http from 'node:http'
import https from 'node:https'
import type { CheckStage, RequestSpec, SourceConfig } from '@shared/types'
import { readSettings } from '../config'
import { readSecret } from './config'
import { hasUnresolved, interpolate, interpolateAll, interpolateDeep } from './expr'

const REQUEST_TIMEOUT_MS = 10_000

/** error ที่รู้ว่าพังตั้งแต่ขั้นไหน — ตัวนี้คือเหตุผลที่ไม่ใช้ fetch */
export class SourceError extends Error {
  constructor(
    readonly stage: CheckStage,
    message: string,
    readonly fix?: string,
  ) {
    super(message)
  }
}

export interface RawResponse {
  status: number
  body: string
  url: string
  /** เวลาจนได้ response header — เอาไปโชว์ว่า "142 ms" */
  ms: number
}

/** code ที่ node คืนมาเมื่อใบรับรองไม่ผ่าน ต่างจาก "ต่อไม่ติด" คนละเรื่องกัน */
function isTlsError(code: string | undefined): boolean {
  if (!code) return false
  return code.startsWith('ERR_TLS')
    || code.includes('CERT')
    || code.includes('SELF_SIGNED')
    || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'ERR_SSL_WRONG_VERSION_NUMBER'
}

function unreachableFix(src: SourceConfig): string {
  return src.network === 'internal'
    ? 'อยู่ในเน็ตเวิร์กบริษัทหรือต่อ VPN แล้วหรือยัง'
    : 'ตรวจ baseUrl หรือการเชื่อมต่ออินเทอร์เน็ต'
}

/** baseUrl ที่ขึ้นต้นด้วย / = ชี้กลับมาที่ fakti เอง (source mock ใช้ทางนี้) */
function resolveBase(baseUrl: string): string {
  if (!baseUrl.startsWith('/')) return baseUrl
  return `http://127.0.0.1:${readSettings().port}${baseUrl}`
}

function authHeaders(src: SourceConfig): Record<string, string> {
  const auth = src.auth
  if (!auth || auth.type === 'none') return {}

  const need = (ref: string): string => {
    const value = readSecret(ref)
    if (!value) {
      throw new SourceError(
        'auth',
        `ไม่พบ ${ref} ใน secrets.json`,
        `ใส่ค่าของ ${ref} ไว้ใน ~/.pat/secrets.json แล้วลองใหม่`,
      )
    }
    return value
  }

  switch (auth.type) {
    case 'bearer':
      return { Authorization: `Bearer ${need(auth.tokenRef)}` }
    case 'header':
      return { [auth.name]: need(auth.valueRef) }
    case 'basic':
      return {
        Authorization: `Basic ${Buffer.from(`${need(auth.userRef)}:${need(auth.passRef)}`).toString('base64')}`,
      }
    case 'query':
      return {}
  }
}

function authQuery(src: SourceConfig): Record<string, string> {
  const auth = src.auth
  if (auth?.type !== 'query') return {}
  const value = readSecret(auth.valueRef)
  if (!value) {
    throw new SourceError(
      'auth',
      `ไม่พบ ${auth.valueRef} ใน secrets.json`,
      `ใส่ค่าของ ${auth.valueRef} ไว้ใน ~/.pat/secrets.json แล้วลองใหม่`,
    )
  }
  return { [auth.name]: value }
}

export function buildUrl(
  src: SourceConfig,
  req: RequestSpec,
  vars: Record<string, string>,
): URL {
  const raw = interpolate(resolveBase(src.baseUrl) + req.path, vars)
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new SourceError('resolve', `baseUrl + path ไม่ใช่ URL ที่ถูกต้อง: ${raw}`, 'ตรวจ baseUrl ใน sources.json')
  }

  // {var} ที่ไม่มีค่า → ตัด param นั้นทิ้ง ไม่ส่งไปเป็น literal
  for (const [k, v] of Object.entries(interpolateAll(req.query, vars))) {
    url.searchParams.set(k, v)
  }
  for (const [k, v] of Object.entries(authQuery(src))) {
    url.searchParams.set(k, v)
  }
  return url
}

export async function callSource(
  src: SourceConfig,
  req: RequestSpec,
  vars: Record<string, string>,
): Promise<RawResponse> {
  const url = buildUrl(src, req, vars)

  if (hasUnresolved(url.pathname)) {
    throw new SourceError(
      'resolve',
      `ยังมีตัวแปรที่ไม่ได้กรอกใน path: ${decodeURIComponent(url.pathname)}`,
      'กรอกค่าตัวแปรของ source นี้ในหน้าตั้งค่า repo ให้ครบ',
    )
  }

  const isHttps = url.protocol === 'https:'
  const body = req.body === undefined ? undefined : JSON.stringify(interpolateDeep(req.body, vars))

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...interpolateAll(req.headers, vars),
    ...authHeaders(src),
  }
  if (body) headers['Content-Type'] = 'application/json'

  const started = Date.now()

  return new Promise<RawResponse>((resolve, reject) => {
    const request = (isHttps ? https : http).request(
      url,
      {
        method: req.method ?? 'GET',
        headers,
        // ปิดการตรวจใบรับรองเฉพาะ request นี้ ไม่ใช่ทั้ง process
        ...(isHttps && src.insecureTLS ? { rejectUnauthorized: false } : {}),
      },
      res => {
        const ms = Date.now() - started
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            url: url.toString(),
            ms,
          })
        })
        res.on('error', err => reject(new SourceError('http', `อ่าน response ไม่จบ: ${err.message}`)))
      },
    )

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new SourceError(
        'resolve',
        `ต่อ ${url.host} ไม่ได้ — หมดเวลารอ ${REQUEST_TIMEOUT_MS / 1000} วินาที`,
        unreachableFix(src),
      ))
    })

    request.on('error', (err: NodeJS.ErrnoException) => {
      if (err instanceof SourceError) {
        reject(err)
      } else if (isTlsError(err.code)) {
        reject(new SourceError(
          'tls',
          `ใบรับรองไม่ผ่านการตรวจสอบ (${err.code})`,
          'เปิด "ยอมรับใบรับรองภายใน" ถ้าเป็นเซิร์ฟเวอร์ในบริษัท',
        ))
      } else {
        reject(new SourceError(
          'resolve',
          `ต่อ ${url.host} ไม่ได้ (${err.code ?? err.message})`,
          unreachableFix(src),
        ))
      }
    })

    if (body) request.write(body)
    request.end()
  })
}
