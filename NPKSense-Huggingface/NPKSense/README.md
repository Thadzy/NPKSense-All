---
title: NPKSense Analysis API
emoji: 🔬
colorFrom: gray
colorTo: blue
sdk: docker
pinned: false
---

# NPKSense Hugging Face Deployment

โฟลเดอร์นี้มีโค้ดเฉพาะสำหรับนำไปสร้างเป็น Docker Container แล้ว Deploy ขึ้น **Hugging Face Spaces** ในโปรเจกต์ของทีม
สคริปต์ `main.py` ทำหน้าที่เป็น Backend API สาธารณะสำหรับให้แอปพลิเคชัน NPKSense-Web (หรือแอปตัวอื่นๆ ที่เข้าถึง Public URL) เข้ามาประมวลผล

## จุดเด่นที่ต่างจาก Local Server เบื้องต้น
1. **โค้ดบรรทัด `four_point_transform`**: มีระบบแปลงเปอร์สเปคทีฟ (ดัดภาพมุมมอง) ข้อมูลนี้ถูกส่งมาจาก Next.js (4 จุด Crop Box) เพื่อให้โมเดลประมวลผลจากวงภาพที่แบนราบ ขนานกับพื้นที่สุด ส่งผลให้คำนวณ Mass (Volume) ได้แม่นขึ้น 10-15%
2. **ระบบคิด Chemical Composition (ธาตุอาหาร)**: ฝั่งนี้จะมีการหักกลบน้ำหนักเม็ด (Physical Weight) เป็นน้ำหนักธาตุอาหารเสริม (Nutrient Weight) เช่น ปุ๋ย DAP สูตร 18-46-0 ถ้าน้ำหนัก 1 กิโล จะคำนวณส่งกลับเป็นไนโตรเจน (N) 0.18 กิโล, และ ฟอสฟอรัส (P) 0.46 กิโล ตามลำดับ

## วิธีการอัปเดตโมเดลเข้าสู่ระบบ

เมื่อทีมงานเทรนโมเดล YOLO ไฟล์ใหม่สำเร็จ นามสกุล `.pt` ให้ดำเนินการดังนี้:
1. นำไฟล์ `npksense.pt` มาวางทับไฟล์เดิมในโฟลเดอร์นี้
2. ทำการ Commit & Push ขึ้น Git Repository ของ Hugging Face Space
   ```bash
   git add npksense.pt
   git commit -m "update: new YOLO weights for better N detection"
   git push
   ```
3. รอ Hugging Face Build Docker Image อัตโนมัติ (ใช้เวลาประมาณ 2-3 นาที)

## การตั้งค่าพื้นที่ (Environment)
- ไฟล์ `Dockerfile`: ระบุ Python 3.9 และไลบรารีที่จำเป็น รวมถึง libGL.so.1 สำหรับ OpenCV (ห้ามลบ)
- `requirements.txt`: มีรายการ Library พื้นฐาน เช่น fastapi, opencv-python-headless, ultralytics
- รุ่น Model: `ultralytics YOLO` (ปัจจุบันเทรนบนชุดข้อมูลรวม v4)
