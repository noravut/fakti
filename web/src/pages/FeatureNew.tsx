import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import type { FeatureSpec } from '@shared/types'
import { api } from '../api'
import { useStore } from '../store'
import { parseRequirements } from '../format'
import { Header } from '../components/Header'
import { BackLink, useEscapeBack } from '../components/BackLink'
import { ConfirmDialog, type ConfirmPayload } from '../components/ConfirmDialog'
import { Button, Card, EmptyState, Input, SectionTitle } from '../components/ui'

const TEXTAREA =
  'w-full resize-y rounded border border-line bg-paper px-3 py-2 text-[13px] leading-[1.6] text-ink ' +
  'placeholder:text-faint'

/**
 * หน้าสั่งทำ feature จาก requirement ที่พิมพ์เอง — ทางเข้าคนละทางกับ defect list
 * ฟอร์ม 3 ช่องแล้วต่อเข้า ConfirmDialog เดิม (เลือก branch + ดู/แก้ prompt)
 */
export function FeatureNew() {
  const [, navigate] = useLocation()
  const { workspaces, activeWorkspaceId, gitStatus, refreshSessions } = useStore()
  const workspace = workspaces.find(w => w.id === activeWorkspaceId)
  useEscapeBack('/')

  const [title, setTitle] = useState('')
  const [reqText, setReqText] = useState('')
  const [context, setContext] = useState('')
  const [confirming, setConfirming] = useState(false)

  const feature = useMemo<FeatureSpec>(() => ({
    title: title.trim(),
    context: context.trim() || undefined,
    requirements: parseRequirements(reqText),
  }), [title, context, reqText])
  const ready = feature.title !== '' && feature.requirements.length > 0

  async function start(payload: ConfirmPayload) {
    if (!workspace) return
    const session = await api.sessions.create({
      workspaceId: workspace.id,
      defectIds: [],
      feature,
      branch: payload.branch,
      dirtyStrategy: payload.dirtyStrategy,
      prompt: payload.prompt,
    })
    await refreshSessions()
    setConfirming(false)
    navigate(`/session/${session.id}`)
  }

  return (
    <>
      <BackLink href="/" label="กลับไป Defect list" />

      <Card>
        <Header crumbs={[{ label: 'สร้าง feature' }]} />

        {!workspace ? (
          <div className="px-5 py-6">
            <EmptyState
              title="ยังไม่มี repo ให้ทำงาน"
              hint="เพิ่ม repo ในหน้าตั้งค่าก่อน แล้วกลับมาสร้าง feature"
              action={<Link href="/settings"><Button size="sm">ไปหน้าตั้งค่า</Button></Link>}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-5 px-5 pb-5 pt-[18px]">
            <div className="flex flex-col gap-1">
              <SectionTitle>สร้าง feature</SectionTitle>
              <span className="text-[13px] text-muted">
                พิมพ์สิ่งที่ feature นี้ควรทำได้ บรรทัดละข้อ claude จะทำตามนั้น
                ทำเสร็จกด "ทวน requirement" ในหน้า session เพื่อให้มันตรวจว่าครบทุกข้อ
              </span>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">ชื่อ feature</span>
              <Input
                autoFocus
                value={title}
                spellCheck={false}
                placeholder="เช่น Export รายงานเป็น CSV"
                onChange={e => setTitle(e.target.value)}
                className="w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">
                สิ่งที่ควรทำได้
                <span className="text-faint"> · บรรทัดละข้อ · fakti ตั้งรหัส REQ-n ให้ claude อ้างใน commit</span>
              </span>
              <textarea
                value={reqText}
                rows={6}
                spellCheck={false}
                placeholder={'กดปุ่ม Export แล้วได้ไฟล์ CSV\nหัวคอลัมน์เป็นภาษาเดียวกับหน้าจอ\nไม่มีข้อมูลให้ปุ่มกดไม่ได้พร้อมบอกเหตุ'}
                onChange={e => setReqText(e.target.value)}
                className={TEXTAREA}
              />
              {feature.requirements.length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  {feature.requirements.map(r => (
                    <div key={r.key} className="flex min-w-0 items-baseline gap-2.5 text-[13px]">
                      <span className="w-14 shrink-0 font-mono text-faint">{r.key}</span>
                      <span className="truncate" title={r.text}>{r.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted">
                ข้อมูลประกอบ<span className="text-faint"> · ไม่บังคับ · หน้าไหน ไฟล์ไหน ลิงก์ design</span>
              </span>
              <textarea
                value={context}
                rows={3}
                spellCheck={false}
                onChange={e => setContext(e.target.value)}
                className={TEXTAREA}
              />
            </label>

            <div className="flex items-center justify-end gap-3 border-t border-hair pt-4">
              {!ready && <span className="text-[13px] text-faint">ต้องมีชื่อและอย่างน้อย 1 ข้อ</span>}
              <Button variant="primary" disabled={!ready} onClick={() => setConfirming(true)}>
                ถัดไป
              </Button>
            </div>
          </div>
        )}
      </Card>

      {confirming && workspace && (
        <ConfirmDialog
          defects={[]}
          feature={feature}
          workspace={workspace}
          openSessions={[]}
          dirtyCount={gitStatus?.isDirty ? gitStatus.dirtyCount : 0}
          onCancel={() => setConfirming(false)}
          onSubmit={start}
        />
      )}
    </>
  )
}
