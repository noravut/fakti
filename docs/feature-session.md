# Feature session — สั่งทำ feature จาก requirement แล้วให้ agent ทวนความครบ

สถานะ: design ยืนยันแล้ว 2026-09-08 · ลงมือทำใน branch `feature-sessions`

## เป้าหมาย

dev พิมพ์ "สิ่งที่ feature นี้ควรทำได้" บรรทัดละข้อ → fakti เปิด session ให้ claude ทำ
→ ทำเสร็จกดปุ่มเดียวให้ claude สวมบท QA ทวนว่าครบทุกข้อไหม — แยกจาก flow แก้ defect ที่มีอยู่

หลักการ: **เร็วกว่าพิมพ์ prompt เอง ไม่ใช่เพิ่มงาน** ถ้าขั้นไหน dev ทำเองในเทอร์มินัลได้เร็วกว่า
ขั้นนั้นไม่ควรอยู่ในนี้

## ไม่ทำในรอบนี้

- เพิ่ม requirement เข้า session ที่เปิดอยู่ (ต้องการเพิ่ม → เปิด session ใหม่บน branch เดิม)
- จำร่างที่พิมพ์ค้างไว้ข้าม reload
- ผูก feature กับ ticket ใน tracker
- หน้า Summary ไม่เปลี่ยน (ของ defect ก็ไม่ได้แสดงรายการ defect อยู่แล้ว)

## UX

### ทางเข้า — หน้า Defect list

ปุ่ม `สร้าง feature` (size sm, variant default) วางถัดจากปุ่ม `โหลดใหม่` ด้านขวาของหัวตาราง
ไม่แตะ layout ตาราง defect เลย

### หน้าใหม่ `/feature/new`

โครงเดียวกับหน้า Settings: `BackLink` → `Card` → `Header crumbs=[{label:'สร้าง feature'}]`
Esc กลับหน้าหลัก (`useEscapeBack('/')`)

ฟอร์ม 3 ช่อง เรียงบนลงล่าง กว้างเต็ม card

| ช่อง | ชนิด | บังคับ | หมายเหตุ |
|---|---|---|---|
| ชื่อ feature | Input | ✓ | ใช้เดาชื่อ branch `feat/<คำจากชื่อ>` |
| สิ่งที่ควรทำได้ | textarea mono, บรรทัดละข้อ | ✓ อย่างน้อย 1 ข้อ | ใต้ช่องแสดง preview `REQ-1 …` ทีละบรรทัด ให้เห็นรหัสที่ claude จะใช้ใน commit |
| ข้อมูลประกอบ | textarea | – | หน้าไหน ไฟล์ไหน ลิงก์ design ฯลฯ ว่างได้ |

ท้ายฟอร์ม: ปุ่ม `ถัดไป` (primary) กดได้เมื่อชื่อไม่ว่างและมี requirement ≥ 1 ข้อ
→ เปิด `ConfirmDialog` ตัวเดิม (เลือก branch + ดู/แก้ prompt) → สร้าง session → ไปหน้า session

ConfirmDialog ในโหมด feature: หัวเป็นชื่อ feature, ส่วน "รวมอยู่ใน" แสดงรายการ REQ,
ไม่มีตัวเลือก "ต่อใน session ที่เปิดอยู่"

### หน้า Session (เดิม) เมื่อ `kind = 'feature'`

- แถวรายการใต้ header เปลี่ยนจาก defect → REQ: `REQ-1` + ข้อความ + สถานะ
  สถานะใช้ heuristic เดิม (commit subject มีรหัส) label เปลี่ยนเป็น `✓ ทำแล้ว / ⟳ กำลังทำ / ○ รออยู่`
- ปุ่มล่างขวา `ตรวจ QA` → `ทวน requirement` (ตำแหน่ง/ขนาดเดิม)
- dialog เดิม เปลี่ยนแค่หัวกับคำอธิบาย ส่วน textarea/ปุ่มส่งเหมือนเดิม

### หน้า Sessions (เดิม)

คอลัมน์กลางที่แสดง `TC-1 · TC-2` → แสดงชื่อ feature แทน

## Data model

```ts
type SessionKind = 'defect' | 'feature'
interface Requirement { key: string; text: string }        // key = "REQ-1"
interface FeatureSpec { title: string; context?: string; requirements: Requirement[] }

Session.kind: SessionKind        // record เก่าไม่มี field → schema default 'defect'
Session.feature?: FeatureSpec    // มีเมื่อ kind = 'feature' · defects/defectIds = []
CreateSessionBody.feature?: FeatureSpec   // มี feature → defectIds ว่างได้
```

รหัส `REQ-n` fakti ตั้งให้ตามลำดับบรรทัด ผู้ใช้ไม่ต้องพิมพ์เอง

## Prompt

ไฟล์เดิม `.pat-task.md` / `.pat-qa.md` กลไกส่งเข้า pty เดิม

**เริ่มงาน** `buildFeaturePrompt(feature)`
ชื่อ → ข้อมูลประกอบ → รายการ REQ → กติกา: อ่านโค้ดตาม pattern ของ repo ก่อน,
REQ กำกวมให้ถามก่อนลงมือ, ทำครบทุกข้อและไม่เพิ่มสิ่งที่ไม่ได้ขอ, test ถ้า repo มี,
commit แยกตามข้อใส่ `REQ-n`, ห้าม push/เพิ่ม dependency, จบแล้วสรุปตาราง REQ → ทำที่ไหน/ทดสอบยังไง

**ทวน requirement** `buildFeatureQaPrompt(feature, changedFiles)`
ส่วนที่ใช้ร่วมกับ QA Gate เดิม (บทบาท QA/DEV, ขอบเขต, ทดสอบจริงห้ามอ่านโค้ด,
ตรวจข้อความ, ไม่หลอกตัวเอง, รอบ DEV, วนสูงสุด 3 รอบ) แยกเป็น constant ใช้ทั้งสองแบบ
ส่วนที่ต่าง:

- ขั้น 1 ทำ traceability ก่อน: ทุก REQ ต้องมี test case ≥ 1 · REQ ที่ไม่มีเคส = ไม่ผ่านทันที
- เพิ่มตรวจ "ตีความต่าง" (ทำได้แต่ไม่ใช่ที่ขอ) และ "ทำเกิน" (มีของนอก REQ)
- ตัดสินรายข้อ: ครบ / ไม่ครบ / ไม่ได้ทำ / ตีความต่าง พร้อมหลักฐานที่เห็นจริง
- รายงานจบเป็นตาราง REQ × สถานะ × หลักฐาน

## API

ไม่มี endpoint ใหม่

- `POST /api/sessions` รับ `feature` เพิ่ม (defectIds ว่างได้เมื่อมี feature)
- `POST /api/sessions/preview-prompt` รับ `feature` เพิ่ม
- `GET /:id/qa-prompt` เลือก builder ตาม `session.kind`
- `POST /:id/append` ตอบ 409 เมื่อ session เป็น feature

## จุดที่แตะ

| ไฟล์ | เปลี่ยนอะไร |
|---|---|
| `shared/types.ts` | type ใหม่ 3 ตัว + field ใน Session/CreateSessionBody |
| `server/src/core/config.ts` | sessionSchema รับ kind/feature (default 'defect') |
| `server/src/core/prompt.ts` | แยก QA template เป็นส่วน + builder ใหม่ 2 ตัว |
| `server/src/core/prompt.test.ts` | test builder ใหม่ + ยืนยันของเดิมไม่เปลี่ยน |
| `server/src/core/session.ts` | create/reopen/qaPrompt เลือกตาม kind · append ปฏิเสธ feature |
| `server/src/routes/sessions.ts` | schema รับ feature |
| `web/src/api.ts` | previewPrompt รับ feature |
| `web/src/format.ts` | `suggestFeatureBranch(title)` |
| `web/src/pages/FeatureNew.tsx` | หน้าใหม่ |
| `web/src/App.tsx` | route `/feature/new` |
| `web/src/components/ConfirmDialog.tsx` | รับ `feature?` แสดงหัว/รายการ/branch ตาม |
| `web/src/pages/DefectList.tsx` | ปุ่มสร้าง feature · กรอง feature session ออกจาก append |
| `web/src/pages/Session.tsx` | แถว REQ + label ปุ่ม/dialog ตาม kind |
| `web/src/pages/Sessions.tsx` | แสดงชื่อ feature |

## เกณฑ์ว่าเสร็จ

1. session defect เดิมทำงานเหมือนเดิมทุกจุด — test เดิมผ่าน, sessions.json เก่าอ่านได้
2. สร้าง feature จากฟอร์ม → เห็น REQ ในหน้า session → commit ที่มี `REQ-1` ทำให้แถวขึ้น ✓
3. กด `ทวน requirement` แล้วร่างมีชื่อ feature, ทุก REQ, ไฟล์ที่แก้
4. `pnpm typecheck && pnpm test` ผ่าน
