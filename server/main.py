import ssl
import certifi

# macOS Python.org installs don't bundle root CAs — patch before any SSL connections
_orig_create_default_context = ssl.create_default_context

def _patched_create_default_context(purpose=ssl.Purpose.SERVER_AUTH, *, cafile=None, capath=None, cadata=None):
    if cafile is None and capath is None and cadata is None:
        cafile = certifi.where()
    return _orig_create_default_context(purpose, cafile=cafile, capath=capath, cadata=cadata)

ssl.create_default_context = _patched_create_default_context

import asyncio
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.api.ws import caption_ws
from app.api.sessions import router as sessions_router
from app.services.storage.db import init_db, get_sessions_without_embeddings, update_session
from app.core.config import settings


async def _backfill_embeddings() -> None:
    if not settings.openai_api_key:
        return
    from app.services.ai.embedder import embed_text
    sessions = await get_sessions_without_embeddings()
    for s in sessions:
        try:
            vec = await embed_text(s["transcript"], settings.openai_api_key)
            await update_session(s["id"], embedding=json.dumps(vec))
            print(f"[backfill] embedded session {s['id']}")
        except Exception as e:
            print(f"[backfill] failed for session {s['id']}: {e}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    asyncio.create_task(_backfill_embeddings())
    yield


app = FastAPI(title="Lingua API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


app.include_router(sessions_router)


@app.websocket("/ws/caption")
async def websocket_endpoint(websocket: WebSocket):
    await caption_ws(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning")
