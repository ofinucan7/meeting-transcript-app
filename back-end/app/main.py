import os
from dotenv import load_dotenv
from pathlib import Path

if not os.getenv("RAILWAY_ENVIRONMENT"):
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import auth, tasks, workspaces, invites
from .routers.meetings import router as meetings_router
from .routers.extractions import router as extractions_router

app = FastAPI()

env_origins = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
allow_origins = [o.strip() for o in env_origins.split(",") if o.strip()]

for o in ["http://localhost:5173", "http://127.0.0.1:5173"]:
    if o not in allow_origins:
        allow_origins.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(tasks.router)
app.include_router(meetings_router)
app.include_router(invites.router)
app.include_router(extractions_router)

@app.get("/health")
async def health():
    return {"ok": True}
