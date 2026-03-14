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
# เซิร์ฟเวอร์ API หลักสำหรับ Production (ใช้งานร่วมกับ Next.js Frontend)
# รับภาพจากผู้ใช้, ทำ Perspective Transform ให้ขนานพื้น, รัน YOLO ตรวจจับปุ๋ย
# และคำนวณหาน้ำหนักธาตุอาหาร N-P-K สุทธิเพื่อส่งต่อไปหน้า Calculator
# ==============================================================================

app = FastAPI()

# เปิด CORS อนุญาตให้ Frontend (Next.js) เรียก API ข้ามโดเมนได้
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- CONFIG ---
MODEL_PATH = "npksensev2.pt"
try:
    model = YOLO(MODEL_PATH)
except Exception as e:
    print(f"Error loading YOLO model: {e}")

CLASS_ID_MAP = {0: 'K', 1: 'N', 2: 'P'}

# สัดส่วนธาตุอาหารในแม่ปุ๋ยมาตรฐาน (Chemical Composition Factors)
NUTRIENT_FACTORS = {
    'N':      {'N': 0.46, 'P': 0.00, 'K': 0.00}, # ยูเรียโฟม (Urea) สูตร 46-0-0
    'P':      {'N': 0.18, 'P': 0.46, 'K': 0.00}, # ไดแอมโมเนียมฟอสเฟต (DAP) สูตร 18-46-0
    'K':      {'N': 0.00, 'P': 0.00, 'K': 0.60}, # มิวเรียตออฟโพแทช (MOP) สูตร 0-0-60
    'Filler': {'N': 0.00, 'P': 0.00, 'K': 0.00}  # สารเติมเต็ม ไม่มีธาตุอาหาร
}

# ข้อมูลทางฟิสิกส์สำหรับแปลงพื้นที่ (Area) เป็นน้ำหนักและปริมาตร 3D
MATERIAL_PROPS = {
    'N':      { 'density': 1.33, 'shape_factor': 1.0 },
    'P':      { 'density': 1.61, 'shape_factor': 0.70 },
    'K':      { 'density': 1.98, 'shape_factor': 0.60 },
    'Filler': { 'density': 2.40, 'shape_factor': 0.80 }
}

# สร้าง Base64 จากภาพ OpenCV เพื่อให้ Frontend นำไปใช้แสดงผล (img tag)
def bgr_to_base64(img):
    _, buffer = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return base64.b64encode(buffer).decode('utf-8')

@app.get("/health")
async def health():
    return {"status": "ok"}

def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

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
                if area > (w * h * 0.05):
                    screen_cnt = approx
                    break

        if screen_cnt is not None:
            pts = screen_cnt.reshape(4, 2).astype(float)
            ordered = order_points(pts)
            margin_x, margin_y = w * 0.01, h * 0.01
            offsets = [(-margin_x, -margin_y), (margin_x, -margin_y), (margin_x, margin_y), (-margin_x, margin_y)]
            points = [
                {"x": float(max(0, min(1, (ordered[i][0] + offsets[i][0]) / w))),
                 "y": float(max(0, min(1, (ordered[i][1] + offsets[i][1]) / h)))}
                for i in range(4)
            ]
            return JSONResponse({"points": points, "detected": True})
        else:
            return JSONResponse({"points": [
                {"x": 0.05, "y": 0.05},
                {"x": 0.95, "y": 0.05},
                {"x": 0.95, "y": 0.95},
                {"x": 0.05, "y": 0.95},
            ], "detected": False})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

# ✅ ฟังก์ชันดัดภาพ (Perspective Transform)
def four_point_transform(image, pts):
    rect = np.array(pts, dtype="float32")
    (tl, tr, br, bl) = rect

    widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
    widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
    maxWidth = max(int(widthA), int(widthB))

    heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
    heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
    maxHeight = max(int(heightA), int(heightB))

    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1]], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
    return warped


def find_clicked_pellet_lab(clicked_norm, class1_data, img_shape):
    """คืน LAB color เฉลี่ยของเม็ดปุ๋ยที่ครอบคลุมจุดคลิกจุดเดียว (normalized coords 0.0–1.0)
    ถ้าคลิกนอก contour ทั้งหมด จะ fallback หา centroid ที่ใกล้ที่สุดแทน"""
    h, w = img_shape[:2]
    cx = int(clicked_norm['x'] * w)
    cy = int(clicked_norm['y'] * h)

    for d in class1_data:
        cnt_f = d['cnt'].astype(np.float32)
        if cv2.pointPolygonTest(cnt_f, (float(cx), float(cy)), False) >= 0:
            return d['lab']

    min_dist = float('inf')
    closest_lab = None
    for d in class1_data:
        M = cv2.moments(d['cnt'])
        if M['m00'] > 0:
            mcx = M['m10'] / M['m00']
            mcy = M['m01'] / M['m00']
            dist = math.sqrt((cx - mcx) ** 2 + (cy - mcy) ** 2)
            if dist < min_dist:
                min_dist = dist
                closest_lab = d['lab']
    return closest_lab


def find_clicked_pellets_lab(clicked_norms, class1_data, img_shape):
    """รับ list ของจุดคลิก (normalized coords) และคืน list ของ LAB colors
    ที่ตรงกับเม็ดปุ๋ยแต่ละจุด (None entries ถูกกรองออก)"""
    return [lab for p in clicked_norms
            if (lab := find_clicked_pellet_lab(p, class1_data, img_shape)) is not None]


@app.post("/analyze_interactive")
async def analyze_interactive(
    file: UploadFile = File(...),
    points: str = Form(None),            # พิกัด 4 มุมสำหรับ Perspective Transform
    ref_n_points: str = Form(None),      # รายการจุด Reference สำหรับ N — JSON array of {x,y}
    ref_filler_points: str = Form(None), # รายการจุด Reference สำหรับ Filler — JSON array of {x,y}
):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        # ✅ ดัดภาพมุมมอง (Warp Perspective) ก่อนส่งให้ YOLO
        raw_cropped = None
        if points:
            try:
                pts_norm = json.loads(points)
                h, w = img.shape[:2]
                pts_pixel = [[p['x'] * w, p['y'] * h] for p in pts_norm]
                img = four_point_transform(img, pts_pixel)
                raw_cropped = img.copy()
            except Exception as e:
                print(f"Warp Error: {e}")

        # รัน YOLO Inference
        results = model.predict(img, verbose=False, max_det=3000, conf=0.15, iou=0.6, imgsz=1024)

        # แปลงภาพเป็น LAB Color Space สำหรับ Feature Extraction
        lab_img = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)

        mass_scores = {'N': 0.0, 'P': 0.0, 'K': 0.0, 'Filler': 0.0}

        dark_bg = cv2.addWeighted(img, 0.4, np.zeros_like(img), 0.6, 0)
        thick_lines = np.zeros_like(img)
        thin_lines = np.zeros_like(img)

        method = "l_threshold_auto"

        if results[0].masks is not None:
            masks_xy = results[0].masks.xy
            classes_ids = results[0].boxes.cls.cpu().numpy()

            # ==================================================================
            # ✅ [PASS 1] Feature Extraction — สกัดค่าสี LAB เฉลี่ยจากเม็ด Class 1
            # ==================================================================
            class1_data = []
            other_contours = []

            for i, polygon in enumerate(masks_xy):
                if len(polygon) < 3: continue
                cls_id = int(classes_ids[i])
                cnt = np.array(polygon, dtype=np.int32)
                area_2d = cv2.contourArea(cnt)

                if cls_id == 1:
                    mask = np.zeros(img.shape[:2], dtype=np.uint8)
                    cv2.drawContours(mask, [cnt], -1, 255, -1)
                    kernel = np.ones((3, 3), np.uint8)
                    mask_inner = cv2.erode(mask, kernel, iterations=1)
                    if cv2.countNonZero(mask_inner) == 0:
                        mask_inner = mask

                    mean_lab = cv2.mean(lab_img, mask=mask_inner)
                    class1_data.append({
                        'index': i, 'cnt': cnt, 'area': area_2d,
                        'lab': [mean_lab[0], mean_lab[1], mean_lab[2]]
                    })
                else:
                    other_contours.append({
                        'index': i, 'cls_id': cls_id, 'cnt': cnt, 'area': area_2d
                    })

            # ==================================================================
            # ✅ [PASS 2] Classification — N vs Filler
            #
            # โหมด A (Multi-point Calibration): มี ref_n_points + ref_filler_points
            #   → สกัด LAB จากทุกจุดที่ User คลิก
            #   → ใช้ Nearest-Neighbor (min dist to ANY reference) ใน LAB color space
            #   → ทนทานต่อแสงไม่สม่ำเสมอ/เงาในภาพมากกว่า single-point
            #
            # โหมด B (Auto Fallback): ไม่มี reference points
            #   → ใช้ L-channel threshold (L > 140 = N, else Filler)
            # ==================================================================
            class1_labels = {}

            ref_n_list   = json.loads(ref_n_points)      if ref_n_points      else []
            ref_f_list   = json.loads(ref_filler_points) if ref_filler_points else []

            if ref_n_list and ref_f_list and len(class1_data) >= 1:
                # โหมด A: Multi-point Nearest-Neighbor Calibration
                labs_n = find_clicked_pellets_lab(ref_n_list, class1_data, img.shape)
                labs_f = find_clicked_pellets_lab(ref_f_list, class1_data, img.shape)

                if labs_n and labs_f:
                    arrs_n = [np.array(l, dtype=np.float32) for l in labs_n]
                    arrs_f = [np.array(l, dtype=np.float32) for l in labs_f]
                    for d in class1_data:
                        lab = np.array(d['lab'], dtype=np.float32)
                        min_dist_n = min(float(np.linalg.norm(lab - a)) for a in arrs_n)
                        min_dist_f = min(float(np.linalg.norm(lab - a)) for a in arrs_f)
                        class1_labels[d['index']] = 'N' if min_dist_n <= min_dist_f else 'Filler'
                    method = f"multipoint_calibration(n={len(labs_n)},f={len(labs_f)})"
                else:
                    # ref points ไม่ตกบน contour ใด → L-threshold fallback
                    for d in class1_data:
                        class1_labels[d['index']] = 'N' if d['lab'][0] > 140 else 'Filler'
                    method = "l_threshold_fallback"
            else:
                # โหมด B: Auto L-threshold
                for d in class1_data:
                    class1_labels[d['index']] = 'N' if d['lab'][0] > 140 else 'Filler'
                if len(class1_data) == 1:
                    class1_labels[class1_data[0]['index']] = 'N'
                method = "l_threshold_auto"

            # ==================================================================
            # ✅ [PASS 3] คำนวณ Mass + วาด Visual Feedback
            # ==================================================================
            for d in class1_data:
                final_name = class1_labels.get(d['index'], 'N')
                cnt = d['cnt']
                area_2d = d['area']

                color = (200, 200, 200) if final_name == 'N' else (0, 255, 255)

                props = MATERIAL_PROPS.get(final_name, {'density': 1, 'shape_factor': 1})
                estimated_vol = pow(area_2d, 1.5)
                relative_mass = estimated_vol * props['shape_factor'] * props['density']

                factors = NUTRIENT_FACTORS.get(final_name, {'N': 0, 'P': 0, 'K': 0})
                mass_scores['N'] += relative_mass * factors['N']
                mass_scores['P'] += relative_mass * factors['P']
                mass_scores['K'] += relative_mass * factors['K']
                total_nutrient_content = factors['N'] + factors['P'] + factors['K']
                mass_scores['Filler'] += relative_mass * (1.0 - total_nutrient_content)

                cv2.drawContours(thick_lines, [cnt], -1, color, 3)
                contrast_color = (0, 0, 0) if final_name == 'N' else (255, 255, 255)
                cv2.drawContours(thin_lines, [cnt], -1, contrast_color, 1)

            for d in other_contours:
                cls_id = d['cls_id']
                cnt = d['cnt']
                area_2d = d['area']
                base_name = CLASS_ID_MAP.get(cls_id, 'Unknown')

                if cls_id == 0:   color = (50, 50, 255)   # Red (K)
                elif cls_id == 2: color = (50, 255, 50)   # Green (P)
                else:             color = (255, 255, 255)

                props = MATERIAL_PROPS.get(base_name, {'density': 1, 'shape_factor': 1})
                estimated_vol = pow(area_2d, 1.5)
                relative_mass = estimated_vol * props['shape_factor'] * props['density']

                factors = NUTRIENT_FACTORS.get(base_name, {'N': 0, 'P': 0, 'K': 0})
                mass_scores['N'] += relative_mass * factors['N']
                mass_scores['P'] += relative_mass * factors['P']
                mass_scores['K'] += relative_mass * factors['K']
                total_nutrient_content = factors['N'] + factors['P'] + factors['K']
                mass_scores['Filler'] += relative_mass * (1.0 - total_nutrient_content)

                cv2.drawContours(thick_lines, [cnt], -1, color, 3)
                cv2.drawContours(thin_lines, [cnt], -1, (255, 255, 255), 1)

        final_vis = cv2.add(dark_bg, thick_lines)
        mask_thin = cv2.cvtColor(thin_lines, cv2.COLOR_BGR2GRAY) > 0
        final_vis[mask_thin] = thin_lines[mask_thin]

        response = {
            "image_b64": bgr_to_base64(final_vis),
            "areas": mass_scores,
            "method": method,
        }
        if raw_cropped is not None:
            response["raw_cropped_b64"] = bgr_to_base64(raw_cropped)

        return JSONResponse(response)

    except Exception as e:
        print(f"Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
