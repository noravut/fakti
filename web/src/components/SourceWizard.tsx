import { useState } from 'react'
import { Check, X } from 'lucide-react'
import type {
  CheckResult, CheckStage, DiscoveredField, FieldMap, ProbeResult, SourceAuth, SourceConfig,
} from '@shared/types'
import { api } from '../api'
import { Button, Field, Input, Select, Tag, Toggle } from './ui'

const STAGE_LABEL: Record<CheckStage, string> = {
  resolve: 'เชื่อมต่อได้',
  tls: 'ใบรับรอง',
  http: 'HTTP',
  auth: 'สิทธิ์',
  parse: 'รูปแบบ JSON',
  shape: 'รูปแบบข้อมูล',
  map: 'Field mapping',
}

/** field ที่ fakti ใช้ — id จำเป็น ที่เหลือไม่มีก็ยังใช้งานได้ */
const FIELDS: { key: keyof FieldMap; label: string; hint?: string; required?: boolean }[] = [
  { key: 'id', label: 'รหัสภายใน', hint: 'ค่าที่ไม่ซ้ำกัน ใช้อ้างถึงรายการ', required: true },
  { key: 'key', label: 'รหัสที่คนอ่าน', hint: 'เช่น DEF-3795 — ใช้ตั้งชื่อ branch' },
  { key: 'title', label: 'ชื่อเรื่อง' },
  { key: 'description', label: 'รายละเอียด' },
  { key: 'severity', label: 'ความรุนแรง' },
  { key: 'status', label: 'สถานะ' },
  { key: 'reporter', label: 'ผู้แจ้ง' },
  { key: 'assignee', label: 'ผู้รับผิดชอบ' },
  { key: 'tags', label: 'ป้าย' },
  { key: 'createdAt', label: 'วันที่แจ้ง' },
]

const AUTH_TYPES: { value: SourceAuth['type']; label: string }[] = [
  { value: 'none', label: 'ไม่ต้องยืนยันตัวตน' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'header', label: 'Header เฉพาะ' },
  { value: 'basic', label: 'Username + password' },
  { value: 'query', label: 'Token ใน query string' },
]

function emptySource(): SourceConfig {
  return {
    id: '',
    label: '',
    network: 'public',
    baseUrl: '',
    vars: [],
    list: { method: 'GET', path: '' },
    itemsPath: '',
    map: { id: '' },
  }
}

interface Props {
  /** มีค่า = แก้ของเดิม · ไม่มี = สร้างใหม่ */
  initial?: SourceConfig
  onSaved: () => void
  onCancel: () => void
}

/**
 * ตั้งค่า source ทั้งหมดจากหน้าเว็บ แทนการเขียน ~/.pat/sources.json ด้วยมือ
 *
 * หัวใจอยู่ที่ปุ่ม "ดึงตัวอย่าง" — ยิง API จริงแล้วไล่ field ที่ได้มาเป็น dropdown
 * ให้เลือกพร้อมค่าตัวอย่าง ส่วน openStatuses กับ severityOrder เติมจากค่าที่
 * tracker ส่งมาจริง ผู้ใช้จึงไม่ต้องเดาว่าเขาสะกด status ว่าอะไร
 */
export function SourceWizard({ initial, onSaved, onCancel }: Props) {
  const editing = Boolean(initial)
  const [draft, setDraft] = useState<SourceConfig>(initial ?? emptySource())
  const [vars, setVars] = useState<Record<string, string>>({})
  const [secret, setSecret] = useState('')
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [busy, setBusy] = useState<'probe' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<SourceConfig>) => setDraft(d => ({ ...d, ...patch }))
  const setMap = (key: keyof FieldMap, value: string) =>
    setDraft(d => ({ ...d, map: { ...d.map, [key]: value || undefined } }))

  const authType = draft.auth?.type ?? 'none'
  const secretRef = secretRefOf(draft.auth)
  const missingRequired = draft.vars.filter(v => v.required && !vars[v.key]?.trim())
  const canProbe = Boolean(draft.baseUrl.trim() && draft.list.path.trim())
    && missingRequired.length === 0
  const canSave = Boolean(draft.id.trim() && draft.label.trim() && draft.map.id?.trim())
    && draft.baseUrl.trim().length > 0 && draft.list.path.trim().length > 0

  async function runProbe() {
    setBusy('probe')
    setError(null)
    try {
      // เก็บ token ให้ก่อน ไม่งั้นขั้น auth พังทุกครั้งแล้วผู้ใช้ไม่รู้ว่าต้องไปแก้ไฟล์
      if (secretRef && secret.trim()) await api.sources.saveSecret(secretRef, secret.trim())
      setProbe(await api.sources.probe({ ...draft, id: draft.id || 'draft' }, vars))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ดึงตัวอย่างไม่สำเร็จ')
      setProbe(null)
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    setError(null)
    try {
      if (secretRef && secret.trim()) await api.sources.saveSecret(secretRef, secret.trim())
      if (editing && initial) await api.sources.update(initial.id, draft)
      else await api.sources.create(draft)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  const fields = probe?.fields ?? []
  const statusValues = draft.map.status ? probe?.values[draft.map.status] ?? [] : []
  const severityValues = draft.map.severity ? probe?.values[draft.map.severity] ?? [] : []

  return (
    <div className="flex flex-col gap-6">
      {/* ── ขั้นที่ 1 ── */}
      <section className="flex flex-col gap-4">
        <StepTitle n={1} title="ต่อให้ได้ก่อน" hint="กรอกแค่พอยิงถึง แล้วกดดึงตัวอย่าง" />

        <div className="flex flex-wrap gap-4">
          <Field label="ชื่อที่แสดง" hint="เช่น Jira ของทีม">
            <Input
              value={draft.label}
              spellCheck={false}
              placeholder="Jira ของทีม"
              onChange={e => {
                const label = e.target.value
                // id ตั้งให้จากชื่อ แก้เองได้ และล็อกไว้ตอนแก้ของเดิมเพราะเปลี่ยน id ไม่ได้
                set(editing ? { label } : { label, id: slug(label) })
              }}
              className="w-70"
            />
          </Field>
          <Field label="id" hint={editing ? 'เปลี่ยนไม่ได้หลังสร้างแล้ว' : 'ใช้อ้างในไฟล์ตั้งค่า'}>
            <Input
              value={draft.id}
              disabled={editing}
              spellCheck={false}
              onChange={e => set({ id: slug(e.target.value) })}
              className="w-60"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4">
          <Field label="baseUrl" hint="ใส่ {ชื่อตัวแปร} ได้ เช่น https://{host}/rest/api/2">
            <Input
              value={draft.baseUrl}
              spellCheck={false}
              placeholder="https://{host}/rest/api/2"
              onChange={e => set({ baseUrl: e.target.value })}
              className="w-120"
            />
          </Field>
          <Field label="path ของรายการ" hint="ต่อจาก baseUrl">
            <Input
              value={draft.list.path}
              spellCheck={false}
              placeholder="/search"
              onChange={e => set({ list: { ...draft.list, path: e.target.value } })}
              className="w-70"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <Field label="เครือข่าย" hint="ในบริษัท = ต่อไม่ถึงถือว่าปกติ ไม่ใช่ error">
            <Select
              value={draft.network}
              onChange={e => set({ network: e.target.value as SourceConfig['network'] })}
              className="w-60"
            >
              <option value="public">อินเทอร์เน็ตทั่วไป</option>
              <option value="internal">ในเครือข่ายบริษัท</option>
            </Select>
          </Field>
          <label className="mt-7 inline-flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={draft.insecureTLS ?? false}
              onChange={e => set({ insecureTLS: e.target.checked || undefined })}
            />
            ข้ามการตรวจใบรับรอง (cert เป็น self-signed)
          </label>
        </div>

        <AuthFields
          authType={authType}
          auth={draft.auth}
          secret={secret}
          onType={type => set({ auth: authFor(type, draft.id || 'source') })}
          onAuth={auth => set({ auth })}
          onSecret={setSecret}
        />

        <VarEditor
          vars={draft.vars}
          values={vars}
          onVars={next => set({ vars: next })}
          onValues={setVars}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={!canProbe} loading={busy === 'probe'} onClick={() => void runProbe()}>
            ดึงตัวอย่างจาก API
          </Button>
          {!canProbe && (
            <span className="text-sm text-faint">
              {missingRequired.length > 0
                ? `กรอกค่าของ ${missingRequired.map(v => v.label || v.key).join(', ')} ก่อน`
                : 'กรอก baseUrl และ path ของรายการก่อน'}
            </span>
          )}
        </div>

        {error && <span className="text-sm text-danger">{error}</span>}
        {probe && <StageReport checks={probe.checks} items={probe.items} />}
      </section>

      {/* ── ขั้นที่ 2 ── */}
      {fields.length > 0 && (
        <section className="flex flex-col gap-4 border-t border-hair pt-5">
          <StepTitle
            n={2}
            title="จับคู่ field"
            hint={`เลือกจาก ${fields.length} field ที่ API ส่งมาจริง — ไม่ต้องพิมพ์ path เอง`}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {FIELDS.map(f => (
              <Field
                key={f.key}
                label={f.required ? `${f.label} *` : f.label}
                hint={sampleOf(fields, draft.map[f.key]) ?? f.hint}
              >
                <Select value={draft.map[f.key] ?? ''} onChange={e => setMap(f.key, e.target.value)}>
                  <option value="">— ไม่ใช้ —</option>
                  {fields.map(d => (
                    <option key={d.path} value={d.path}>
                      {d.path}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          {draft.map.key && (
            <Field label="คำนำหน้ารหัส" hint="เติมหน้าค่าที่ได้ เช่น DEF- ทำให้ 3795 กลายเป็น DEF-3795">
              <Input
                value={draft.map.keyPrefix ?? ''}
                spellCheck={false}
                placeholder="DEF-"
                onChange={e => setDraft(d => ({
                  ...d,
                  map: { ...d.map, keyPrefix: e.target.value || undefined },
                }))}
                className="w-60"
              />
            </Field>
          )}

          <MapPreview checks={probe?.checks ?? []} />
        </section>
      )}

      {/* ── ขั้นที่ 3 ── */}
      {(statusValues.length > 0 || severityValues.length > 0) && (
        <section className="flex flex-col gap-4 border-t border-hair pt-5">
          <StepTitle
            n={3}
            title="สถานะและความรุนแรง"
            hint="ค่าพวกนี้มาจากข้อมูลจริงที่ดึงมา ไม่ใช่ค่าที่เราเดา"
          />

          {statusValues.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted">สถานะที่ถือว่า “ยังไม่ปิด”</span>
              <div className="flex flex-wrap gap-2">
                {statusValues.map(v => (
                  <Toggle
                    key={v.value}
                    pressed={(draft.openStatuses ?? []).includes(v.value)}
                    onClick={() => set({ openStatuses: toggleIn(draft.openStatuses, v.value) })}
                  >
                    {v.value}
                    <span className="text-faint">{v.count}</span>
                  </Toggle>
                ))}
              </div>
              <span className="text-sm text-faint">
                ไม่ติ๊กอะไรเลย = เอามาทั้งหมด · ที่ไม่ติ๊กจะถือว่าปิดแล้ว
              </span>
            </div>
          )}

          {severityValues.length > 0 && (
            <SeverityOrder
              values={severityValues.map(v => v.value)}
              order={draft.severityOrder ?? []}
              onChange={severityOrder => set({ severityOrder })}
            />
          )}
        </section>
      )}

      {/* ── บันทึก ── */}
      <div className="flex flex-wrap items-center gap-3 border-t border-hair pt-4">
        {!probe && (
          <span className="text-sm text-faint">ยังไม่ได้ลองดึงข้อมูล — บันทึกได้ แต่ยังไม่รู้ว่าใช้ได้จริงไหม</span>
        )}
        <span className="flex-1" />
        <Button onClick={onCancel} disabled={busy !== null}>ยกเลิก</Button>
        <Button variant="primary" disabled={!canSave} loading={busy === 'save'} onClick={() => void save()}>
          {editing ? 'บันทึกการแก้ไข' : 'เพิ่ม source'}
        </Button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── ชิ้นย่อย */

function StepTitle({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-2 text-lg font-medium">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-pine-soft text-xs font-semibold text-pine">
          {n}
        </span>
        {title}
      </span>
      <span className="text-sm text-muted">{hint}</span>
    </div>
  )
}

function StageReport({ checks, items }: { checks: CheckResult[]; items: number }) {
  const failed = checks.find(c => !c.ok)
  return (
    <div className="flex flex-col gap-2 rounded border border-hair bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {checks.map(c => (
          <span
            key={c.stage}
            title={c.detail}
            className={
              'inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-xs font-medium ' +
              (c.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')
            }
          >
            {c.ok
              ? <Check aria-hidden size={12} strokeWidth={3} />
              : <X aria-hidden size={12} strokeWidth={3} />}
            {STAGE_LABEL[c.stage]}
          </span>
        ))}
        {!failed && <span className="text-sm text-muted">· ได้ {items} รายการ</span>}
      </div>
      {failed && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-danger">{failed.detail}</span>
          {failed.fix && <span className="text-sm text-muted">{failed.fix}</span>}
          {failed.availableKeys && failed.availableKeys.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {failed.availableKeys.map(k => <Tag key={k} tone="outline">{k}</Tag>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** แถวตัวอย่างที่ map แล้ว — เห็นทันทีว่าเลือก field ถูกไหม */
function MapPreview({ checks }: { checks: CheckResult[] }) {
  const preview = checks.find(c => c.stage === 'map')?.preview
  if (!preview) return null
  return (
    <div className="flex flex-col gap-2 rounded border border-pine-line bg-pine-soft px-4 py-3">
      <span className="text-sm text-pine">รายการแรกหลังจับคู่แล้ว</span>
      <div className="flex flex-wrap items-center gap-2">
        {preview.key && <span className="font-mono text-sm">{preview.key}</span>}
        <span className="min-w-0 flex-1 truncate text-base text-ink">
          {preview.title || <span className="text-faint">ไม่มีชื่อเรื่อง</span>}
        </span>
        {preview.severityLabel && <Tag tone="warn">{preview.severityLabel}</Tag>}
        {preview.status && <Tag tone="neutral">{preview.status}</Tag>}
      </div>
      <span className="text-sm text-muted">
        {preview.reporter ? `แจ้งโดย ${preview.reporter}` : 'ไม่รู้ผู้แจ้ง'}
        {preview.assignee ? ` · ผู้รับผิดชอบ ${preview.assignee}` : ''}
      </span>
    </div>
  )
}

function AuthFields({
  authType, auth, secret, onType, onAuth, onSecret,
}: {
  authType: SourceAuth['type']
  auth: SourceAuth | undefined
  secret: string
  onType: (type: SourceAuth['type']) => void
  onAuth: (auth: SourceAuth) => void
  onSecret: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Field label="การยืนยันตัวตน">
        <Select
          value={authType}
          onChange={e => onType(e.target.value as SourceAuth['type'])}
          className="w-70"
        >
          {AUTH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
      </Field>

      {auth?.type === 'header' && (
        <Field label="ชื่อ header">
          <Input
            value={auth.name}
            spellCheck={false}
            placeholder="X-Api-Key"
            onChange={e => onAuth({ ...auth, name: e.target.value })}
            className="w-60"
          />
        </Field>
      )}
      {auth?.type === 'query' && (
        <Field label="ชื่อ query param">
          <Input
            value={auth.name}
            spellCheck={false}
            placeholder="api_key"
            onChange={e => onAuth({ ...auth, name: e.target.value })}
            className="w-60"
          />
        </Field>
      )}

      {authType !== 'none' && (
        <Field
          label={auth?.type === 'basic' ? 'รหัสผ่าน' : 'Token'}
          hint="เก็บลง ~/.pat/secrets.json ที่เครื่องคุณ ไม่ปนกับไฟล์ที่แชร์ได้"
        >
          <Input
            type="password"
            value={secret}
            spellCheck={false}
            placeholder="วางค่าจริงที่นี่"
            onChange={e => onSecret(e.target.value)}
            className="w-70"
          />
        </Field>
      )}

      {auth?.type === 'basic' && (
        <Field label="Username">
          <Input
            value={auth.userRef}
            spellCheck={false}
            onChange={e => onAuth({ ...auth, userRef: e.target.value })}
            className="w-60"
          />
        </Field>
      )}
    </div>
  )
}

/** ตัวแปรที่ต่าง repo ต่างค่า — ประกาศที่นี่ แล้วแต่ละ repo กรอกค่าเอง */
function VarEditor({
  vars, values, onVars, onValues,
}: {
  vars: SourceConfig['vars']
  values: Record<string, string>
  onVars: (next: SourceConfig['vars']) => void
  onValues: (next: Record<string, string>) => void
}) {
  const [key, setKey] = useState('')

  function add() {
    const clean = slug(key)
    if (!clean || vars.some(v => v.key === clean)) return
    onVars([...vars, { key: clean, label: clean, required: true }])
    setKey('')
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-hair bg-surface px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-ink">ตัวแปร</span>
        <span className="text-sm text-faint">
          ค่าที่ต่าง repo ต่างกัน เช่น host หรือ project key · ใส่ <span className="font-mono">{'{ชื่อ}'}</span> ใน
          baseUrl หรือ path แล้วประกาศที่นี่ · ค่าที่กรอกด้านล่างใช้แค่ตอนทดสอบ
        </span>
      </div>

      {vars.map(v => (
        <div key={v.key} className="flex flex-wrap items-end gap-2">
          <Field label={v.key}>
            <Input
              value={values[v.key] ?? ''}
              spellCheck={false}
              placeholder="ค่าสำหรับทดสอบ"
              onChange={e => onValues({ ...values, [v.key]: e.target.value })}
              className="w-70"
            />
          </Field>
          <Button
            variant="danger"
            onClick={() => {
              onVars(vars.filter(x => x.key !== v.key))
              const { [v.key]: _drop, ...rest } = values
              onValues(rest)
            }}
          >
            เอาออก
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-2">
        <Field label="เพิ่มตัวแปร">
          <Input
            value={key}
            spellCheck={false}
            placeholder="host"
            onChange={e => setKey(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            className="w-60"
          />
        </Field>
        <Button disabled={!slug(key)} onClick={add}>เพิ่ม</Button>
      </div>
    </div>
  )
}

/** เรียงความรุนแรงจากหนักไปเบา — ลำดับคือสิ่งที่ map ลง critical/high/medium/low */
function SeverityOrder({
  values, order, onChange,
}: { values: string[]; order: string[]; onChange: (next: string[]) => void }) {
  const ranked = order.filter(v => values.includes(v))
  const rest = values.filter(v => !ranked.includes(v))
  const LEVELS = ['critical', 'high', 'medium', 'low']

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted">เรียงความรุนแรงจากหนักไปเบา</span>
      <div className="flex flex-col gap-1.5">
        {ranked.map((v, i) => (
          <div key={v} className="flex items-center gap-2">
            <Tag tone={i === 0 ? 'danger' : i === 1 ? 'warn' : 'neutral'}>{LEVELS[i] ?? 'low'}</Tag>
            <span className="min-w-0 flex-1 truncate text-base">{v}</span>
            <Button
              size="sm"
              disabled={i === 0}
              onClick={() => onChange(swap(ranked, i, i - 1))}
              aria-label={`เลื่อน ${v} ขึ้น`}
            >
              ขึ้น
            </Button>
            <Button size="sm" onClick={() => onChange(ranked.filter(x => x !== v))}>เอาออก</Button>
          </div>
        ))}
      </div>
      {rest.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-sm text-faint">ยังไม่จัดลำดับ:</span>
          {rest.map(v => (
            <Button key={v} size="sm" onClick={() => onChange([...ranked, v])}>{v}</Button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────── ตัวช่วย */

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
}

function toggleIn(list: string[] | undefined, value: string): string[] {
  const current = list ?? []
  return current.includes(value) ? current.filter(v => v !== value) : [...current, value]
}

function swap(list: string[], a: number, b: number): string[] {
  const next = [...list]
  const first = next[a]
  const second = next[b]
  if (first === undefined || second === undefined) return list
  next[a] = second
  next[b] = first
  return next
}

function sampleOf(fields: DiscoveredField[], path: string | undefined): string | undefined {
  if (!path) return undefined
  const found = fields.find(f => f.path === path)
  return found ? `ได้: ${found.sample}` : undefined
}

/** ref ของ secret ที่ auth แบบนั้นต้องใช้ — ชื่อเดียวต่อ source พอ */
function secretRefOf(auth: SourceAuth | undefined): string | null {
  if (!auth) return null
  switch (auth.type) {
    case 'bearer': return auth.tokenRef
    case 'header': return auth.valueRef
    case 'query': return auth.valueRef
    case 'basic': return auth.passRef
    case 'none': return null
  }
}

function authFor(type: SourceAuth['type'], id: string): SourceAuth {
  const ref = `${slug(id) || 'source'}Token`
  switch (type) {
    case 'none': return { type: 'none' }
    case 'bearer': return { type: 'bearer', tokenRef: ref }
    case 'header': return { type: 'header', name: 'X-Api-Key', valueRef: ref }
    case 'query': return { type: 'query', name: 'api_key', valueRef: ref }
    case 'basic': return { type: 'basic', userRef: '', passRef: ref }
  }
}
