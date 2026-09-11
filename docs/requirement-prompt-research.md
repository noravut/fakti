# ที่มาของ prompt เริ่มงาน feature — big tech เขียน requirement กันยังไง

สรุปจากการค้นคว้าแหล่งต้นทาง (2026-09-08) แล้วกลั่นเป็น process ที่ agent ทำเองได้
โดยผู้สั่งงานยังพิมพ์แค่ "สิ่งที่ต้องเป็น" บรรทัดละข้อเหมือนเดิม — งานเพิ่มไปอยู่ที่ agent ไม่ใช่คน

## 1. กรอบที่ดู และหัวข้อบังคับของแต่ละที่

| กรอบ | หัวข้อบังคับ |
|---|---|
| Amazon Working Backwards PR/FAQ | คำถาม 5 ข้อ: ใครคือลูกค้าและรู้อะไรเกี่ยวกับเขา · ปัญหา/โอกาสคืออะไร · solution กับ benefit หลัก · จะอธิบายให้ลูกค้าฟังยังไง · จะทดสอบและวัดผลยังไง · FAQ ภายในต้องมี "3 เหตุผลที่จะล้มเหลว" |
| Google design doc | Context & scope · **Goals และ non-goals** · Design ระดับ trade-off · **Alternatives considered** · Cross-cutting (security, privacy, observability) · เปลี่ยนเล็กใช้ mini design doc 1-3 หน้า |
| Microsoft one-pager / Spolsky spec | Elevator pitch · ผลวิจัยลูกค้า · ทางเลือกอื่น · goals/non-goals · success metrics · dependencies · **Open issues** |
| Basecamp Shape Up pitch | Problem · **Appetite** (งบเวลา) · Solution · **Rabbit holes** (จุดที่จะจม) · **No-gos** |
| Intercom / Square / Atlassian / Figma / Lenny PRD | Problem → Job story → Success metrics → Scope in/out → Open questions · Square รีวิวเป็นด่าน: Problem → Solution → Launch · บังคับยาวไม่เกิน 1 หน้า A4 |
| ISO/IEC/IEEE 29148 | requirement ที่ดี: necessary · unambiguous · **singular** · feasible · **verifiable** · correct · คำต้องห้าม: superlative, คำวัดไม่ได้, สรรพนามกำกวม, ประโยคปฏิเสธ |
| EARS syntax | `While <สภาพ>, when <เหตุการณ์>, the system shall <ผล>` · `If <ไม่พึงประสงค์>, then the system shall <ผล>` |
| BDD / Gherkin (North, Cucumber) | Given-When-Then · 1 scenario = 1 พฤติกรรม · Then ต้องเป็นผลที่สังเกตได้ ไม่ใช่สภาพภายใน · เขียนแบบ declarative ไม่ผูก UI |
| Example Mapping (Wynne) | Story → Rules (เกณฑ์) → Examples (ตัวอย่างจริง) → **Questions** (สิ่งที่ไม่มีใครตอบได้) · การ์ดคำถามเยอะ = ยังไม่พร้อมทำ |
| INVEST / 3 Cs / Definition of Done | Independent · Small · **Testable** · Confirmation = acceptance test · DoD เริ่มด้วย "acceptance criteria are met" |
| Test heuristics (Hendrickson, Kaner) | 0/1/many · ค่าขอบ · ว่าง/null · เวลา · สิทธิ์ · dependency ล่ม · concurrency · ข้อมูลเก่า · เลือกเคสที่ "powerful, credible, representative" ไม่จมใน corner case |
| Google code review / SRE launch | คำถามหลัก "CL นี้ทำสิ่งที่ตั้งใจไหม และสิ่งที่ตั้งใจดีต่อผู้ใช้ไหม" · test มากับ change เดียวกัน · traceability requirement → test |

แหล่งอ้างอิงหลัก: workingbackwards.com, industrialempathy.com/posts/design-docs-at-google,
basecamp.com/shapeup/1.5-chapter-06, cucumber.io/docs/bdd/better-gherkin, dannorth.net/blog/whats-in-a-story,
cucumber.io/blog/bdd/example-mapping-introduction, alistairmavin.com/ears, reqview.com/doc/iso-iec-ieee-29148-templates,
google.github.io/eng-practices/review/reviewer/looking-for.html, ministryoftesting.com/articles/test-heuristics-cheat-sheet

## 2. จุดร่วมที่โผล่แทบทุกที่

1. ปัญหาและผู้ใช้มาก่อน solution
2. Goals แยกจาก **non-goals** อย่างชัด — ตัวกันทำเกินที่ทุกกรอบมี
3. requirement ต้อง **ตรวจได้** และ **1 ข้อ = 1 พฤติกรรม**
4. เกณฑ์รับงานเป็น **ตัวอย่างจริง** ที่สังเกตผลได้ (Given-When-Then) ไม่ใช่คำว่า "ทำงานถูกต้อง"
5. ต้องมีทาง **ไม่พึงประสงค์** (If-then / ทางผิด) ไม่ใช่แค่ทางปกติ
6. **ขอบเคส** ไล่จาก checklist แล้วตัดที่ไม่เกี่ยวพร้อมเหตุผล
7. **จุดเสี่ยง / rabbit holes / ทางเลือกที่ไม่เอา** เขียนไว้ก่อนลงมือ
8. **คำถามที่ติด** แยกออกมา ถ้ามีถือว่ายังไม่พร้อม ต้องตอบก่อน
9. **ข้อสมมติ** ที่ตอบเองได้ให้เขียนเปิดเผย แล้วไปต่อ
10. **traceability**: requirement → เกณฑ์ → test/หลักฐาน → สถานะ ตอนส่งงาน
11. จำกัดความยาว (1 หน้า) เป็นตัวบังคับความชัด
12. รีวิวเป็นด่าน: เข้าใจปัญหาก่อน → solution → ส่งมอบ

## 3. Process ที่กลั่นออกมา (เหมาะกับ agent ใน terminal)

```
ผู้สั่งงานพิมพ์:  ชื่อ + REQ บรรทัดละข้อ + ข้อมูลประกอบ (เท่าเดิม)
                         │
ขั้น 1  agent เขียน spec 1 หน้าจอ ก่อนแตะโค้ด
        ปัญหา/ผู้ใช้ → non-goals → REQ เขียนใหม่ให้ตรวจได้ (EARS, 1 พฤติกรรม/ข้อ)
        → เกณฑ์รับงาน (Given-When-Then + ทางผิด) → ขอบเคส → จุดเสี่ยง
        → ช่องโหว่ของ REQ ทั้งชุด (ขัดกันเอง / ขาดคู่ / ขาดกฎ / ชนของเดิม)
        → คำถามที่ติด | ข้อสมมติ
        ด่าน: คำถามที่ติด หรือช่องโหว่ "ขัดกันเอง"/"ขาดกฎ" = หยุดรอ
              ที่เหลือ = เสนอไว้แล้วไปต่อทันที ไม่ต้องขออนุมัติ (ไม่เพิ่มงานให้คน)
                         │
ขั้น 2  ลงมือทีละ REQ · test ตรงกับเกณฑ์ข้อต่อข้อ · commit ใส่ REQ-n · ไม่แตะ non-goals
        spec ผิดระหว่างทาง → แก้ spec แล้วบอก ไม่ใช่ทำต่างเงียบ ๆ
                         │
ขั้น 3  ตารางตรวจเอง REQ | เกณฑ์ | หลักฐาน | ไฟล์ | สถานะ + ข้อสมมติ + ยืนยัน non-goals
                         │
ปุ่ม "ทวน requirement" → QA อิสระ ใช้ spec ขั้น 1 เป็นฐาน แต่ทวนกับคำเดิมของ REQ ด้วย
                         จบด้วยหัวข้อ "ยังขาดอะไร" — ครบทุก REQ แล้วยังใช้จริงไม่ได้เพราะอะไร
```

## 4. สิ่งที่ตั้งใจ *ไม่* เอามาใส่

- Success metrics เชิงธุรกิจ / TAM / ราคา — เป็นเรื่องระดับ product ไม่ใช่ระดับงานที่ dev สั่งใน 5 นาที
- Press release / leader quote — ใช้กับของใหญ่ระดับ launch
- บังคับให้คนอนุมัติ spec ทุกครั้ง — ขัดกับเป้า "ไวขึ้น" จึงเปิดด่านเฉพาะเมื่อมีคำถามที่ติด
