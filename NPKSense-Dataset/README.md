# NPKSense-Dataset

โฟลเดอร์นี้ใช้สำหรับจัดการชุดข้อมูลภาพ (Dataset) การทำ Preprocessing ก่อนนำไปเทรนโมเดล และทดสอบโมเดล YOLO พื้นฐานบน Local Server

## โครงสร้างโฟลเดอร์

- `v1`, `v2`, `v3`, `v4`: โฟลเดอร์แยกตามเวอร์ชันของการเก็บข้อมูล แนะนำให้เก็บภาพดิบไว้ในนี้
- `preprocess.py`: สคริปต์สำหรับปรับแต่งสีภาพ (เพิ่ม Saturation/Vibrance) เพื่อเตรียมภาพก่อน Annotation และ Training
- `main.py`: Local API Server (FastAPI) สำหรับทดสอบโมเดล `npksense.pt` บนเครื่องนักพัฒนา เอาไว้ยิง API จาก Postman หรือหน้าเว็บเบื้องต้น
- `npksense.pt`: ไฟล์โมเดล Weights (PyTorch) ที่ได้จากการเทรน ควรเป็นเวอร์ชันล่าสุดเสมอ

## 1. การใช้งานสคริปต์ปรับแต่งภาพ (preprocess.py)

ก่อนนำภาพไปตีกรอบ (Annotate) ด้วย Roboflow แนะนำให้รันสคริปต์นี้เพื่อเร่งสีภาพ ทำให้โมเดลแยก N และ Filler ได้ดีขึ้น

1. เปิดไฟล์ `preprocess.py`
2. แก้ไขตัวแปร `source_folder` ให้ชี้ไปยังโฟลเดอร์ภาพดิบที่ต้องการ (เช่น `.../NPKSense/v4`)
3. รันสคริปต์:
   ```bash
   # หากใช้ Mac/Linux ให้รันผ่าน Virtual Env (ถ้ามี)
   source .venv/bin/activate
   
   python preprocess.py
   ```
4. ภาพที่ปรับแต่งเสร็จแล้วจะถูกนำไปวางซ้อนในโฟลเดอร์ `processed` ด้านในโฟลเดอร์ต้นทาง

## 2. การเทส Local Server (main.py)

หากต้องการรันเพื่อทดสอบการตรวจจับเม็ดปุ๋ยด้วยไฟล์ชั่วคราว:

1. ติดตั้งไลบรารีที่จำเป็น (FastAPI, OpenCV, Ultralytics YOLO)
   ```bash
   pip install fastapi uvicorn opencv-python ultralytics numpy python-multipart
   ```
2. รัน Server ด้วย uvicorn
   ```bash
   uvicorn main:app --reload
   ```
3. ระบบจะทำงานอยู่ที่ `http://localhost:8000` โดยมี Endpoint หลักคือ `/analyze_interactive` ที่รับไฟล์รูปภาพแบบ `multipart/form-data` เพื่อคืนค่าพื้นที่ (Area/Volume) และประมวลผลการคำนวณทางฟิสิกส์
