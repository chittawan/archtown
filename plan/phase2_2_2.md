=========================
ชิ้นที่ 2 — SyncManager.flush() (แทน upload ทั้งก้อน):
async function flush() {
  if (pendingOps.length === 0) return
  
  const ops = [...pendingOps]   // snapshot
  const version = getCurrentVersion()
  
  const res = await fetch('/api/sync/patch', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_version: version, ops })
  })
  
  if (res.ok) {
    const { version: newVersion } = await res.json()
    setCurrentVersion(newVersion)
    pendingOps.splice(0, ops.length)  // clear แค่ ops ที่ส่งไปแล้ว
    
  } else if (res.status === 409) {
    // server มี version ใหม่กว่า → download ใหม่ก่อน แล้วค่อย retry
    await downloadAndMerge()
    flush()  // retry
  }
}
```

---

## Prompt สำหรับ Cursor — ปรับ Frontend
```
ฉันมีระบบ ArchTown (React + SQLite WASM)
ตอนนี้ sync ด้วย POST /api/sync/upload (full backup)
เพิ่ง implement PATCH /api/sync/patch บน server แล้ว

ช่วยปรับ Frontend โดย:

1. สร้าง pendingOps: array ของ ops รอ sync
   เก็บใน memory + localStorage เผื่อ offline

2. ทุก function ที่ write SQLite WASM ให้:
   - write local ก่อนเหมือนเดิม (offline-first ยังอยู่)
   - push op เข้า pendingOps พร้อม field_updated_at: now ISO

3. สร้าง SyncManager.flush():
   - เรียก PATCH /api/sync/patch ด้วย pendingOps ที่มีอยู่
   - ถ้า ok → clear pendingOps ที่ส่งไปแล้ว, update local version
   - ถ้า 409 → GET /api/sync/version เพื่ออัปเดต base_version แล้ว retry
   - ถ้า offline → เก็บไว้ใน localStorage รอ online

4. เรียก flush():
   - ทุก 3 วินาที (debounce)
   - ทันทีเมื่อ user กด save หรือปิด tab (beforeunload)
   - ทันทีเมื่อ network กลับมา (online event)

5. POST /api/sync/upload ยังเก็บไว้ใช้สำหรับ:
   - first-time sync ครั้งแรก
   - restore จาก backup file