# Dashboard โครงสร้างกำลังคน · กลุ่มการพยาบาล รพร.สว่างแดนดิน

หน้า `index.html` (GitHub Pages) อ่าน `data.json` ซึ่ง Apps Script ในชีต "Export HR" ส่งขึ้นมาให้อัตโนมัติ

```
Supabase (HR nurse SWD) ──exportAll ทุก 1 ชม.──▶ Google Sheet "Export HR"
                                                 └─pushToGitHub (ต่อท้าย exportAll)──▶ data.json บน branch main ──▶ index.html
```

## ไฟล์

| ไฟล์ | ที่อยู่จริง |
|---|---|
| `index.html` | หน้า dashboard บน GitHub Pages (อ่าน `data.json`) |
| `apps-script/Code.gs` | Apps Script: ดึง Supabase → ชีต, snapshot รายวัน, แล้วเรียก `pushToGitHub` |
| `apps-script/GitHub.gs` | Apps Script: ตัดข้อมูลระบุตัวบุคคล → commit `data.json` |
| `apps-script/WebApp.gs`, `apps-script/Dashboard.html` | Web app ของ Apps Script (ใช้ภายใน ไม่ผ่าน GitHub) |

โฟลเดอร์ `apps-script/` เป็นสำเนาเก็บไว้เท่านั้น ต้องคัดลอกไปวางในโปรเจกต์ Apps Script เอง

## ติดตั้ง

1. รวม branch นี้เข้า `main` แล้วเปิด **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**
2. สร้าง fine-grained token: **Only select repositories → HRnurse**, Permissions → **Contents: Read and write** (ตั้งวันหมดอายุ และจดวันต่ออายุไว้)
3. Apps Script → Script Properties เพิ่ม `GH_TOKEN` และ `GH_REPO = device-swdcph/HRnurse`
4. วาง `Code.gs` / `GitHub.gs` ฉบับนี้ทับของเดิม → รัน `pushToGitHub` หนึ่งครั้งเพื่ออนุญาตสิทธิ์
   - ไม่ต้องรัน `setupGitHubTrigger` เพราะ `exportAll` ส่งต่อให้เองทุกรอบ (ถ้าเคยรันไปแล้ว ลบ trigger `pushToGitHub` ออก)
5. เปิด `https://device-swdcph.github.io/HRnurse/`

ฝังในเว็บ (หลังได้รับอนุมัติการเผยแพร่):

```html
<iframe src="https://device-swdcph.github.io/HRnurse/" style="width:100%;height:1400px;border:0" loading="lazy" title="โครงสร้างกำลังคน กลุ่มการพยาบาล"></iframe>
```

## ข้อมูลที่เผยแพร่

repo นี้เป็น public — `data.json` และ**ทุกเวอร์ชันในประวัติ commit** เปิดให้ทุกคนดูได้ แม้ภายหลังจะลบไฟล์

ส่งเฉพาะ: หน่วยงาน, ตำแหน่ง, ประเภท, ระดับ, บทบาท, สมรรถนะ, ช่วงอายุ, ปีงบเกษียณ (เฉพาะ 10 ปีงบข้างหน้า), สถานะ
ไม่ส่ง: id, ชื่อ, วันเกิด, อายุจริง, วันเริ่มงาน, เหตุผลการออก

ข้อควรระวัง: หน่วยงานที่มีคนน้อย การรวม หน่วยงาน + ตำแหน่ง + ระดับ + ช่วงอายุ + ปีเกษียณ อาจชี้ตัวบุคคลได้ ควรแนบประเด็นนี้ตอนขออนุมัติเผยแพร่

## งานค้าง

- [ ] เปลี่ยนบัญชีดึงข้อมูลจาก admin เป็นบัญชี viewer (role ≠ 'none', unit = '*') แล้วแก้ `SB_EMAIL`/`SB_PASSWORD`
- [ ] ให้เจ้าของระบบแก้ชื่อหน่วยงานที่สะกดไม่ตรงกัน เช่น "งานการพยาบาลผู้ป่วยอุบัติเหตุฉุกเฉิน" / "…อุบัติเหตุและฉุกเฉิน"
- [ ] ตรวจหน่วยในกรอบที่ไม่มีคน: "อายุรกรรม 3", "กลุ่มงานการพยาบาลผู้ป่วย โสต ศอ นาสิก"
- [ ] ขออนุมัติการเผยแพร่ก่อนส่ง iframe ให้ IT
