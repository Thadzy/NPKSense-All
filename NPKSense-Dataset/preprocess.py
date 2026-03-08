import os
from PIL import Image, ImageEnhance

# ==============================================================================
# สคริปต์สำหรับเตรียมข้อมูลรูปภาพ (Data Preprocessing) 
# หน้าที่หลัก: ปรับแต่งภาพ (Data Augmentation) เช่น เพิ่มความสดของสี (Saturation/Vibrance)
# เพื่อให้โมเดลเรียนรู้การแยกแยะสีของเม็ดปุ๋ย (โดยเฉพาะ N สีขาว กับ Filler สีขุ่น) ได้ดีขึ้น
# ==============================================================================

# กำหนด Path ของโฟลเดอร์รูปภาพต้นฉบับ (เปลี่ยนตามเวอร์ชัน Dataset ที่ใช้งาน เช่น v1, v2, v3, v4)
source_folder = "/Users/thadzy/Documents/Thadzy/NPKSense/v4"

# สร้างโฟลเดอร์รันสำหรับเก็บภาพที่ Process แล้ว (เพื่อไม่ให้ไฟล์ต้นฉบับถูกเขียนทับ)
output_folder = os.path.join(source_folder, "processed")

if not os.path.exists(output_folder):
    os.makedirs(output_folder)

# ระบุนามสกุลไฟล์ที่รองรับการนำเข้า
valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff')

print(f"กำลังเริ่ม Process รูปภาพจาก: {source_folder}")

processed_count = 0

# วนลูปอ่านทุกไฟล์ในโฟลเดอร์ต้นฉบับ
for filename in os.listdir(source_folder):
    if filename.lower().endswith(valid_extensions):
        img_path = os.path.join(source_folder, filename)
        
        try:
            with Image.open(img_path) as img:
                # แปลงเป็น RGB เสมอ เพื่อป้องกัน Error กับไฟล์ PNG แบบโปร่งใส หรือโหมดสีอื่นๆ
                if img.mode != 'RGB':
                    img = img.convert('RGB')

                # --- ส่วนของการปรับแต่งภาพ (Image Enhancement) ---
                
                # 1. ปรับ Saturation (ความอิ่มตัวของสี) +100% 
                # (ค่า 1.0 = ภาพเดิม, 0.0 = ขาวดำ, 2.0 = เพิ่ม 100%)
                converter = ImageEnhance.Color(img)
                img_enhanced = converter.enhance(2.0) 

                # 2. จำลอง Vibrance (เร่งสีเฉพาะจุดที่สียังไม่สด)
                # ในไลบรารี Pillow ไม่มีโหมด Vibrance โดยตรง จึงใช้เทคนิคเร่ง Saturation ซ้ำอีกรอบ
                # เพื่อดึงความเบลอหรือสีซีดของเม็ดปุ๋ยให้เด่นชัดขึ้น
                converter_vib = ImageEnhance.Color(img_enhanced)
                
                # เพิ่มอีก 50% (factor = 1.5) รวมกับการปรับรอบแรกจะทำให้สีอิ่มตัวมาก 
                # (หากภาพสดเกินไป สามารถปรับลดค่า 1.5 ลงให้เหมาะกับ Dataset ล็อตนั้นๆ)
                final_img = converter_vib.enhance(1.5) 

                # ------------------------------------------------
                
                # บันทึกไฟล์ไปยังโฟลเดอร์ processed ด้วยคุณภาพสูง (quality=95)
                save_path = os.path.join(output_folder, filename)
                final_img.save(save_path, quality=95)
                
                print(f"Processed: {filename}")
                processed_count += 1
                
        except Exception as e:
            print(f"Error processing {filename}: {e}")

print("---")
print(f"เสร็จสิ้น! ทำการ Process ทั้งหมด {processed_count} รูป")
print(f"ไฟล์ถูกบันทึกไว้ที่: {output_folder}")