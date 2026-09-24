# AEGIS AUTO — AI เทรดทอง MT5 อัตโนมัติ 24 ชม.

เว็บ + สมอง AI + EA ตัวเชื่อม แยกเป็นอิสระจาก Aegis Orbit โดยสมบูรณ์ (ใช้แค่ตาราง `cache`
ใน Supabase เดิม ด้วยคีย์นำหน้า `at2:` — ไม่แตะข้อมูลระบบเก่า)

## โฟลว์ลูกค้า
1. หน้าแรก: เครื่องคิดแผนทบต้นสด (ทุน → เป้า → กี่วัน) เห็นตารางก่อนซื้อ
2. โอน 15,900 ฿ เข้ากสิกร 083-3-21158-7 → แนบสลิป + เบอร์โทร → AI ตรวจสลิปอัตโนมัติ → ออกโทเคน
3. ตั้งทุน/เป้าหมาย/จำนวนวัน → เห็นตารางแผนเต็ม
4. ดาวน์โหลด EA ตัวเชื่อม ใส่โทเคน แปะกราฟ XAUUSD M15 → AI เทรดตามแผน 24 ชม.
5. แดชบอร์ดโชว์สถานะสด: ออนไลน์/ยอดเงิน/กำไรวันนี้/ไม้ที่เปิด/ข้อความจาก AI

## สถาปัตยกรรม
- `src/App.jsx` — เว็บทั้งหมด (React หน้าเดียว)
- `api/index.js` — Vercel serverless: ตรวจสลิป (Claude vision), แผนทบต้น,
  สมอง AI (`/api/ea/brain` = แนวโน้ม + หน้าต่างข่าวแรง, แคช 30 นาที/12 ชม.),
  รับรายงานจาก EA (`/api/ea/report`), ออกแผนให้ EA (`/api/ea/hello`)
- `ea/AegisAI_Connector.mq5` — EA เต็มระบบ (สายซิ่ง: squeeze-breakout + ADX + เทรนด์,
  SL สวิง, TP ตามเป้าเงินรายวัน, trailing, ลิมิตขาดทุนรายวัน 25/15/10%) + WebRequest
  คุยเซิร์ฟเวอร์: ดึงแผน, ถามสมองทุก 5 นาที, รายงานสถานะทุก 5 นาที
- `public/ea/` — ไฟล์ .ex5 คอมไพล์แล้ว + คู่มือ ให้ลูกค้าดาวน์โหลดจากเว็บตรงๆ

## Deploy (ครั้งแรกครั้งเดียว)
1. push ขึ้น GitHub แล้วเข้า vercel.com → **Add New… → Project** → เลือก repo `aegis-autotrade`
2. ตั้ง Environment Variables (คัดลอกค่าจากโปรเจกต์ aegis-orbit ได้เลย):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ANTHROPIC_API_KEY`
   - `ADMIN_KEY` — ตั้งรหัสลับใหม่อะไรก็ได้ (ไว้อนุมัติสลิปแบบแมนนวล)
3. Deploy — เสร็จแล้วได้โดเมน `https://aegis-autotrade.vercel.app`
   (ถ้าโดเมนต่างจากนี้ ให้แก้ค่า default `Inp_ServerURL` ใน EA แล้วคอมไพล์ใหม่ หรือให้ลูกค้ากรอกเอง)

## อนุมัติแมนนวล (สลิปจริงแต่ AI อ่านไม่ผ่าน)
```bash
curl -X POST https://aegis-autotrade.vercel.app/api/admin/approve -H "content-type: application/json" -d "{\"key\":\"ADMIN_KEY ของคุณ\",\"phone\":\"08xxxxxxxx\"}"
```
ได้โทเคนกลับมา ส่งให้ลูกค้าได้เลย

## Dev ในเครื่อง
`vite` รันหน้าเว็บพร้อม API จำลองเต็มโฟลว์ (ไม่แตะของจริง) — ดู `vite.config.js`
