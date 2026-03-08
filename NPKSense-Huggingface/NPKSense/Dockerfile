# ใช้ Python เวอร์ชัน 3.9
FROM python:3.9

# ตั้งโฟลเดอร์ทำงาน
WORKDIR /code

# 👇 [แก้ตรงนี้] เปลี่ยนชื่อแพ็กเกจให้รองรับ Debian เวอร์ชันใหม่
RUN apt-get update && apt-get install -y libgl1 libglib2.0-0

# ก๊อปปี้ไฟล์ requirements.txt ไปลง Library
COPY ./requirements.txt /code/requirements.txt
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# สร้างโฟลเดอร์สำหรับ matplotlib
RUN mkdir -p /code/.config/matplotlib && chmod -R 777 /code/.config

# ก๊อปปี้ไฟล์ทั้งหมด
COPY . /code

# เปิด Port 7860
EXPOSE 7860

# รัน Server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]