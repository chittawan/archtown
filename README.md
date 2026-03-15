<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/34bdcd76-7a05-46aa-a937-69d0f7e08133

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run with Docker

```bash
docker compose up --build
# หรือ: docker build -t archtown . && docker run -p 80:80 -v "$(pwd)/data:/app/data" archtown
```

ถ้าแอปแสดง **「หน่วยความจำ (รีเฟรชแล้วหาย)」** — SQLite เก็บในเบราว์เซอร์ ไม่ได้อยู่บน server ดูสาเหตุและแนวทางแก้ใน [docs/DOCKER_AND_SQLITE.md](docs/DOCKER_AND_SQLITE.md)

## Task ปรับปรุงระบบ

รายการ Task แก้ข้อบกพร่องและปรับปรุงระบบอยู่ใน [TASKS.md](TASKS.md)
