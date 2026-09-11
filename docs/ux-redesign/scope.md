# fakti web — Scope ปรับปรุง UX/UI

สถานะ: ร่างจากการ audit โค้ดและหน้าจอจริง 2026-09-11 (commit `b8fc2d4`)
ขอบเขต: ฝั่ง `web/` เท่านั้น · ไม่แตะ server, API, เนื้อหา prompt
เอกสารนี้เขียนไว้ส่งให้ Claude Design ทำ design ใหม่ · screenshot ปัจจุบันอยู่ใน `screenshots/`

---

## 0. วิธีใช้เอกสารนี้ (brief สำหรับ designer)

1. อ่าน §1 เพื่อรู้ว่า fakti คืออะไร ใครใช้ และ flow หลักคืออะไร
2. อ่าน §3 คือรายการจุดที่ใช้งานยาก จัดตามหน้า พร้อมระดับความสำคัญ — นี่คือ "โจทย์"
3. §4–§6 คือหลักการ, สิ่งที่ต้องทำ/ไม่ทำ, และ requirement รายหน้า — นี่คือ "กรอบ"
4. §7–§8 คือ design system ที่ต้องส่งมอบ และข้อจำกัดทางเทคนิคที่ต้องเคารพ
5. §9 คือเกณฑ์ตรวจรับ — design ที่ส่งมาต้องตอบทุกข้อได้

---

## 1. บริบทผลิตภัณฑ์

**fakti คืออะไร** — dev tool รันในเครื่อง (localhost) ให้ developer หยิบ defect จาก tracker หรือพิมพ์ requirement ของ feature แล้วสั่งให้ coding agent (Claude Code หรือ Codex) ทำงานใน git branch ที่ fakti สร้างให้ โดยแสดง terminal ของ agent จริงในเบราว์เซอร์ ผู้ใช้พิมพ์โต้ตอบกับ agent ได้เหมือน terminal ปกติ

**ผู้ใช้** — developer คนเดียวต่อเครื่อง ใช้ทุกวัน ใช้บนจอ desktop 1280–1920px ไม่มี mobile ภาษาหลักในการใช้งานคือไทย (มีคำอังกฤษเชิงเทคนิคปน)

**Flow หลัก (ต้องเร็วและชัดที่สุด)**

```
Defect list ──เลือก 1–5 รายการ──▶ Confirm dialog ──▶ Session (terminal) ──▶ Summary (diff/commit)
                                  (เลือก agent,          │ ตรวจ QA
Feature form ──พิมพ์ REQ──────▶   branch, ดู prompt)      │ เปิด VSCode
                                                          └ ปิด / ลบ branch
```

**หน้าที่มีอยู่ (7 หน้า + dialog)**

| route | หน้า | ไฟล์ |
|---|---|---|
| `/` | Defect list — หน้าหลัก | `web/src/pages/DefectList.tsx` |
| `/feature/new` | ฟอร์มสร้าง feature | `web/src/pages/FeatureNew.tsx` |
| `/session/:id` | Session — terminal + รายการงาน | `web/src/pages/Session.tsx` |
| `/session/:id/summary` | Summary — commit + ไฟล์ที่เปลี่ยน | `web/src/pages/Summary.tsx` |
| `/sessions` | รายการ session ทั้งหมด | `web/src/pages/Sessions.tsx` |
| `/settings` | ตั้งค่า repo / source / protected branch | `web/src/pages/Settings.tsx` |
| `/setup` | first-run เพิ่ม repo แรก | `web/src/pages/Setup.tsx` |
| (modal) | Confirm dialog เริ่มงาน | `web/src/components/ConfirmDialog.tsx` |

**สถานะที่ UI ต้องสื่อ**

- session: `working` กำลังทำงาน · `waiting` **รอคุณตอบ** (สำคัญที่สุด — agent หยุดรอคน) · `idle` พร้อมรับคำสั่ง · `closed`
- defect severity: `critical / high / medium / low` + คำเดิมของ tracker (เช่น Major)
- ข้อมูล defect: สด / กำลังโหลดใหม่เบื้องหลัง / **stale** (ต่อ tracker ไม่ได้ ใช้ cache) → ปิดปุ่มแก้
- git: working tree สะอาด / มีไฟล์ค้าง N ไฟล์ · อยู่บน protected branch
- ต่อ repo (workspace): สีประจำ repo 1 สี + id

---

## 2. สภาพปัจจุบัน

**Design token ที่ใช้อยู่** (`web/tailwind.config.js`) — ธีมเดียว light โทนเทาอุ่น

| กลุ่ม | ค่า |
|---|---|
| พื้น | canvas `#E9E9E6` · surface `#FAFAF9` · paper `#FFFFFF` |
| เส้น | line `#CBCBC7` · hair `#E5E5E2` · hairline `#F0F0EE` |
| ตัวอักษร | ink `#16171B` · muted `#5C6068` · faint `#8E939C` |
| accent | pine `#1F5F52` / deep `#17493F` (primary) · danger `#A32E2E` · warn `#A66A0F` / deep `#7A4E0B` |
| terminal | bg `#16171B` · dim/norm/ok/ask/user |
| ฟอนต์ | IBM Plex Sans Thai (sans) · JetBrains Mono → fallback Plex Sans Thai (mono) |
| radius | 6px ปกติ · 8px card · 4px chip |
| ความกว้าง | หน้าทั้งหมดถูกจำกัดที่ **1000px** กลางจอ |

**โครงหน้า** — ทุกหน้าเป็น `Card` ใบเดียวกลางจอ ข้างในมี Header 52px (โลโก้ + breadcrumb + repo/git status + pill "N session" + ⚙) แล้วต่อด้วยเนื้อหา ปุ่มย้อนกลับลอยอยู่นอก card มุมซ้ายบน

**สิ่งที่ดีอยู่แล้ว ควรเก็บไว้**
- keyboard: `/` โฟกัสช่องค้นหา · Esc ย้อนกลับ (ยกเว้นหน้า session ที่ terminal ต้องใช้ Esc) · Enter ใน dialog · Tab วนใน dialog
- ข้อความบอกสาเหตุและทางไปต่อทุกครั้งที่ error หรือ block (ไม่ใช่ "เกิดข้อผิดพลาด" ลอยๆ)
- copy ภาษาไทยที่ตรงไปตรงมา ใช้คำเดียวกันตลอด (branch, session, repo, defect)
- virtual list รองรับ defect 1,000+ แถว
- ตัวเลือกใน filter มาจากข้อมูลจริง (facet) ไม่ hardcode

---

## 3. จุดที่ใช้งานยาก (ผลวิเคราะห์)

ระดับ: **P0** ขวางงานหรือทำให้หลงทาง · **P1** ทำให้ช้า/สับสน · **P2** ดูไม่เรียบร้อย

### 3.1 ทั้งแอป

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| G1 | P0 | **ไม่มี navigation หลัก** — หน้า Sessions เข้าได้ทางเดียวคือ pill "N session" ใน header ซึ่ง **หายไปเมื่อไม่มี session รันอยู่** เหลือแค่ลิงก์เล็กท้ายหน้าตั้งค่า | `Header.tsx` `RunningSessions` return null เมื่อ count=0 |
| G2 | P0 | หน้ากว้างสุด 1000px — terminal และ title defect ถูกบีบ บนจอ 1440+ เหลือที่ว่างสองข้างเกือบครึ่งจอ | `maxWidth.page` · screenshot ทุกหน้า |
| G3 | P1 | ไม่มี icon set — ใช้ตัวอักษร unicode (⚙ ⋯ ⟳ ✓ ✕ ↗ ▾ ←) ขนาด/น้ำหนัก/baseline ไม่ตรงกัน | `Header.tsx`, `Session.tsx`, `DefectFilters.tsx` |
| G4 | P1 | hierarchy อ่อน — card ซ้อน card ซ้อนแถว บนพื้นเทา 3 ระดับที่ใกล้กันมาก (E9E9E6 / FAFAF9 / FFF) แถวไม่มี hover state ไม่รู้ว่าอะไรกดได้ | screenshot `defects.png`, `sessions.png` |
| G5 | P1 | สลับฟอนต์ sans ↔ mono ในบรรทัดเดียว 2–3 ครั้ง (repo id, branch, path, key เป็น mono) + ขนาดตัวอักษร 11/13/15 กระจัดกระจาย อ่านกระตุก | header: `netka-entrust feat/questionnaire-… · มีไฟล์ค้าง 12 ไฟล์` |
| G6 | P1 | ไม่มี dark mode ทั้งที่กลางหน้ามีบล็อก terminal ดำ `#16171B` บนพื้นขาว — contrast กระโดด และ dev tool ส่วนใหญ่ผู้ใช้ตั้ง dark | `session.png` |
| G7 | P1 | copy ค้างจากชื่อเก่า "pat" 5 จุด (`Setup`, `Settings`×2, `DefectList`, `SourceForm`) และคำว่า "ผู้ช่วยเขียนโค้ด" มีช่องว่างผิดตำแหน่ง | grep `pat ` ใน `web/src` |
| G8 | P1 | ไม่มี component กลางสำหรับ Modal / Toast — dialog 5 ตัวเขียนซ้ำโครงเดียวกันในไฟล์ต่างๆ; feedback หลังทำ action สำเร็จมีแค่ flash เหลืองบนสุดหรือไม่มีเลย | `Session.tsx` มี 4 modal inline, `Summary.tsx` 1 |
| G9 | P2 | loading state เป็นข้อความ "กำลังโหลด…" ลอยๆ skeleton มีแค่ใน defect list; empty state เป็นกล่องตัวหนังสือ | `App.tsx`, `Session.tsx` |
| G10 | P2 | ปุ่มย้อนกลับลอยนอก card ซ้ำกับ breadcrumb ใน header (บอกทางเดียวกันสองที่) | `BackLink` + `Header crumbs` |

### 3.2 Defect list (`/`)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| D1 | P0 | แถบกรองกิน 4 แถว + 1 บรรทัดนับ (~200px) ก่อนถึงรายการ: ช่องค้นหา / preset chip / native select 3 ตัว / active chip | `defects.png` |
| D2 | P0 | ค่าเริ่มต้นกรอง "ยังไม่ปิด" ทำให้เห็น **3 จาก 1376** โดยไม่บอกว่าซ่อนอะไรไว้ ตัวปิดกรองเป็น chip ✕ ที่หน้าตาเหมือน tag | `defects.png` บรรทัด "แสดง 3 จาก 1376 รายการ" |
| D3 | P0 | ปุ่ม toggle "แก้แล้ว" หน้าตาเหมือน tag และวางปนกับ tag จริง (General · Text Editor) ในบรรทัดเดียว — ความหมายชนกัน | `DefectRow.tsx` บรรทัดล่างของแถว |
| D4 | P1 | กดที่ title เพื่อกางรายละเอียด แต่ไม่มี affordance (ไม่มี chevron ไม่มี hover) · รายละเอียดกางในลิสต์ที่ scroll ซ้อน (`max-h 62vh`) เกิด double scroll | `DefectRow.tsx`, `DefectList.tsx` |
| D5 | P1 | BulkBar (เลือกไว้ N · แก้ที่เลือก) โผล่ท้าย card ไม่ sticky — เลือกแถวลึกๆ แล้วต้อง scroll หาปุ่ม; เพดาน 5 ต่อ session แจ้งเป็นข้อความเล็ก | `BulkBar.tsx` |
| D6 | P1 | "โหลดใหม่" กับ "สร้าง feature" เป็นปุ่มน้ำหนักเท่ากัน — ทางเข้า flow หลักอันหนึ่งดูเป็นปุ่มรอง | `defects.png` มุมขวาบน |
| D7 | P1 | FacetSelect เป็น native `<select>` ที่ value ว่างตลอด เลือกแล้วค่าไป "โผล่" เป็น chip ที่อื่น — pattern ไม่คุ้น | `DefectFilters.tsx` `FacetSelect` |
| D8 | P2 | เมื่อมีหลาย repo ทุกแถวมี dropdown เลือก repo ของตัวเอง → รก; เลือกข้าม repo แล้วถูก block ด้วยข้อความ | `WorkspaceSelect` ในแถว |
| D9 | P2 | severity chip กับ repo chip ชิดขวา ส่วน reporter/เวลา/tag อยู่บรรทัดสอง — ตาต้องกวาดสองบรรทัดเพื่อสแกนหนึ่งรายการ | `defects.png` |

### 3.3 Confirm dialog (เริ่มงาน)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| C1 | P0 | dialog เดียว 560px รวมทุกอย่าง: คำเตือนไฟล์ค้าง + เลือก agent + 4 ตัวเลือก branch (แต่ละอันมีฟอร์มย่อย animate กาง/หุบ) + รายการงาน + prompt editor 240px + error → ยาวเกินจอ ต้อง scroll ใน modal | `ConfirmDialog.tsx` 545 บรรทัด |
| C2 | P0 | กด **Enter ที่ช่อง input ใดก็ได้ = เริ่มงานทันที** (รวมช่องค้นหา branch) — เสี่ยงเริ่มผิด | `onKeyDown` บน dialog: submit เมื่อ tag ≠ SELECT/TEXTAREA |
| C3 | P1 | เลือก agent เป็น native `<select>` 2 ตัวเลือก ไม่มีหัวข้อกลุ่ม อยู่ลอยเหนือส่วน branch | บรรทัด 253–266 |
| C4 | P1 | ไม่บอกว่ากด "เริ่มแก้" แล้วจะเกิดอะไรตามลำดับ (สร้าง branch → เขียน .pat-task.md → เปิด agent) และไม่มี progress ระหว่างรอ (ปุ่มเปลี่ยนเป็น "กำลังเริ่ม…" เท่านั้น) | — |
| C5 | P2 | ตัวเลือก branch ที่ใช้ไม่ได้ถูกซ่อนหายไปเลย (return null) ผู้ใช้ไม่รู้ว่ามีตัวเลือกนั้นอยู่ | `Option` เมื่อ `disabled && !disabledHint` |

### 3.4 Session (`/session/:id`)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| S1 | P0 | **terminal สูงตายตัว 420px** ไม่ resize ไม่ fullscreen ในกรอบกว้าง 1000px — ทั้งที่มันคือหัวใจของหน้า; รายการ defect ด้านบน 5 แถว + bar ล่างกินที่เพิ่ม | `Terminal.tsx` `h-[420px]` · `session.png` |
| S2 | P0 | สถานะ "รอคุณตอบ" — เหตุการณ์ที่ต้องการคนมากที่สุด — เป็นข้อความ 13px มุมขวาบน สีน้ำตาลอ่อน; นอกหน้านี้เห็นได้แค่ pill ใน header และ title tab | `STATE_STYLE` ใน `Session.tsx` |
| S3 | P1 | action bar ล่าง "ตรวจ QA / เปิดใน VSCode / ดูสรุป" น้ำหนักเท่ากันหมด; action สำคัญ (เปลี่ยนชื่อ / ปิด session / ลบ branch) ซ่อนใน ⋯ ไม่มี label | `session.png` |
| S4 | P1 | สถานะรายข้อ "✓ แก้แล้ว" เดาจาก commit subject แต่แสดงเหมือนความจริง 100% ไม่มีคำบอกว่าเป็นการประเมิน | `itemStatus` heuristic |
| S5 | P1 | diff stat "492 ไฟล์เปลี่ยน +207871 −4523" ไม่มีบริบทว่าเทียบกับอะไร ดูน่ากลัวและไม่น่าเชื่อ ไม่ลิงก์ไปดูไฟล์ | `session.png` bar ล่าง |
| S6 | P1 | session ที่ปิดแล้วแสดงกล่องดำใหญ่เท่า terminal มีข้อความหนึ่งบรรทัด + ปุ่มเดียว เสียพื้นที่ | `session.png` |
| S7 | P2 | QA dialog เป็น textarea 50vh ของ prompt ดิบทั้งก้อน ไม่มีสรุปว่าจะส่งอะไร (REQ กี่ข้อ ไฟล์กี่ไฟล์) | `Session.tsx` `qaOpen` |
| S8 | P2 | header ของหน้ามี 2 แถวซ้อน (breadcrumb แถวหนึ่ง / repo·branch·agent·สถานะ อีกแถว) ข้อมูลซ้ำ (branch โผล่ 2 ครั้ง) | `session.png` |

### 3.5 Sessions (`/sessions`)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| L1 | P0 | ไม่จัดกลุ่ม/ไม่กรอง — session ปิดแล้ว 15 อันปนกับที่ "รอคุณตอบ"; branch เดียวกันซ้ำ 6 แถวติดกันแยกไม่ออกว่าอันไหนล่าสุด | `sessions.png` `feat/app-web-questionnaire-recuring` ×6 |
| L2 | P1 | ทุกแถวมี 2 ปุ่ม "เปิด / สรุป" → 16 แถว = 32 ปุ่ม; ไม่มีการลบ/ซ่อน session เก่า | `sessions.png` |
| L3 | P1 | breadcrumb "Session ที่เปิดอยู่" แต่หัวข้อ "Session ย้อนหลัง" — ขัดกัน | `Sessions.tsx` บรรทัด 33 vs 36 |
| L4 | P2 | ไม่แสดงจำนวน defect/REQ, ไฟล์ที่เปลี่ยน, หรือเวลาที่ active ล่าสุด — มีแค่ createdAt | — |

### 3.6 Summary (`/session/:id/summary`)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| M1 | P1 | commit list ยาวไม่จำกัด (194 รายการ) แถวละ 2 บรรทัด merge commit ปน; "ไฟล์ที่เปลี่ยน" อยู่ล่างสุดต้อง scroll ผ่าน commit ทั้งหมด | `summary.png` |
| M2 | P1 | ปุ่มทำลาย "ทิ้ง branch นี้" (danger) วางข้าง "เสร็จ" (primary) ห่างกันแค่ gap เดียว | bar ล่าง `Summary.tsx` |
| M3 | P2 | breadcrumb hardcode "Defect" แม้เป็น feature session | `Summary.tsx` บรรทัด 95 |

### 3.7 Settings (`/settings`) และ Setup

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| T1 | P1 | หน้าเดียวยาว 4 section ต่างเรื่อง (repo / ชื่อใน tracker / protected branch / source) ไม่มี sub-nav | `settings.png` |
| T2 | P1 | section "ชื่อของคุณใน tracker" อธิบายว่าใช้กับตัวกรอง "ของฉัน" — **ตัวกรองนั้นถูกถอดออกแล้ว** (commit `b8fc2d4`) section นี้จึงตาย/คำอธิบายผิด | `Settings.tsx` บรรทัด 120–143 |
| T3 | P1 | ปุ่ม "ใช้อันนี้" ปรากฏ 2 ที่ ความหมายต่างกัน (repo ที่ใช้อยู่ vs source ตั้งต้น) และ badge "ใช้อยู่" / "ตั้งต้น" ใช้สีเดียวกัน | `settings.png` |
| T4 | P1 | แก้ repo = กางฟอร์ม ~10 ช่อง + SourceForm + รายงานทดสอบ inline ในแถว → แถวยืดยาว หน้ากระโดด | `WorkspaceForm.tsx` 210 บรรทัด |
| T5 | P2 | ปุ่ม "ลบ" (danger outline) โชว์ทุกแถวตลอดเวลา | `settings.png` |
| T6 | P2 | Setup (first-run) ใช้ฟอร์มเดียวกับ "แก้ repo" ทั้งก้อน รวมช่อง protected branch และ source ที่คนเพิ่งเริ่มยังไม่เข้าใจ | `Setup.tsx` |

### 3.8 Feature form (`/feature/new`)

| # | ระดับ | ปัญหา | หลักฐาน |
|---|---|---|---|
| F1 | P1 | คำอธิบายช่องยาวเป็นบรรทัดเดียวคั่นด้วย · (4–5 ประโยค) อ่านยาก; ปุ่ม "ถัดไป" ไม่บอกว่าถัดไปคือเลือก branch/agent | `feature.png` |
| F2 | P1 | preview REQ-n โผล่ใต้ textarea เฉพาะเมื่อพิมพ์แล้ว ก่อนหน้านั้นไม่มีอะไรบอกว่าจะได้รหัสอะไร | `FeatureNew.tsx` |
| F3 | P2 | ไม่มีตัวบอก "กำลังเขียนข้อที่ n" หรือคำใบ้ REQ ที่วัดไม่ได้ให้เห็นแบบ inline ในช่อง (อยู่ใต้ช่องแทน) | — |

---

## 4. หลักการออกแบบใหม่

1. **Terminal มาก่อน** — หน้า session ต้องให้พื้นที่ terminal มากที่สุด ทุกอย่างอื่นหุบได้
2. **"รอคุณตอบ" ต้องเห็นจากทุกที่** — เป็น signal ที่ดังที่สุดในแอป ทั้งสี ตำแหน่ง และ tab title
3. **หนึ่งหน้า หนึ่ง action หลัก** — ปุ่ม primary หน้าละอันเดียว action ทำลายแยกออกจาก action ปกติทั้งตำแหน่งและสี
4. **Toggle ไม่ใช่ Tag** — สิ่งที่กดเปลี่ยนสถานะได้ (แก้แล้ว, filter) ต้องหน้าตาต่างจากป้ายที่อ่านอย่างเดียว (severity, tag)
5. **ใช้ความกว้างจอ** — layout ยืดตามจอ (fluid) มี max ที่ 1600px ไม่ใช่ 1000
6. **ลดการสลับฟอนต์** — mono ใช้เฉพาะ branch, hash, path, key ที่ต้องอ่านตัวต่อตัว; id repo และตัวเลขทั่วไปเป็น sans
7. **เก็บของดีเดิม** — keyboard shortcut, copy ไทยที่บอกเหตุและทางไปต่อ, virtual list, facet จากข้อมูลจริง
8. **Dark mode เป็นพลเมืองชั้นหนึ่ง** — ออกแบบ token คู่ light/dark ตั้งแต่แรก ไม่ใช่กลับสีทีหลัง

---

## 5. ขอบเขต

### ทำ
- Design system: token (light + dark), typography scale, spacing, component library (§7)
- Redesign ทั้ง 7 หน้า + Confirm dialog + QA dialog + modal ยืนยันต่างๆ
- Navigation / information architecture ใหม่ (§6.0)
- ทุก state สำคัญ: loading, empty, error, stale data, dirty tree, protected branch, waiting, closed
- แก้ copy ค้าง ("pat", ช่องว่างผิด) และ section ที่ตายแล้ว (T2)
- Responsive ในช่วง 1280–1920px (desktop เท่านั้น)

### ไม่ทำ
- mobile / tablet layout
- เปลี่ยน API, data model, หรือเนื้อหา prompt ที่ส่งให้ agent
- feature ใหม่ที่ต้องแก้ server (เช่น จำร่าง feature ข้าม reload, เขียนสถานะกลับ tracker, ลบ session เก่า) — ถ้าจำเป็นให้ระบุเป็น "ต้องการ API เพิ่ม" แยกไว้ ไม่ block design
- authentication / multi-user
- เปลี่ยนธีมสีของ terminal (xterm) นอกจากปรับให้เข้ากับ dark/light ของหน้า

---

## 6. Requirement รายหน้า

### 6.0 Shell / Navigation (แก้ G1, G2, G3, G10)
- มี nav ถาวรเข้าถึงได้จากทุกหน้า: **Defect · Feature · Sessions · Settings** (sidebar แคบหรือ top nav ก็ได้ แต่ต้องเห็นตลอด)
- ตัวบอกจำนวน session ที่ยังรัน + สถานะ waiting อยู่ใน nav เสมอ แม้ count = 0 ยังเข้าหน้า Sessions ได้
- repo ที่ใช้อยู่ + git status (branch, ไฟล์ค้าง) อยู่ใน shell ครั้งเดียว ไม่ซ้ำในเนื้อหา
- ความกว้างเนื้อหา fluid, max 1600px, gutter ≥ 24px
- icon set เดียว (แนะนำ Lucide) ขนาด 16/20px แทน unicode ทั้งหมด
- breadcrumb หรือ back link เอาอย่างเดียว

### 6.1 Defect list (แก้ D1–D9)
- แถบกรอง **1 แถว** ตอนหุบ: ช่องค้นหา + ปุ่มกรอง (popover/dropdown ที่ติ๊กหลายค่าได้พร้อมจำนวน) + toggle "เฉพาะยังไม่ปิด" ที่เห็นชัดว่าเป็น toggle + ปุ่มล้าง; active filter แสดงเป็น chip ใน popover หรือแถวที่สอง (ไม่เกิน 1 แถวเพิ่ม)
- ข้อความ "แสดง N จาก M" ต้องอยู่ติดกับตัวกรองที่ทำให้ M หด และมีทางกดดูทั้งหมดใน 1 คลิก
- แถว: checkbox · title (เต็มบรรทัด, 1 บรรทัด, hover) · severity badge (อ่านอย่างเดียว) · meta (reporter, เวลา, tag) · **toggle "แก้แล้ว" ที่หน้าตาต่างจาก tag ชัดเจน** (เช่น icon check ในวงกลม) · chevron บอกว่ากางได้
- กางรายละเอียด: ไม่เกิด double scroll (ให้ลิสต์เป็น scroll ของหน้า หรือรายละเอียดเปิดเป็น side panel)
- BulkBar **sticky ล่างจอ** เมื่อเลือก ≥ 1 แสดง N/5 ชัด repo ที่จะใช้ และปุ่ม primary "แก้ที่เลือก"
- ปุ่มหัวหน้า: "โหลดใหม่" เป็น icon button + เวลาอัปเดต · "สร้าง feature" อยู่ใน nav หลัก
- state: skeleton / ว่างเพราะ source ไม่มี / ว่างเพราะกรอง / error / **stale banner** (เตือน + ปิดปุ่มแก้ + บอกทางแก้)
- หลาย repo: เลือก repo ปลายทางครั้งเดียวที่ระดับหน้า (หรือใน BulkBar) ไม่ใช่ทุกแถว

### 6.2 Confirm dialog → เปลี่ยนเป็น 2 ขั้น (แก้ C1–C5)
- **ขั้น 1 — ตั้งค่า**: agent เป็น segmented control (Claude Code | Codex + หมายเหตุต้องติดตั้ง) · เลือก branch เป็น radio card 3–4 ใบเห็นครบ (ใช้ไม่ได้ = disabled พร้อมเหตุผล ไม่ซ่อน) · ไฟล์ค้าง = block บนสุดที่ต้องเลือกก่อน · รายการงานที่รวมอยู่ (หุบได้)
- **ขั้น 2 — ทวน prompt**: แสดงสิ่งที่จะเกิด (สร้าง branch X จาก Y → เขียน .pat-task.md → เปิด agent Z) + prompt แก้ได้ในกล่องใหญ่ · ปุ่ม "เริ่มแก้" อยู่ขั้นนี้เท่านั้น
- Enter submit ได้เฉพาะเมื่อโฟกัสอยู่ที่ปุ่ม primary หรือช่องชื่อ branch ไม่ใช่ทุก input
- ระหว่างเริ่ม: progress ทีละขั้น (branch ✓ → ไฟล์ ✓ → agent …) แทน "กำลังเริ่ม…"
- กว้าง 640–720px ไม่ต้อง scroll ใน state ปกติที่ความสูงจอ 800px

### 6.3 Session (แก้ S1–S8)
- terminal สูงอย่างน้อย **60% ของ viewport** ในสภาพปกติ + ปุ่ม fullscreen/ขยาย + จำขนาดที่ผู้ใช้ปรับ
- header หน้าเดียว 1 แถว: repo · branch · agent · **สถานะเป็น badge ใหญ่** (waiting = สีเตือน + pulse + ข้อความ "agent รอคุณตอบ")
- รายการ defect/REQ หุบเป็นแถบสรุป ("5 รายการ · 3 แก้แล้ว") กางเมื่อต้องการ; สถานะรายข้อมีคำว่า "ประเมินจาก commit" หรือ icon บอกว่าเป็นการเดา
- action bar: primary 1 ปุ่ม ("ตรวจ QA" / "ทวน requirement") · secondary (VSCode, สรุป) · เมนู ⋯ มี label ข้อความและแยกกลุ่ม danger ด้วยเส้น
- diff stat แสดงเป็น "เทียบกับตอนเริ่ม session" + ลิงก์ไปสรุป
- closed session: แทนกล่องดำด้วย panel เล็ก "ปิดแล้ว · เปิดใหม่บน branch เดิม" และเลื่อนสรุปขึ้นมาแทน
- QA dialog: ส่วนสรุปด้านบน (กี่ REQ/defect, กี่ไฟล์, agent ไหน) + prompt ในกล่องหุบได้

### 6.4 Sessions (แก้ L1–L4)
- แบ่งกลุ่ม: **รอคุณตอบ** → กำลังทำงาน/พร้อมรับคำสั่ง → ปิดแล้ว (หุบได้ตั้งต้น)
- กรอง/จัดเรียงตาม repo, agent, สถานะ
- แถว: สถานะ badge · branch · ชื่องาน (feature title หรือ "N defect") · agent · เวลาล่าสุด · action หลักอันเดียวตามสถานะ (เปิด / ดูสรุป) ที่เหลืออยู่ในเมนู
- ชื่อหน้าและ breadcrumb ใช้คำเดียวกัน

### 6.5 Summary (แก้ M1–M3)
- แท็บหรือสองคอลัมน์: **ไฟล์ที่เปลี่ยน** เป็นค่าเริ่มต้น · commit เป็นอีกแท็บ
- commit list แถวเดียวต่อ commit (hash · subject · n ไฟล์) จำกัด 20 แรก + "ดูทั้งหมด"; ซ่อน merge commit ตั้งต้น
- action ทำลาย ("ทิ้ง branch") แยกฝั่งซ้าย/ในเมนู ห่างจาก "เสร็จ"
- breadcrumb ตามชนิด session (Defect / Feature)

### 6.6 Settings + Setup (แก้ T1–T6)
- sub-nav หรือ tab: **Repo · Defect source · Branch policy** (ตัด "ชื่อของคุณใน tracker" ออก — ไม่มีอะไรใช้แล้ว)
- repo แสดงเป็นการ์ด/แถวสรุป แก้ใน drawer หรือหน้าแยก ไม่กางในแถว
- ปุ่ม "ใช้เป็น repo ปัจจุบัน" กับ "ตั้งเป็น source ตั้งต้น" ใช้คำและสีต่างกัน
- ลบ/เอาออก อยู่ในเมนูของแถว ไม่โชว์ตลอด
- Setup: ขั้นเดียวถาม path + ชื่อ + base branch พอ ที่เหลือ (สี, protected, source) ใช้ค่าตั้งต้นและไปแก้ทีหลัง

### 6.7 Feature form (แก้ F1–F3)
- label สั้น + คำอธิบาย 1 บรรทัด + ตัวอย่างเป็น placeholder; รายละเอียดยาวเป็น tooltip/ลิงก์ "ดูตัวอย่าง"
- แสดงเลข REQ-1, REQ-2 … ข้างบรรทัดใน textarea (gutter) หรือ preview ที่มีอยู่ตั้งแต่ยังว่าง
- คำใบ้ "ข้อนี้วัดไม่ได้" แสดง inline ที่ข้อนั้น
- ปุ่มท้ายฟอร์ม "ถัดไป: เลือก branch และ agent"

---

## 7. Design system ที่ต้องส่งมอบ

**Token** — light และ dark ครบคู่: พื้น 3 ระดับ · เส้น 2 ระดับ · ตัวอักษร 3 ระดับ · accent primary/danger/warn/success + พื้นอ่อนของแต่ละสี · terminal palette ที่เข้ากับทั้งสองธีม · focus ring

**Typography** — ใช้ Tailwind scale เท่านั้น (`text-xs/sm/base/lg`) ไม่ใช้ค่า arbitrary เช่น `text-[13px]`; กำหนดว่าที่ไหนใช้ mono

**Component (ต้องมี state: default / hover / focus / disabled / loading ที่เกี่ยว)**

| component | หมายเหตุ |
|---|---|
| Button | primary · secondary · ghost · danger (outline) · danger solid (ยืนยันลบ) · icon button · ขนาด sm/md |
| Input · Textarea · Select · Combobox (ค้นหา branch) | error state, hint ใต้ช่อง |
| Segmented control | เลือก agent |
| Radio card | เลือก branch mode |
| Checkbox | เลือก defect |
| Toggle chip | filter preset, "แก้แล้ว" — ต้องต่างจาก Tag ชัด |
| Tag / Badge | severity (4 ระดับ + คำเดิม tracker), tag จาก tracker, สถานะ session (4), repo color dot |
| Filter popover | multi-select พร้อมจำนวน |
| Table row / List row | hover, selected, expanded, skeleton |
| Sticky action bar | BulkBar |
| Modal (2 ขนาด) + Stepper | confirm 2 ขั้น, ยืนยันลบ |
| Toast | สำเร็จ / error หลัง action |
| Banner | stale data, warning จาก server |
| Empty state · Error state · Skeleton | ทุกหน้า |
| Nav shell | sidebar/top nav + session indicator + repo/git status |
| Terminal frame | header เล็ก + ปุ่มขยาย + ขอบที่กลืนกับธีม |

---

## 8. ข้อจำกัดทางเทคนิค (design ต้องเคารพ)

- Stack: React 18 + Tailwind CSS 3.4 + wouter + zustand — design ควรเขียนออกมาเป็น Tailwind class ได้ตรงๆ, spacing บน grid 4px
- ฟอนต์ไทย: sans ต้องรองรับสระ/วรรณยุกต์ (ปัจจุบัน IBM Plex Sans Thai) และ mono ทุกตำแหน่งต้อง fallback ไปฟอนต์ไทยได้ (JetBrains Mono ไม่มีอักษรไทย) — ถ้าเสนอฟอนต์ใหม่ต้องมาจาก Google Fonts และเช็คภาษาไทย
- Terminal คือ xterm.js — ธีมกำหนดได้แค่ palette 16 สี + bg/fg/cursor; resize ต้องเรียก fit addon; ห้ามผูก Esc/Ctrl ในหน้า session
- Defect list ใช้ virtual scroll (@tanstack/react-virtual) — แถวต้องสูงประมาณคงที่ตอนหุบ และวัดจริงเมื่อกาง
- เพดานเลือกได้ 5 defect ต่อ session (ค่าคงที่ฝั่ง web)
- สถานะ session poll ทุก 5 วินาที — indicator ใน nav อัปเดตช้าสุด 5 วิ
- ไม่มี icon library ในโปรเจกต์ตอนนี้ — เพิ่มได้ 1 ตัว (แนะนำ lucide-react)
- ไม่มี component library (headless UI) — ถ้าเสนอ Radix/Headless UI ให้ระบุ แต่ design ต้องทำได้ด้วย HTML ธรรมดา + Tailwind ได้ด้วย
- keyboard ที่ต้องคงไว้: `/` โฟกัสค้นหา · Esc ย้อนกลับ (ยกเว้นหน้า session) · Tab วนใน modal · Enter ยืนยันใน modal (ตามข้อ 6.2)
- accessibility: focus ring เห็นชัดทุก control, role/aria ที่มีอยู่ (`role="dialog"`, `aria-pressed`, `aria-expanded`) ต้องคงได้, contrast ≥ 4.5:1 สำหรับข้อความปกติทั้งสองธีม

---

## 9. เกณฑ์ตรวจรับ design

- [ ] เข้าหน้า Sessions ได้ใน 1 คลิกจากทุกหน้า แม้ไม่มี session รันอยู่
- [ ] บนจอ 1440×900 หน้า session มี terminal สูง ≥ 540px โดยไม่ต้องกดขยาย และมีปุ่มขยายเต็มจอ
- [ ] สถานะ "รอคุณตอบ" มองเห็นได้ใน ≤ 1 วินาทีทั้งในหน้า session และจาก nav ของหน้าอื่น (ทดสอบด้วยการให้คนดูภาพ 1 วินาทีแล้วถามว่ามีอะไรรอ)
- [ ] Defect list บนจอ 1280×800: แถวแรกของรายการอยู่เหนือครึ่งจอ ตัวกรองหุบเหลือ 1 แถว
- [ ] Confirm dialog ขั้น 1 และขั้น 2 ไม่ต้อง scroll ที่ความสูงจอ 800px ใน state ปกติ (ไม่มีไฟล์ค้าง, ไม่มี error)
- [ ] ไม่มี element ใดที่กดได้แล้วหน้าตาเหมือน element ที่อ่านอย่างเดียว (toggle vs tag) — ตรวจทุก badge/chip
- [ ] action ทำลาย (ลบ branch, ทิ้งการเปลี่ยนแปลง, ปิด session, เอา repo ออก) ไม่อยู่ติดกับปุ่ม primary และต้องยืนยัน 1 ครั้งด้วย modal ที่บอกผลลัพธ์ชัด
- [ ] token ครบทั้ง light/dark และทุกหน้ามี mockup ทั้งสองธีมอย่างน้อยหน้า Defect list กับ Session
- [ ] ไม่มีคำว่า "pat" ใน copy (ยกเว้น path จริง `~/.pat/` และ `.pat-task.md`)
- [ ] ทุกหน้ามี state loading / empty / error ในชุด mockup
- [ ] ใช้ Tailwind scale ล้วน (ไม่มี `text-[13px]`, `h-[420px]`, `w-[92px]`)
- [ ] ข้อความไทยทุกจุด render ถูกในฟอนต์ที่เลือก รวมบรรทัดที่ผสม mono

---

## 10. ลำดับการทำ (เสนอ)

| เฟส | เนื้อหา | ปิดปัญหา |
|---|---|---|
| 1 | Design token + typography + icon + Button/Input/Badge/Chip/Modal/Toast · Nav shell | G1–G8 |
| 2 | Defect list + Confirm dialog 2 ขั้น + BulkBar | D1–D9, C1–C5 |
| 3 | Session (terminal-first) + Sessions (จัดกลุ่ม) | S1–S8, L1–L4 |
| 4 | Summary + Settings/Setup + Feature form | M1–M3, T1–T6, F1–F3 |

เฟส 1–3 คือส่วนที่ผู้ใช้เจอทุกวัน ควรส่ง design ก่อน เฟส 4 ตามหลังได้

---

## ภาคผนวก — screenshot สภาพปัจจุบัน (1280px, light)

| หน้า | ไฟล์ |
|---|---|
| Defect list | `screenshots/defects.png` |
| Session (ปิดแล้ว) | `screenshots/session.png` |
| Sessions | `screenshots/sessions.png` |
| Summary | `screenshots/summary.png` |
| Settings | `screenshots/settings.png` |
| Feature form | `screenshots/feature.png` |

หมายเหตุ: ยังไม่มีภาพ Confirm dialog, QA dialog, และ session ที่กำลังรัน (state `working` / `waiting`) — ต้องเปิดจากแอปจริงเพื่อดู หรืออ่านโครงจาก `ConfirmDialog.tsx` และ `Session.tsx`
