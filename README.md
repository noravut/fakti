# ปัด (pat)

Dev tool ที่รันบนเครื่องตัวเอง สำหรับหยิบ defect ไปให้ Claude Code แก้ โดยที่ dev ยังคุม terminal session ได้เต็มที่

## ต้องมีก่อน

- Node 20+ และ pnpm
- `claude` อยู่ใน `PATH` (ล็อกอินแล้ว — pat ส่ง `process.env` ทั้งก้อนเข้า pty เพื่อให้หา credential ใน `~/.claude` เจอ)
- build toolchain สำหรับ `node-pty`
  - macOS: `xcode-select --install`
  - Linux: `sudo apt install -y build-essential python3`

## เริ่มใช้

```bash
pnpm install
pnpm build
pnpm start          # http://127.0.0.1:5273 — เปิด browser ให้อัตโนมัติ
```

โหมด dev (Vite ที่ 5173 proxy `/api` กับ `/ws` ไป 5273):

```bash
pnpm dev
```

## โครง

| ที่ | อะไร |
|---|---|
| `shared/types.ts` | type ที่เป็น API contract — import ทั้งสองฝั่งผ่าน alias `@shared/*` |
| `server/src/core/` | `config` (`~/.pat/*.json` + zod), `git`, `session` (pty lifecycle), `prompt` |
| `server/src/routes/` | workspaces · defects · sessions |
| `server/src/ws.ts` | WebSocket terminal bridge |
| `web/src/` | React + Vite + Tailwind ตาม design doc |

Config อยู่ที่ `~/.pat/` — `workspaces.json`, `sessions.json`, `settings.json`
เปิดแก้ด้วย editor ได้ตรงๆ ทุกไฟล์ผ่าน zod ตอนอ่าน ถ้า parse ไม่ผ่านจะ backup เป็น `.bak`
แล้วเริ่มใหม่พร้อมเตือนในหน้าเว็บ — ไม่ crash

## เรื่องที่ตัดสินใจไว้ ต่างจากสเปคเล็กน้อย

**1. prompt ส่งผ่านไฟล์ ไม่ยิงหลายบรรทัดเข้า pty**

Claude Code TUI ตีความ newline เป็นการกด Enter ถ้าเขียน prompt หลายบรรทัดเข้าไปตรงๆ
prompt จะถูกตัดเป็นหลายข้อความ และ agent เริ่มทำงานตั้งแต่บรรทัดแรกที่ยังไม่มีบริบท
pat จึงเขียน `.pat-task.md` ลง repo (เพิ่มใน `.git/info/exclude` ให้แล้ว) แล้วส่งเข้า pty
แค่บรรทัดเดียวว่า `อ่าน .pat-task.md แล้วทำตามนั้น` — ทางนี้สเปคเปิดไว้ให้อยู่แล้วใน §7

**2. `Session` มี field `createdBranch` เพิ่มมา**

สเปค §8 ให้ `discard` ทำ `checkout - && branch -D <name>` แต่เคส `dirtyStrategy: 'keep'`
pat ไม่ได้สร้าง branch ใหม่ — มันทำงานบน branch ของผู้ใช้เอง ถ้าลบตามสูตรนั้นคือกินงานคนอื่น
`createdBranch` เลยบันทึกไว้ว่า pat เป็นคนสร้าง branch นี้หรือเปล่า และ `discard`
จะลบ branch เฉพาะตอนเป็น `true` เท่านั้น ส่วน "กลับ branch เดิม" ใช้ `workspace.baseBranch`
แทน `checkout -` เพราะ reflog เปลี่ยนได้ระหว่างทาง

**3. endpoint ที่เพิ่มจากตาราง API**

- `PATCH /api/settings` — สลับ workspace ที่ใช้อยู่ (bootstrap คืนค่ามาแต่ไม่มีทางเขียนกลับ)
- `POST /api/sessions/:id/append` — ตัวเลือก "ต่อใน session ที่เปิดอยู่" ใน confirm dialog ตาม design doc
- `POST /api/sessions/:id/reopen` — ปุ่ม "เปิด session ใหม่บน branch เดิม" ตาม §6
- `GET /api/bootstrap` คืน `warnings` เพิ่ม เพื่อแจ้งเรื่อง config พังตาม §4

**4. diff broadcast ตอนสถานะเปลี่ยนด้วย**

สเปคให้ส่ง diff ทุก 5 วินาทีตอน `state = working` แต่ช่วงงานสั้นกว่า 5 วินาที
จะไม่ได้อัปเดตเลย pat เลยส่ง diff เพิ่มหนึ่งครั้งทุกครั้งที่สถานะเปลี่ยน —
จังหวะที่งานเพิ่งหยุดคือตอนที่ diff นิ่งและตรงที่สุด

**5. ฟอนต์ mono ต้องมีฟอนต์ไทยต่อท้าย**

JetBrains Mono ไม่มีสระและพยัญชนะไทย ทั้ง Tailwind `font-mono` และ `fontFamily` ของ xterm
จึงต่อ `IBM Plex Sans Thai` ไว้เป็นตัวถัดไป ไม่งั้นข้อความไทยกลายเป็นกล่องเปล่า

## Navigation

URL ทุกหน้าเป็นของจริง refresh แล้วอยู่ที่เดิม ปุ่ม back ของ browser ใช้ได้ทุกหน้า

```
/                       defect list (หน้าหลัก ไม่มี breadcrumb)
/session/:id            Defect / <branch>
/session/:id/summary    Defect / <branch> / สรุป
/sessions               Session ที่เปิดอยู่
/settings               ตั้งค่า
/setup                  เพิ่ม repo
```

- ทุกหน้าย่อยมีปุ่มย้อนกลับมุมซ้ายบนที่บอกปลายทางจริง เช่น "← กลับไป session"
- **Esc** = กลับหน้าก่อนหน้า ยกเว้นหน้า session ที่ไม่ bind ไว้เลยเพราะ terminal ต้องใช้
- หน้า session ใช้คำว่า **"ย่อเก็บ"** ไม่ใช่ "ปิด" — กดแล้ว pty ยังรันอยู่เบื้องหลัง
  ปุ่มปิด session จริงอยู่ในเมนู `⋯` มุมขวาและมี confirm
- URL ที่ไม่มีอยู่จริง (session ถูกลบ / path มั่ว) เด้งกลับหน้าหลักพร้อมข้อความ ไม่มีจอขาว

### ที่ต่างจากที่สั่งไว้

**pill ใน header นับ session ที่ยังไม่ปิดทั้งหมด ไม่ใช่แค่ `working`/`waiting`**

โจทย์ระบุให้โชว์เฉพาะสองสถานะนั้น แต่ session ที่เงียบเกิน 2 วินาทีจะกลายเป็น `idle`
ทั้งที่ pty ยังรันอยู่และพิมพ์ต่อได้ ถ้ายึดตามตัวอักษร pill จะหายไปหลังกด "ย่อเก็บ"
ไม่กี่วินาที ซึ่งพาไปสู่ปัญหาเดิมคือลืมว่ามี session ค้างอยู่ จึงยึดเป้าหมายที่เขียนไว้ว่า
"บอกได้ตลอดว่ามี session อะไรรันอยู่บ้าง" แทน — `waiting` ยังเป็นสีเตือนและกระพริบตามเดิม

**หน้า session ไม่ bind Esc เลย รวมถึง dialog ยืนยันปิด session** — ปิด dialog ด้วยปุ่มยกเลิก
หรือคลิกนอกกรอบ ทำตามข้อห้ามแบบตรงตัว ถ้าอยากให้ Esc ปิดเฉพาะตอน dialog เปิดอยู่ แก้ได้

**หน้า Summary มีทางกลับ session สองที่** — ปุ่มมุมซ้ายบนตามที่สั่งเพิ่ม และปุ่ม
"กลับเข้า session" ที่ footer ซึ่งมาจาก design doc เดิม ยังไม่ได้ตัดอันไหนออก

**หน้า Setup ตอนยังไม่มี repo เลยจะไม่มีปุ่มย้อนกลับและไม่ผูก Esc** เพราะไม่มีหน้าให้กลับไป

**เพิ่ม ErrorBoundary ครอบ route ทั้งหมด** — กันจอขาวจาก render error เช่นกรณี
`mock/defects.json` ใส่ `severity` ผิดค่า ซึ่งเดิมทำให้ทั้งหน้าหายไปเงียบๆ

## ยังไม่ได้ทำ (ตาม §13)

ต่อ API tracker จริง · เดา repo จาก keyword · commit/push/เปิด PR จากในเว็บ ·
comment กลับ ticket · multi-user · auth

## ความปลอดภัย

bind `127.0.0.1` เท่านั้น · ทุกคำสั่ง git ผ่าน `execFile` แบบ array ไม่มี shell string ·
ชื่อ branch ตรวจด้วย `^[a-zA-Z0-9._/-]+$` ก่อนส่งเข้า git ·
git wrapper ไม่มี `push` / `commit` / `merge` / `rebase` / `reset --hard` ให้เรียก
