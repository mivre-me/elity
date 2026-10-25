# Elity

เพื่อนและผู้ช่วยส่วนตัว + เก็บประกาศจาก LINE + อ่านออกเสียง + โน้ตเข้ารหัส  ทำงานบน GitHub Pages ล้วน ไม่ต้องมีเซิร์ฟเวอร์

## ขึ้นเว็บ (ทำครั้งเดียว ผ่านหน้าเว็บ GitHub)
1. สร้าง repo ใหม่ชื่อ `elity` ตั้งเป็น Public (หน้าเว็บต้อง Public ถึงจะใช้ Pages ฟรีได้ โค้ดไม่มีความลับอะไร)
2. Add file → Upload files → ลากไฟล์ทั้งหมดในโฟลเดอร์นี้ (รวมโฟลเดอร์ fonts) → Commit
3. Settings → Pages → Source: Deploy from a branch → main / (root) → Save
4. รอ 1-2 นาที เปิด https://<ชื่อ GitHub>.github.io/elity/

## ที่เก็บข้อมูล (แยกจากหน้าเว็บ)
- สร้าง repo อีกอันชื่อ `elity-data` ตั้งเป็น **Private**
- สร้าง Fine-grained token เฉพาะ repo นี้ สิทธิ์ Contents: Read and write
- ใส่ในแอพตอนสร้างบัญชี หรือในหน้าตั้งค่า → ซิงก์ผ่าน GitHub

ข้อมูลทุกอย่างเข้ารหัสบนเครื่องก่อนส่งขึ้น GitHub (AES-256-GCM, PBKDF2 600,000 รอบ)

## เก็บประกาศจาก LINE
ติดตั้งแอพลงมือถือ Android ก่อน แล้วกดค้างที่ข้อความใน LINE → แชร์ → เลือก Elity
