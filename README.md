# Electricity AI — Login / Register

หน้าเว็บเดิม + Python + Gemini พร้อมหน้าเข้าสู่ระบบ สมัครสมาชิก และ Logout
ใช้ **อีเมล + รหัสผ่าน** เป็นบัญชี สมัครครั้งเดียวแล้วกลับมาเข้าสู่ระบบด้วยบัญชีเดิมได้

## อัปเดตโปรเจกต์เดิม

นำไฟล์ใน ZIP ไปวางข้างไฟล์เดิม และทับ app.py, index.html, script.js, style.css
เพิ่ม auth.py และใช้ requirements.txt / .gitignore ชุดนี้
เก็บ .env เดิมไว้ ไม่ต้องเปลี่ยน Gemini key ที่ใช้งานได้อยู่แล้ว

## ทดสอบในเครื่องด้วย Python

```powershell
py -m pip install -r requirements.txt
py app.py
```

เปิด http://localhost:3000 → สมัครสมาชิกด้วยชื่อ อีเมล และรหัสผ่าน 8–128 ตัวอักษร
สมัครสำเร็จแล้วจะเข้าสู่ระบบให้ ลอง Logout แล้ว Login ด้วยอีเมลและรหัสผ่านเดิม

หากยังไม่มี .env:

```env
GEMINI_API_KEY=ใส่คีย์จริงของตัวเอง
GEMINI_MODEL=gemini-3.5-flash-lite
```

เมื่อไม่มีการตั้งค่า Supabase ตัวรัน Python จะสร้าง accounts.db ในโฟลเดอร์เดียวกับ app.py
บัญชียังอยู่แม้ Logout หรือปิดตัวรัน ห้ามลบ accounts.db ถ้าต้องการเก็บบัญชีเดิม
รหัสผ่านเก็บเป็น PBKDF2-SHA256 hash พร้อม salt แยกแต่ละบัญชี ไม่เก็บรหัสผ่านจริง
หลังปิด/เปิดตัวรันใหม่ให้ Login อีกครั้ง แต่ไม่ต้องสมัครใหม่
เซสชันหมดอายุใน 12 ชั่วโมง และ Logout จะยกเลิกเซสชันฝั่ง Python
ข้อมูลบิล แชต และห้องเป็นข้อมูลในหน้าจอและเริ่มใหม่เมื่อโหลดหน้าใหม่ บัญชีสมาชิกบันทึกแยกถาวร

## บัญชีถาวรบน Streamlit Cloud: ใช้ Supabase Auth

Streamlit Cloud ไม่รับประกันว่าไฟล์ฐานข้อมูลในเครื่องจะอยู่หลังรีสตาร์ต
จึงต้องใช้ Supabase Auth สำหรับบัญชีบน Cloud โค้ดจะไม่ใช้ SQLite แทนโดยเงียบ ๆ
บัญชีที่ทดลองใน SQLite กับบัญชีใน Supabase เป็นคนละชุด หากอยากใช้ชุดเดียวกันทั้งสองที่
ให้ตั้งค่า Supabase ตั้งแต่ทดสอบในเครื่อง

1. เข้า https://supabase.com/dashboard แล้วสร้างโปรเจกต์
2. คัดลอก Project URL และ **Publishable key** จากหน้าการเชื่อมต่อ/การตั้งค่า API ของโปรเจกต์
   รองรับ legacy anon key ผ่าน SUPABASE_ANON_KEY ด้วย ไม่ต้องใช้ service_role หรือ secret key
3. ตรวจว่าเปิด Authentication แบบ Email/Password และอนุญาตการสมัครผู้ใช้ใหม่
4. หากเปิดการยืนยันอีเมล ผู้สมัครต้องกดลิงก์ในอีเมลก่อน Login
   ตั้ง Site URL / Redirect URLs ของ Supabase เป็น URL เว็บที่ใช้งานจริง
   การกดยืนยันสำเร็จให้กลับมา Login ในเว็บนี้ (ไม่มีการ Login อัตโนมัติจากลิงก์)
   สำหรับทดสอบทันทีสามารถปิด Confirm email ในการตั้งค่า Email ของ Supabase
5. อัปโหลดไฟล์เหล่านี้ไว้ในโฟลเดอร์เดียวกันบน GitHub:
   app.py, auth.py, index.html, script.js, style.css, requirements.txt, .gitignore
6. เข้า https://share.streamlit.io/ เลือกไฟล์หลัก app.py และ Python 3.12
7. ใส่ค่าต่อไปนี้ใน Advanced settings → Secrets:

```toml
GEMINI_API_KEY = "คีย์ Gemini ของคุณ"
GEMINI_MODEL = "gemini-3.5-flash-lite"
SUPABASE_URL = "https://PROJECT-ID.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "Publishable key ของโปรเจกต์"
```

เมื่อเปลี่ยนจาก SQLite เป็น Supabase ให้สมัครในระบบใหม่หนึ่งครั้ง
จากนั้นใช้บัญชี Supabase เดิมได้ทุกครั้ง รวมถึงหลัง Streamlit รีสตาร์ต
ดูรายชื่อผู้สมัครได้ที่ Supabase → Authentication → Users

หากต้องการใช้ Supabase กับ Python โดยตรง ให้เพิ่ม SUPABASE_URL และ
SUPABASE_PUBLISHABLE_KEY ใน .env ตามชื่อเดียวกัน แล้วรัน app.py ใหม่

หากต้องการทดสอบ Streamlit ในเครื่อง ให้คัดลอก .streamlit/secrets.toml.example
เป็น .streamlit/secrets.toml ใส่ค่าจริง แล้วรัน:

```powershell
py -m streamlit run app.py
```

ห้ามอัปโหลด .env, .streamlit/secrets.toml ที่มีคีย์จริง หรือ accounts.db ขึ้น GitHub
ZIP นี้ไม่มีคีย์จริงหรือข้อมูลบัญชีของใคร

## การใช้งานและการตรวจสอบ

- ทุกคำขอ AI ต้องมีเซสชัน Login ที่ Python ตรวจสอบแล้ว
- Python ใช้ cookie แบบ HttpOnly / SameSite=Strict; Streamlit เก็บเซสชันฝั่ง Python
- Logout ยกเลิกเซสชันและโหลดหน้าใหม่เพื่อล้างข้อมูลหน้าจอของบัญชีก่อนหน้า
- มีการตรวจข้อมูลสมัคร ป้องกันอีเมลซ้ำใน SQLite และจำกัดการลอง Login ถี่เกินไป
- คีย์ Gemini และ token ของ Supabase ไม่ถูกส่งให้ JavaScript
- ทดสอบบัญชี SQLite จริง รวมถึงปิด/เปิดบริการแล้ว Login เดิม, cookie, API ที่ยังไม่ Login
- ทดสอบหน้าฟอร์มและ Streamlit Component รวมถึงการ rerun ที่ไม่ทำคำขอซ้ำ
- ทดสอบ Supabase และ Gemini ด้วยคำตอบจำลอง ยังไม่ได้เชื่อมโปรเจกต์/คีย์จริงของผู้ใช้

เอกสาร: https://docs.streamlit.io/develop/concepts/connections/connecting-to-data
และ https://supabase.com/docs/guides/auth/passwords
