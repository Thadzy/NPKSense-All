# NPKSense Master README & GitHub Handover

โฟลเดอร์รวบยอดนี้ควรมีคำอธิบายโครงสร้างทั้งหมดแบบคร่าวๆ เพื่อให้คนที่มารับช่วงต่อเห็นภาพรวมว่าโปรเจกต์นี้ทำงานอย่างไร และประกอบด้วยอะไรบ้าง

## โครงสร้างโปรเจกต์ (Project Structure)

โปรเจกต์ **NPKSense** แบ่งออกเป็น 3 โฟลเดอร์หลักตามหน้าที่:

1. **`NPKSense-Dataset/`** 🗂️ 
   ระบบสำหรับรวบรวมรูปภาพ (Dataset v1-v4) และสคริปต์ทำ Preprocessing เพื่อเพิ่มความสดของสีก่อนนำไป Train AI 
2. **`NPKSense-Huggingface/`** ☁️
   ตัว Backend API ที่ถูกนำไป Deploy บน Cloud (Hugging Face Spaces) หน้าที่คือนำภาพจาก Web มาดัดมุมมอง (Perspective Warp) และรันโมเดล YOLO เพื่อคำนวณ Mass แล้วคืนค่า 
3. **`NPKSense-Production/`** 🚀
   โปรเจกต์หลักที่รวม Frontend (Next.js + Tailwind) และ Local Backend (FastAPI). ทำหน้าที่เป็นแอปคำนวณเป้าหมายธาตุอาหารแบบ Full-Stack

*ปล. รายละเอียดวิธีรัน หรือการ Config ของแต่ละส่วน สามารถเข้าไปอ่านได้ใน `README.md` ของแต่ละโฟลเดอร์ย่อย*

---

## วิธีกด Push โค้ดทั้งหมดขึ้น GitHub (Handover)

เพื่อให้ผู้มารับช่วงต่อสามารถโหลดโค้ด (Clone) ไปพัฒนาต่อได้ คุณต้อง Push โฟลเดอร์ `NPKSense` ตัวบนสุดนี้ ขึ้นสู่ Git Repository:

### ขั้นตอนที่ 1: สร้าง Repository บน GitHub
1. ล็อคอินเข้า GitHub.com
2. กดปุ่ม `+ New repository` (หรือคลิกที่เครื่องหมายบวกมุมขวาบน > New repository)
3. ตั้งชื่อ Repository (เช่น `NPKSense-Core`)
4. ปรับเป็น **Private** หรือ **Public** ตามต้องการ
5. **ไม่ต้องติ๊ก** เลือก `Add a README file` หรือ `Add .gitignore` (เดี๋ยวเราสร้างเอง)
6. กด `Create repository`

### ขั้นตอนที่ 2: ตั้งค่า .gitignore ส่วนกลาง 
*เพื่อป้องกันไม่ให้นำ Dataset ภาพจำนวนมหาศาลหนักหลาย GB, โมเดล `.pt`, และ `.venv` ขึ้นไปบน Git จนระบบแครช*
ไฟล์ `.gitignore` ด้านล่างนี้ ได้ถูกผมสร้างรวมไว้ให้ที่ `NPKSense/.gitignore` แล้ว (สามารถลงไปดูได้เลย)

### ขั้นตอนที่ 3: รันคำสั่ง Git ใน Terminal (อัปโหลดโค้ด)
เปิด Terminal หรือ Command Prompt นำ path เข้าไปที่โฟลเดอร์รวมนี้:
```bash
cd /Users/thadzy/Documents/Thadzy/NPKSense
```

รันคำสั่งเรียงตามนี้:
```bash
# เริ่มต้นการสร้างระบบ Git ในโฟลเดอร์นี้
git init

# เพิ่มไฟล์ทั้งหมดในโปรเจกต์นี้เข้าสู่ State เตรียมอัพ (ยกเว้นตัวที่อยู่ใน .gitignore)
git add .

# ห่อรวมแพ็คเกจพร้อมแนบข้อความเตรียมส่งมอบ
git commit -m "Initialize NPKSense project: Handover version with full Thai docs"

# กำหนดปลายทางไปยัง Repository ที่เพิ่งสร้างใหม่
# (เปลี่ยน LINK_GITHUB_ของ_คุณ เป็นลิงก์ที่ได้จากข้อ 1 เช่น https://github.com/thadzy/NPKSense.git)
git branch -M main
git remote add origin <LINK_GITHUB_ของ_คุณ>

# ดันข้อมูลทั้งหมดขึ้นไปบน Server GitHub
git push -u origin main
```

🎉 เมื่อรันคำสั่ง `git push` เสร็จ โค้ดทั้งหมด (ยกเว้นพวก Dataset, ไฟล์หนัก, และโฟลเดอร์รัน) จะไปโผล่ในหน้าเว็บ GitHub ถือเป็นการ **Handover อย่างสมบูรณ์!**
