from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
import cv2
import numpy as np
import base64
import json
import math

# ==============================================================================
# เซิร์ฟเวอร์ API หลักสำหรับรันบน Hugging Face Spaces (Production Backend)
# โค้ดนี้มี 2 ส่วนหลักที่เพิ่มขึ้นมาจากฝั่ง Dataset คือ:
# 1. ระบบดัดภาพมุมมอง (Perspective Transform) สำหรับแก้ภาพเอียงจากกล้อง
# 2. ระบบคำนวณธาตุอาหารจริง (Chemical Composition) จากน้ำหนักเชิงกายภาพ
# ==============================================================================

app = FastAPI()

# เปิด CORS เพื่อให้รับ Request จาก Web Frontend (Next.js) ได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG ---
MODEL_PATH = "npksense.pt" 
try:
    model = YOLO(MODEL_PATH)
except Exception as e:
    print(f"Error loading model: {e}")

CLASS_ID_MAP = {0: 'K', 1: 'N', 2: 'P'}

# [UPDATED] สัดส่วนธาตุอาหารในแม่ปุ๋ยมาตรฐาน (Chemical Composition Factors)
# ใช้สำหรับแปลงน้ำหนักทางกายภาพ (Physical Weight/Mass) เป็นน้ำหนักธาตุอาหารเสริม (Chemical Nutrient Weight)
# ข้อมูลอ้างอิงจากสูตรปุ๋ยมาตรฐานสากล
NUTRIENT_FACTORS = {
    'N':      {'N': 0.46, 'P': 0.00, 'K': 0.00}, # ยูเรียโฟม (Urea) สูตร 46-0-0
    'P':      {'N': 0.18, 'P': 0.46, 'K': 0.00}, # ไดแอมโมเนียมฟอสเฟต (DAP) สูตร 18-46-0 -> มีไนโตรเจน (N) ปนมาด้วย 18%
    'K':      {'N': 0.00, 'P': 0.00, 'K': 0.60}, # มิวเรียตออฟโพแทช (MOP) สูตร 0-0-60
    'Filler': {'N': 0.00, 'P': 0.00, 'K': 0.00}  # สารเติมเต็ม (Filler) เช่น ดินขาว/หินปูน ไม่มีธาตุอาหาร
}

# ข้อมูลทางฟิสิกส์สำหรับแปลงพื้นที่ 2D เป็นน้ำหนักและปริมาตร 3D
MATERIAL_PROPS = {
    'N':      { 'density': 1.33, 'shape_factor': 1.0 },  # N ทรงกลม เป็นเบสไลน์
    'P':      { 'density': 1.61, 'shape_factor': 0.70 }, # P สีเข้มแก้ปัญหาเงาด้วย factor 0.70
    'K':      { 'density': 1.98, 'shape_factor': 0.60 }, # K เม็ดแบน ลด factor ปริมาตรเหลือ 0.60
    'Filler': { 'density': 2.40, 'shape_factor': 0.80 }  # หินบด (Filler) ความหนาแน่นสูง
}

# ฟังก์ชันแปลงภาพ OpenCV เป็น Base64 เพื่อส่งคืนให้ Web Frontend
def bgr_to_base64(img):
    _, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return base64.b64encode(buffer).decode('utf-8')

# ✅ ฟังก์ชันดัดภาพ (Perspective Transform)
# จำเป็นมากเพราะในการใช้งานจริง กล้องโทรศัพท์มักไม่ได้ระนาบขนาน 100% กับพื้น
# ถ้ารูปเอียง เม็ดปุ๋ยระยะไกลจะดูเล็กกว่าระยะใกล้ ทำให้การคำนวณ Mass ผิดพลาด
@app.get("/health")
async def health():
    return {"status": "ok"}

# ✅ เรียงพิกัดมุม 4 จุดให้อยู่ในลำดับ TL, TR, BR, BL
def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # Top-Left: ผลบวกน้อยสุด
    rect[2] = pts[np.argmax(s)]   # Bottom-Right: ผลบวกมากสุด
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)] # Top-Right: ผลต่างน้อยสุด
    rect[3] = pts[np.argmax(diff)] # Bottom-Left: ผลต่างมากสุด
    return rect

# ✅ ตรวจหา 4 มุมกระดาษ/ถาดอัตโนมัติด้วย OpenCV
@app.post("/detect_corners")
async def detect_corners(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        h, w = img.shape[:2]

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 50, 150)

        kernel = np.ones((5, 5), np.uint8)
        edges = cv2.dilate(edges, kernel, iterations=2)

        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)

        screen_cnt = None
        for c in contours[:10]:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                area = cv2.contourArea(approx)
                if area > (w * h * 0.05):  # ต้องใหญ่กว่า 5% ของรูป
                    screen_cnt = approx
                    break

        if screen_cnt is not None:
            pts = screen_cnt.reshape(4, 2).astype(float)
            ordered = order_points(pts)
            # ขยายมุมออกเล็กน้อย (2%) เพื่อให้ไม่ตัดขอบ
            margin_x, margin_y = w * 0.01, h * 0.01
            offsets = [(-margin_x, -margin_y), (margin_x, -margin_y), (margin_x, margin_y), (-margin_x, margin_y)]
            points = [
                {"x": float(max(0, min(1, (ordered[i][0] + offsets[i][0]) / w))),
                 "y": float(max(0, min(1, (ordered[i][1] + offsets[i][1]) / h)))}
                for i in range(4)
            ]
            return JSONResponse({"points": points, "detected": True})
        else:
            # Fallback: มุม 5% จากขอบรูป
            return JSONResponse({"points": [
                {"x": 0.05, "y": 0.05},
                {"x": 0.95, "y": 0.05},
                {"x": 0.95, "y": 0.95},
                {"x": 0.05, "y": 0.95},
            ], "detected": False})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

def four_point_transform(image, pts):
    rect = np.array(pts, dtype="float32")
    (tl, tr, br, bl) = rect

    # คำนวณความกว้างใหม่ของภาพหลังจากดัดให้ตรง
    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))

    # คำนวณความสูงใหม่ของภาพ
    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))

    # พิกัดปลายทางที่ต้องการให้มุมทั้ง 4 ไปตกลงบนจอ
    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
    return warped

@app.post("/analyze_interactive")
async def analyze_interactive(
    file: UploadFile = File(...), 
    threshold: int = Form(35),     # ค่า Saturation สำหรับแยก N (เม็ดขาว) กับ Filler (หินขุ่น)
    points: str = Form(None)       # จุด 4 จุดจากการครอบตัดภาพของ User (จากหน้าเว็บ)
):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # ✅ Warp Image Process: กระบวนการดัดภาพตามกรอบที่ User ครอบเข้ามา
        if points:
            try:
                pts_norm = json.loads(points)
                h, w = img.shape[:2]
                # แปลงพิกัด Normalize (0-1) ให้เป็น Pixel (0-W/H)
                pts_pixel = [[p['x'] * w, p['y'] * h] for p in pts_norm]
                img = four_point_transform(img, pts_pixel)
            except Exception as e:
                print(f"Warp Error: {e}")

        # รัน YOLO Inference ตรวจหาเม็ดปุ๋ย
        results = model.predict(img, verbose=False, max_det=3000, conf=0.15, iou=0.6, imgsz=1024)
        
        hsv_img = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        
        # สำหรับเก็บน้ำหนักของธาตุอาหารหลัก 3 ตัว + ฟิลเลอร์ 
        # (นี่คือน้ำหนักของ "สารอาหาร" ไม่ใช่ "เม็ดแม่ปุ๋ย")
        mass_scores = {'N': 0.0, 'P': 0.0, 'K': 0.0, 'Filler': 0.0}
        
        dark_bg = cv2.addWeighted(img, 0.4, np.zeros_like(img), 0.6, 0)
        thick_lines = np.zeros_like(img)
        thin_lines = np.zeros_like(img)
        saturation_samples = []

        if results[0].masks is not None:
            masks_xy = results[0].masks.xy
            classes_ids = results[0].boxes.cls.cpu().numpy()
            
            for i, polygon in enumerate(masks_xy):
                if len(polygon) < 3: continue
                
                cls_id = int(classes_ids[i])
                base_name = CLASS_ID_MAP.get(cls_id, 'Unknown')
                cnt = np.array(polygon, dtype=np.int32)
                area_2d = cv2.contourArea(cnt)
                
                final_name = base_name
                color = (255, 255, 255)

                # Logic แยก Filler/N ด้วย Saturation
                if cls_id == 1: # Class N
                    mask = np.zeros(img.shape[:2], dtype=np.uint8)
                    cv2.drawContours(mask, [cnt], -1, 255, -1)
                    kernel = np.ones((3,3), np.uint8)
                    mask_inner = cv2.erode(mask, kernel, iterations=1)
                    if cv2.countNonZero(mask_inner) == 0: mask_inner = mask
                    
                    mean_val = cv2.mean(hsv_img, mask=mask_inner)
                    sat_val = int(mean_val[1])
                    saturation_samples.append(sat_val)
                    
                    if sat_val > threshold:
                        final_name = 'Filler'; color = (0, 255, 255) # Cyan สำหรับ Filler
                    else:
                        final_name = 'N'; color = (200, 200, 200) # Gray/White สำหรับ N
                elif cls_id == 0: color = (50, 50, 255) # Red (K)
                elif cls_id == 2: color = (50, 255, 50) # Green (P)

                # --- [UPDATED BLOCK START] ---
                # 1. คำนวณน้ำหนักทางกายภาพ (Physical Mass) ว่าก้อนนี้หนักกี่แกรม
                props = MATERIAL_PROPS.get(final_name, {'density':1, 'shape_factor':1})
                estimated_vol = pow(area_2d, 1.5)
                relative_mass = estimated_vol * props['shape_factor'] * props['density']
                
                # 2. ดึงค่าสัมประสิทธิ์ธาตุอาหาร (Nutrient Factor) ตามชนิดของเม็ด
                factors = NUTRIENT_FACTORS.get(final_name, {'N': 0, 'P': 0, 'K': 0})
                
                # 3. กระจายน้ำหนักกายภาพเข้าสู่ธาตุอาหารจริง (Weighted Calculation)
                # ตัวอย่าง: เม็ด DAP (แม่ปุ๋ย P) หนัก 100g 
                # -> จะแตกเป็นธาตุ N 18g และ P 46g (สูตร 18-46-0) ตาม Factor ด้านบน
                mass_scores['N'] += relative_mass * factors['N']
                mass_scores['P'] += relative_mass * factors['P']
                mass_scores['K'] += relative_mass * factors['K']
                
                # 4. ส่วนเนื้อสารที่เหลือที่ไม่ใช่ธาตุอาหารหลัก ให้นับรวมเป็น Filler ทั้งหมด
                # ตัวอย่าง DAP 100g หัก N 18g และ P 46g ออก จะเหลือเนื้อกาก (Filler) 36g
                total_nutrient_content = factors['N'] + factors['P'] + factors['K']
                mass_scores['Filler'] += relative_mass * (1.0 - total_nutrient_content)
                # --- [UPDATED BLOCK END] ---

                # วาด Feedback ลงรูปภาพ
                cv2.drawContours(thick_lines, [cnt], -1, color, 3)
                contrast_color = (0,0,0) if final_name == 'N' else (255,255,255)
                cv2.drawContours(thin_lines, [cnt], -1, contrast_color, 1)

        final_vis = cv2.add(dark_bg, thick_lines)
        mask_thin = cv2.cvtColor(thin_lines, cv2.COLOR_BGR2GRAY) > 0
        final_vis[mask_thin] = thin_lines[mask_thin]

        hist_data = [0]*256
        auto_thresh = 35
        if saturation_samples:
            for s in saturation_samples: hist_data[s]+=1
            samples_np = np.array(saturation_samples, dtype=np.uint8)
            ret, _ = cv2.threshold(samples_np, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)
            auto_thresh = int(ret)
            
            THRESH_FLOOR = 40
            auto_thresh = max(auto_thresh, THRESH_FLOOR)

        return JSONResponse({
            "image_b64": bgr_to_base64(final_vis),
            # ส่งค่า Mass Score สุดท้ายของแต่ละ "ธาตุ" กลับไปแสดงบน Frontend
            "areas": mass_scores, 
            "histogram": hist_data,
            "auto_threshold": auto_thresh
        })

    except Exception as e:
        print(f"Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)