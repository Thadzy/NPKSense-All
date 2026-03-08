# NPKSense-Web (Production Setup)

ยินดีต้อนรับสู่ตัวเต็มของโปรเจกต์ NPKSense ระบบแบ่งเป็น 2 ส่วนหลักที่ต้องรันควบคู่กัน:
1. **Frontend**: หน้าเว็บแอปพลิเคชัน พัฒนาด้วย Next.js (React) + Tailwind CSS
2. **Backend**: ระบบประมวลผลโมเดล AI พัฒนาด้วย FastAPI (Python) + YOLO

## 🚀 1. การติดตั้งและรัน Backend (FastAPI + YOLO)

เซิร์ฟเวอร์ Backend ทำหน้าที่ประมวลผลไฟล์ภาพด้วยโมเดล `npksense.pt` และส่งผลลัพธ์การคำนวณ Mass ของเม็ดปุ๋ยกลับไปให้ Frontend

**ขั้นตอน:**
1. เปิด Terminal และเข้าไปที่โฟลเดอร์ Backend:
   ```bash
   cd backend
   ```
2. สร้างและเปิดใช้งาน Virtual Environment (เพื่อไม่ให้ไลบรารีตีกับงานอื่น)
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # ใน Mac/Linux
   # หรือ .venv\Scripts\activate ใน Windows
   ```
3. ติดตั้งไลบรารีทั้งหมด
   ```bash
   pip install -r requirements.txt
   ```
   *(หมายเหตุ: หากไม่มีไฟล์ requirements.txt สามารถใช้คำสั่ง: `pip install fastapi uvicorn opencv-python ultralytics numpy python-multipart`)*
4. เริ่มรันเซิร์ฟเวอร์
   ```bash
   uvicorn main:app --reload
   ```
   > เซิร์ฟเวอร์จะเปิดรับ API ที่ `http://localhost:8000`

---

## 🎨 2. การติดตั้งและรัน Frontend (Next.js)

ส่วนหน้าเว็บนี้จะยิง API ไปหา Backend อัตโนมัติ (ผ่าน URL `http://localhost:8000/analyze_interactive`)

**ขั้นตอน:**
1. เปิด Terminal แถบใหม่ (อย่าปิดของ Backend) และกลับมาที่ระดับโฟลเดอร์ `npksense-web`
2. ติดตั้ง Dependencies ฝั่ง Node.js:
   ```bash
   npm install
   ```
3. รัน Development Server:
   ```bash
   npm run dev
   ```
4. เปิดเบราว์เซอร์แล้วเข้าไปที่ `http://localhost:3000` เพื่อใช้งานระบบ

## 📂 โครงสร้างไฟล์ที่สำคัญสำหรับนักพัฒนาคนต่อไป
- `backend/main.py`: โค้ดหลักในการคิดเป้าหมายน้ำหนักของปุ๋ยและประมวลผล Computer Vision (มีคอมเมนต์ในแต่ละบรรทัดอธิบาย Logic วัสดุและธาตุอาหารหมดแล้ว)
- `src/app/page.tsx`: หน้าแรกของแอปพลิเคชัน
- `src/app/calculator/page.tsx`: หน้าสำหรับการคำนวณและปรับสูตรตามเป้าหมาย (รับข้อมูลจากหน้าแรกมาประมวลต่อ)
