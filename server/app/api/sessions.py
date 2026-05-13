import json
import asyncio

from fastapi import APIRouter, HTTPException

from app.services.storage import db
from app.services.ai import summarizer
from app.services.translation.deepl_client import DeepLTranslationService
from app.core.config import settings

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/dates")
async def session_dates() -> list[str]:
    return await db.get_session_dates()


@router.get("")
async def list_sessions(date: str | None = None) -> list[dict]:
    return await db.get_sessions(date)


@router.get("/{session_id}")
async def get_session(session_id: int) -> dict:
    session = await db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/{session_id}/regenerate")
async def regenerate_session(session_id: int) -> dict:
    session = await db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    transcript = session.get("transcript") or ""
    target_lang = session.get("target_language") or "en"
    updates: dict = {}

    # Translate transcript if missing
    if transcript and not session.get("transcript_translated") and settings.deepl_api_key:
        translation = DeepLTranslationService(settings.deepl_api_key)
        translated = await translation.translate(transcript, target_lang, source_lang=None)
        if translated:
            updates["transcript_translated"] = translated

    # Regenerate AI summary in target language + English
    if transcript and settings.openai_api_key:
        try:
            is_english = target_lang.lower().startswith("en")
            result = await summarizer.summarize(transcript, settings.openai_api_key, target_lang)
            updates["title"] = result.get("title")
            updates["summary"] = result.get("summary")
            updates["key_points"] = json.dumps(result.get("key_points", []))
            if is_english:
                updates["title_en"] = result.get("title")
                updates["summary_en"] = result.get("summary")
                updates["key_points_en"] = json.dumps(result.get("key_points", []))
            else:
                en = await summarizer.summarize(transcript, settings.openai_api_key, "en")
                updates["title_en"] = en.get("title")
                updates["summary_en"] = en.get("summary")
                updates["key_points_en"] = json.dumps(en.get("key_points", []))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI summarization failed: {e}")

    if updates:
        await db.update_session(session_id, **updates)

    return await db.get_session(session_id)
