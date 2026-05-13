import asyncio
import json
import time
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.services.speech.deepgram_client import DeepgramSTTService
from app.services.translation.deepl_client import DeepLTranslationService
from app.services.storage import db
from app.services.ai import summarizer

_THROTTLE_S = 0.35
_TRAIL_DEBOUNCE_S = 0.18
_MAX_CAPTION_WORDS = 12


async def _finalize_session(session_id: int, transcript: str, transcript_translated: str | None, detected_language: str | None, target_lang: str, start_mono: float) -> None:
    ended_at = datetime.now(timezone.utc).isoformat()
    word_count = len(transcript.split()) if transcript else 0
    duration = time.monotonic() - start_mono

    await db.update_session(
        session_id,
        ended_at=ended_at,
        source_language=detected_language,
        transcript=transcript,
        transcript_translated=transcript_translated,
        word_count=word_count,
        duration_seconds=round(duration, 1),
    )
    print(f"[session] saved id={session_id} words={word_count} translated_words={len(transcript_translated.split()) if transcript_translated else 0} duration={duration:.1f}s")

    if transcript and settings.openai_api_key:
        asyncio.create_task(_generate_summary(session_id, transcript, target_lang))


async def _generate_summary(session_id: int, transcript: str, target_lang: str = "en") -> None:
    try:
        is_english = target_lang.lower().startswith("en")
        result = await summarizer.summarize(transcript, settings.openai_api_key, target_lang)
        updates: dict = {
            "title": result.get("title"),
            "summary": result.get("summary"),
            "key_points": json.dumps(result.get("key_points", [])),
        }
        if is_english:
            updates["title_en"] = result.get("title")
            updates["summary_en"] = result.get("summary")
            updates["key_points_en"] = json.dumps(result.get("key_points", []))
        else:
            en = await summarizer.summarize(transcript, settings.openai_api_key, "en")
            updates["title_en"] = en.get("title")
            updates["summary_en"] = en.get("summary")
            updates["key_points_en"] = json.dumps(en.get("key_points", []))
        await db.update_session(session_id, **updates)
        print(f"[session] summary ready for id={session_id}: {result.get('title')}")
    except Exception as e:
        print(f"[session] summary failed for id={session_id}: {e}")


async def caption_ws(websocket: WebSocket) -> None:
    await websocket.accept()

    stt = DeepgramSTTService(settings.deepgram_api_key)
    translation = DeepLTranslationService(settings.deepl_api_key) if settings.deepl_api_key else None

    session_active = False
    target_language = "en"
    detected_language: str | None = None

    # Session tracking
    session_id: int | None = None
    transcript_finals: list[str] = []
    transcript_translated_finals: list[str] = []
    session_start_mono: float = 0.0

    partial_translate_task: asyncio.Task | None = None
    last_translate_time: float = 0.0
    translate_gen: int = 0
    last_sent_translated: str = ""

    async def _emit_final(text: str, lang: str | None) -> None:
        nonlocal partial_translate_task, last_translate_time, translate_gen, last_sent_translated
        if partial_translate_task and not partial_translate_task.done():
            partial_translate_task.cancel()
        translate_gen += 1

        translated: str | None = None
        if translation:
            translated = await translation.translate(text, target_language, source_lang=None)

        print(f"  [FINAL  ] {text}" + (f" → {translated}" if translated else ""))

        transcript_finals.append(text)
        if translated:
            transcript_translated_finals.append(translated)

        if translated:
            last_sent_translated = translated
        last_translate_time = time.monotonic()

        payload: dict = {"type": "caption_final", "original_text": text}
        if translated:
            payload["translated_text"] = translated
        if lang:
            payload["detected_language"] = lang
        await websocket.send_json(payload)

    async def _schedule_translate(text: str) -> None:
        nonlocal partial_translate_task, last_translate_time, translate_gen, last_sent_translated

        if partial_translate_task and not partial_translate_task.done():
            partial_translate_task.cancel()

        translate_gen += 1
        gen = translate_gen
        elapsed = time.monotonic() - last_translate_time
        delay = 0.05 if elapsed >= _THROTTLE_S else _TRAIL_DEBOUNCE_S

        async def _run(snapshot: str) -> None:
            nonlocal last_translate_time, last_sent_translated
            try:
                await asyncio.sleep(delay)
                if gen != translate_gen:
                    return
                last_translate_time = time.monotonic()
                result = await translation.translate(snapshot, target_language, source_lang=None)
                if gen != translate_gen:
                    return
                if result == last_sent_translated:
                    return
                last_sent_translated = result
                print(f"  [partial→] {result}")
                await websocket.send_json({
                    "type": "caption_partial",
                    "original_text": snapshot,
                    "translated_text": result,
                })
            except asyncio.CancelledError:
                pass

        partial_translate_task = asyncio.create_task(_run(text))

    async def on_transcript(text: str, is_final: bool, lang: str | None) -> None:
        nonlocal detected_language

        if lang and not detected_language:
            detected_language = lang
            print(f"[lang] detected: {lang}")
            await websocket.send_json({"type": "language_detected", "language": lang})

        if is_final:
            print(f"  [final  ] {text}")
            words = text.split()
            if len(words) > _MAX_CAPTION_WORDS:
                # Chunk long sentence so overlay stays readable
                for i in range(0, len(words), _MAX_CAPTION_WORDS):
                    await _emit_final(" ".join(words[i:i + _MAX_CAPTION_WORDS]), lang)
            else:
                await _emit_final(text, lang)
        else:
            await websocket.send_json({
                "type": "caption_partial",
                "original_text": text,
            })
            if translation:
                await _schedule_translate(text)

    try:
        while True:
            msg = await websocket.receive()

            if msg.get("type") == "websocket.disconnect":
                break

            if "text" in msg:
                data = json.loads(msg["text"])
                event = data.get("type")

                if event == "session_start" and not session_active:
                    target_language = data.get("target_language", "en")
                    last_translate_time = 0.0
                    translate_gen = 0
                    last_sent_translated = ""
                    transcript_finals.clear()
                    transcript_translated_finals.clear()
                    session_start_mono = time.monotonic()
                    session_id = await db.create_session(
                        datetime.now(timezone.utc).isoformat(),
                        target_language,
                    )
                    print(f"[session] start — target={target_language} db_id={session_id}")
                    await stt.start(on_transcript)
                    session_active = True
                    await websocket.send_json({"type": "session_started"})

                elif event == "session_stop":
                    break

                elif event == "update_target_language":
                    target_language = data.get("target_language", target_language)
                    print(f"[session] target language updated → {target_language}")

            elif "bytes" in msg:
                if session_active:
                    await stt.send(msg["bytes"])

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        print(f"[error] {exc}")
        try:
            await websocket.send_json({"type": "error", "code": "internal", "message": str(exc)})
        except Exception:
            pass
    finally:
        if partial_translate_task and not partial_translate_task.done():
            partial_translate_task.cancel()
        if session_active:
            await stt.stop()
        if session_id is not None:
            await _finalize_session(
                session_id,
                " ".join(transcript_finals),
                " ".join(transcript_translated_finals) or None,
                detected_language,
                target_language,
                session_start_mono,
            )
        print("[session] ended")
