from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
import cv2
import numpy as np
import base64

# ==============================================================================
# เซิร์ฟเวอร์ API สำรองสำหรับโฟลเดอร์ Dataset (Local Testing)
# ใช้สำหรับเทสโมเดล npksense.pt ระหว่างการพัฒนา ไม่ใช่ตัว Production หลัก
# ==============================================================================

app = FastAPI()

# เปิด CORS เพื่อให้ Frontend ภายนอกสามารถยิง API เข้ามาทดสอบได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG ---
MODEL_PATH = "npksense.pt" 

# โหลดโมเดล YOLO (ใช้ try-except ป้องกันสคริปต์พังกรณีไฟล์ .pt หาย)
try:
    model = YOLO(MODEL_PATH)
except:
    pass

# แมป Class ID ของ YOLO ให้ตรงกับชื่อปุ๋ย
CLASS_ID_MAP = {0: 'K', 1: 'N', 2: 'P'}

# 🔥 MATERIAL PHYSICS DATABASE 🔥
# นี่คือค่าคงที่ทางวิทยาศาสตร์ (ไม่ต้องเปลี่ยนไปตามล็อตการผลิต)
# ใช้สำหรับคำนวณน้ำหนักทางกายภาพ (Physical Mass) จากพื้นที่ 2 มิติ (Pixels)
MATERIAL_PROPS = {
    'N': {
        'density': 1.33,
        'shape_factor': 1.0   # ยูเรียทรงกลม (อ้างอิงเป็นค่าสัมบูรณ์ 1.0)
    },
    'P': {
        'density': 1.61, 
        # 📉 ลดลงจาก 0.85 -> 0.70
        # เหตุผล: เม็ด P มีสีเข้มมักกินพื้นที่เงาเข้ามารวมด้วย ทำให้ Area ที่อ่านได้ใหญ่เกินจริง จึงต้องกด Factor ลงมาชดเชย
        'shape_factor': 0.70  
    },
    'K': {
        'density': 1.98,
        'shape_factor': 0.60  # K ทรงแบนเหมือนเกล็ดเกลือ แบนกว่าเม็ดกลม จึงให้ factor 0.60 (แม่นยำแล้วจากการทดสอบ)
    },
    'Filler': {
        'density': 2.40,      # Filler มักเป็นหินบด มีความหนาแน่นสูง
        'shape_factor': 0.80  # หินบดมักมีรูปร่างไม่แน่นอน แต่มีความหนากว่าแผ่น K
    }
}

# ฟังก์ชันแปลงภาพ OpenCV (BGR) เป็น Base64 String สำหรับส่งกลับไปแสดงผลที่ Frontend
def bgr_to_base64(img):
    _, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    return base64.b64encode(buffer).decode('utf-8')

# API หลักสำหรับวิเคราะห์ภาพ
@app.post("/analyze_interactive")
async def analyze_interactive(
    file: UploadFile = File(...),   # รับไฟล์รูปภาพ
    threshold: int = Form(35)       # รับค่าความสว่าง/Saturation สำหรับแยก N กับ Filler
):
    try:
        # อ่านไฟล์ภาพที่อัปโหลดและแปลงเป็น OpenCV Format
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # 1. รันโมเดล YOLO เพื่อหาพิกัด
        # max_det=3000: ให้หาเม็ดปุ๋ยสูงสุด 3000 เม็ด, conf=0.15: ค่าความมั่นใจเริ่มต้น
        results = model.predict(img, verbose=False, max_det=3000, conf=0.15, iou=0.6, imgsz=1024)
        
        # แปลงภาพเป็น HSV สำหรับใช้กับ Logic แยก N และ Filler ควบคู่ไปด้วย
        hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # ตัวแปรเก็บน้ำหนัก (Relative Mass)
        mass_scores = {'N': 0.0, 'P': 0.0, 'K': 0.0, 'Filler': 0.0}
        
        # Setup Visuals สร้างภาพพื้นหลังทึบและเส้นขอบสองสไตล์
        dark_bg = cv2.addWeighted(img, 0.4, np.zeros_like(img), 0.6, 0)
        thick_lines = np.zeros_like(img)
        thin_lines = np.zeros_like(img)
        saturation_samples = [] # เก็บค่า Saturation ของ N มาสร้างกราฟ

        if results[0].masks is not None:
            masks_xy = results[0].masks.xy
            classes_ids = results[0].boxes.cls.cpu().numpy()
            
            for i, polygon in enumerate(masks_xy):
                if len(polygon) < 3: continue # ข้ามถ้าจุดเหลี่ยมน้อยเกินไป
                
                cls_id = int(classes_ids[i])
                base_name = CLASS_ID_MAP.get(cls_id, 'Unknown')
                cnt = np.array(polygon, dtype=np.int32)
                area_2d = cv2.contourArea(cnt)
                
                final_name = base_name
                color = (255, 255, 255)

                # --- N vs Filler Logic ---
                # เนื่องจากโมเดลแยก N(ขาว) กับ Filler(ขุ่น/หินปูน) ยากด้วย Shape จึงใช้สี (Saturation) มาช่วยแยกชี้ขาด
                if cls_id == 1:
                    mask = np.zeros(img.shape[:2], dtype=np.uint8)
                    cv2.drawContours(mask, [cnt], -1, 255, -1)
                    # Erode เข้าไป 1 pixel ป้องกันการเอาขอบเงามาคิดสีเฉลี่ย
                    kernel = np.ones((3,3), np.uint8)
                    mask_inner = cv2.erode(mask, kernel, iterations=1)
                    if cv2.countNonZero(mask_inner) == 0: mask_inner = mask
                    
                    mean_val = cv2.mean(hsv_img, mask=mask_inner)
                    sat_val = int(mean_val[1]) # ค่า Saturation (ความสดของสี)
                    saturation_samples.append(sat_val)

                    if sat_val > threshold:
                        final_name = 'Filler'
                        color = (0, 255, 255) # ให้ Filler เป็นสีฟ้า (Cyan)
                    else:
                        final_name = 'N'
                        color = (200, 200, 200) # ให้ N เป็นสีขาวเทา
                
                elif cls_id == 0: color = (50, 50, 255) # แดง (K)
                elif cls_id == 2: color = (50, 255, 50) # เขียว (P)

                # -----------------------------------------------------------
                # ⚖️ REAL PHYSICS CALCULATION
                # -----------------------------------------------------------
                props = MATERIAL_PROPS.get(final_name, {'density':1, 'shape_factor':1})
                
                # 1. Volume Estimation (Area^1.5) พยายามคาดเดาปริมาตร 3D จากพื้นที่ 2D
                estimated_vol = pow(area_2d, 1.5)
                
                # 2. Shape Correction (สำคัญมาก! ช่วยแก้เรื่องเม็ดแบน(K)/เม็ดกลม(N))
                corrected_vol = estimated_vol * props['shape_factor']
                
                # 3. Density (Mass = Vol * Density) คูณความหนาแน่นเพื่อถ่วงน้ำหนัก
                relative_mass = corrected_vol * props['density']
                
                mass_scores[final_name] += relative_mass
                # -----------------------------------------------------------

                # วาดเส้นขอบผลลัพธ์
                cv2.drawContours(thick_lines, [cnt], -1, color, 3)
                contrast_color = (0,0,0) if final_name == 'N' else (255,255,255)
                cv2.drawContours(thin_lines, [cnt], -1, contrast_color, 1)

        # ประกอบร่างภาพและเส้นขอบเป็นภาพผลลัพธ์สุดท้าย
        final_vis = cv2.add(dark_bg, thick_lines)
        mask_thin = cv2.cvtColor(thin_lines, cv2.COLOR_BGR2GRAY) > 0
        final_vis[mask_thin] = thin_lines[mask_thin]

        # สร้าง Histogram สำหรับค่า Saturation ของกลุ่ม N/Filler
        hist_data = [0]*256
        auto_thresh = 35
        if saturation_samples:
            for s in saturation_samples: hist_data[s]+=1
            # ใช้ Otsu's Thresholding เพื่อเดาค่าแยกที่เหมาะสมแบบอัตโนมัติ
            samples_np = np.array(saturation_samples, dtype=np.uint8)
            ret, _ = cv2.threshold(samples_np, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
            auto_thresh = int(ret)

        # ส่งคำตอบกลับ
        return JSONResponse({
            "image_b64": bgr_to_base64(final_vis),
            # ส่งค่า Mass Score (ที่เป็นน้ำหนักสัมพัทธ์) กลับไป Frontend จะเอาไปเทียบอัตราส่วนเปอร์เซ็นต์ของตัวเอง
            "areas": mass_scores, 
            "histogram": hist_data,
            "auto_threshold": auto_thresh
        })

    except Exception as e:
        print(e)
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)