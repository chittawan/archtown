# รัน ArchTown บน Docker และเรื่อง SQLite / หน่วยความจำ (รีเฟรชแล้วหาย)

## Build & Run บน Docker

```bash
# Build
docker build -t archtown .

# Run (พอร์ต 80)
docker run -p 80:80 archtown

# Run พร้อม volume สำหรับ Cloud Sync (ให้ backup อยู่ถาวรในโฮสต์)
docker run -p 80:80 -v "$(pwd)/data:/app/data" archtown
```

- แอปจะ serve จาก `dist/` และ API Cloud Sync ใช้โฟลเดอร์ `data/sync/<userId>/backup.json`
- ถ้าไม่ mount volume `data` ข้อมูล Cloud Sync จะหายเมื่อ container ถูกทิ้ง

---

## SQLite ใน ArchTown อยู่ที่ไหน

ArchTown ใช้ **SQLite WASM** รันใน **เบราว์เซอร์** (ฝั่ง client) ไม่ได้รันบน server หรือใน Docker

- ข้อมูลโปรเจกต์/ทีม/capability เก็บใน SQLite ที่รันในเบราว์เซอร์
- Docker แค่ serve ไฟล์ static + API Cloud Sync — **ไม่ได้เก็บ SQLite ฝั่ง server**

เมื่อไม่มี OPFS แอปจะ **fallback เก็บใน IndexedDB** ( snapshot เป็น JSON) — แถบสถานะจะแสดง **「IndexedDB (เก็บถาวร)」** และรีเฟรชแล้วข้อมูลไม่หาย  
ถ้าเบราว์เซอร์ใช้ IndexedDB ไม่ได้จริงๆ (หายาก) จึงจะเหลือโหมด **「หน่วยความจำ (รีเฟรชแล้วหาย)」**

---

## ทำไม npm run dev => OPFS แต่รัน Docker localhost => ไม่ได้

มีได้ **สองสาเหตุหลัก**:

### 1) ขาด COOP/COEP (สาเหตุที่พบบ่อยเมื่อรัน Docker)

OPFS ของ SQLite WASM ใช้ **SharedArrayBuffer** — เบราว์เซอร์จะให้ใช้ SharedArrayBuffer ก็ต่อเมื่อหน้าเว็บถูก serve พร้อม header:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

| รันแบบ | Server | ส่ง COOP/COEP? | OPFS |
|--------|--------|----------------------|------|
| `npm run dev` | Vite | ใช่ (ตั้งใน vite.config) | ใช้ได้ |
| Docker / production | Express | **เดิมไม่ส่ง** → ตอนนี้ส่งแล้ว | ใช้ได้หลังแก้ |

**แก้แล้ว:** ใน `server/server.ts` ใส่ middleware ส่ง COOP/COEP ให้ทุก response แล้ว — รัน Docker แล้วเปิด **`http://localhost:80`** ควรได้ OPFS เหมือนรัน local

### 2) เปิดด้วย IP แทน localhost

| URL ที่เปิด | Secure context? | OPFS |
|-------------|------------------|------|
| `http://localhost:80` | ใช่ | ใช้ได้ (เมื่อมี COOP/COEP) |
| `http://127.0.0.1:80` หรือ `http://192.168.x.x:80` | ไม่แน่นอน / ไม่ใช่ | มักใช้ไม่ได้ → fallback IndexedDB |

**สรุป:** เปิดด้วย **`http://localhost:80`** (ไม่ใช้ 127.0.0.1 หรือ IP) และให้ server ส่ง COOP/COEP แล้ว OPFS จะใช้ได้บน Docker

---

## ทำไมถึงเป็น "หน่วยความจำ (รีเฟรชแล้วหาย)"

แอปพยายามเปิด SQLite แบบ **OPFS** (Origin Private File System) ก่อน เพราะเก็บข้อมูลถาวรได้ในเบราว์เซอร์ ถ้าเบราว์เซอร์รายงานว่า **ไม่มี OPFS** จะ fallback ไปใช้ **in-memory DB** (`file:archtown-mem.db`) ซึ่ง:

- ข้อมูลอยู่ใน RAM ของเบราว์เซอร์เท่านั้น
- **รีเฟรชหน้า = หน่วยความจำถูกล้าง = ข้อมูลหาย**

สาเหตุที่มักทำให้ใช้ OPFS ไม่ได้ (เลยกลายเป็นหน่วยความจำ หรือ fallback เป็น IndexedDB):

| สาเหตุ | รายละเอียด |
|--------|------------|
| **ไม่มี COOP/COEP** | OPFS ใช้ SharedArrayBuffer — เบราว์เซอร์จะเปิดใช้ได้เฉพาะเมื่อ server ส่ง `Cross-Origin-Opener-Policy: same-origin` และ `Cross-Origin-Embedder-Policy: require-corp`. รัน Docker/production ต้องส่ง header เหล่านี้ (ในโปรเจกต์นี้ใส่ไว้ใน `server/server.ts` แล้ว) |
| **เบราว์เซอร์ไม่รองรับ OPFS** | OPFS กับ `createSyncAccessHandle` มีใน Chrome 102+, Edge 102+ (สภาพแวดล้อมปกติ). Safari / Firefox รุ่นเก่า หรือบางโหมดอาจไม่มี |
| **ไม่ใช่ Secure Context** | OPFS ใช้ได้เฉพาะใน secure context (HTTPS หรือ `http://localhost`). ถ้าเข้าแบบ `http://192.168.x.x:80` หรือ `http://<ip>:80` บางเบราว์เซอร์จะไม่ถือว่าเป็น secure context → OPFS อาจใช้ไม่ได้ |
| **คนละ Origin** | `http://localhost:80` กับ `http://127.0.0.1:80` เป็นคนละ origin — storage (รวมถึง OPFS) แยกกัน ถ้าเคยเปิดด้วย origin หนึ่ง แล้วมาเปิดอีก origin หนึ่ง จะไม่เห็นข้อมูลเดิม |
| **โหมดส่วนตัว / Incognito** | บางเบราว์เซอร์ในโหมดส่วนตัวอาจไม่เปิด OPFS หรือล้าง storage เมื่อปิดแท็บ |

เมื่อไม่มีทั้ง OPFS และ IndexedDB (หายาก) แถบจะแสดง **「หน่วยความจำ (รีเฟรชแล้วหาย)」**

**ตอนนี้แอปมี fallback เป็น IndexedDB:** เมื่อใช้ OPFS ไม่ได้ จะโหลด/บันทึก snapshot ลง IndexedDB อัตโนมัติ — แถบจะแสดง **「IndexedDB (เก็บถาวร)」** และรีเฟรชแล้วข้อมูลไม่หาย

---

## แนวทางถ้าอยากให้ข้อมูลไม่หายเมื่อรันผ่าน Docker

1. **เปิดด้วย `http://localhost:80` (รัน Docker แล้วอยากได้ OPFS)**  
   - พิมพ์ใน address bar ว่า **`http://localhost:80`** เท่านั้น — อย่าใช้ `http://127.0.0.1:80` หรือ `http://<IP>:80` เพื่อให้เป็น secure context แล้ว OPFS ใช้ได้เหมือนตอน `npm run dev`

2. **ใช้ origin เดียวตลอด**  
   - เลือกใช้อย่างใดอย่างหนึ่งเสมอ: `http://localhost` หรือ `http://127.0.0.1` เพื่อไม่ให้ storage แยกกัน

3. **ใช้ Cloud Sync**  
   - อัปโหลด backup จากแอป แล้วเมื่อรีเฟรชหรือเปิดใหม่ให้ดาวน์โหลดกลับมา (และถ้ารัน Docker แนะนำ mount volume `data` เพื่อให้ไฟล์ backup อยู่ถาวรในโฮสต์ ตามตัวอย่างด้านบน)

4. **นำเข้าจาก YAML**  
   - ที่หน้าแรกมีตัวเลือกนำเข้าจาก YAML สำหรับโหลดข้อมูลกลับเข้า SQLite ในเบราว์เซอร์

---

## สรุป

- **Docker**: ใช้สำหรับ build และ serve แอป + API Cloud Sync; ข้อมูล SQLite หลัก **ไม่ได้อยู่บน Docker**
- **「หน่วยความจำ (รีเฟรชแล้วหาย)」**: เกิดจากเบราว์เซอร์ใช้โหมด **in-memory** เพราะใช้ OPFS ไม่ได้ (เบราว์เซอร์, secure context, origin หรือโหมดส่วนตัว)
- ถ้าต้องการให้ข้อมูลอยู่ถาวรเมื่อรันผ่าน Docker: ใช้ HTTPS/localhost ให้ได้ OPFS หรือใช้ Cloud Sync + mount volume `data`
