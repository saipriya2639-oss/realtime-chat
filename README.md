To Run :

1. Clone the repo

git clone <your-repo-url> realtime-chat
cd realtime-chat

2. Backend setup 
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

2.1 Edit env variable
  DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/chatapp
  CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174

2.2 rerun backend
  uvicorn app.main:app --reload --port 8001

3. Frontend - runs on http://localhost:5174/
cd ../frontend
npm install
npm run dev


Running with Docker
1. Build & start

docker compose up --build

This will start:

PostgreSQL at port 5432

FastAPI backend at http://localhost:8001
