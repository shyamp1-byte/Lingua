import asyncio
import json
import ssl
from typing import Callable, Awaitable
from urllib.parse import urlencode

import certifi
import websockets

DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"

OnTranscript = Callable[[str, bool, str | None], Awaitable[None]]


class DeepgramSTTService:
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self._session_task: asyncio.Task | None = None

    async def start(self, on_transcript: OnTranscript) -> None:
        self._session_task = asyncio.create_task(self._run_session(on_transcript))

    async def send(self, chunk: bytes) -> None:
        await self._audio_queue.put(chunk)

    async def stop(self) -> None:
        await self._audio_queue.put(None)
        if self._session_task:
            try:
                await self._session_task
            except Exception as e:
                print(f"[deepgram] session ended with error: {e}")

    async def _run_session(self, on_transcript: OnTranscript) -> None:
        params = urlencode({
            "model": "nova-3",
            "encoding": "linear16",
            "sample_rate": "16000",
            "interim_results": "true",
            "punctuate": "true",
            "smart_format": "true",
            "endpointing": "300",
            "no_delay": "true",
        })
        url = f"{DEEPGRAM_WS_URL}?{params}"
        headers = {"Authorization": f"Token {self._api_key}"}
        ssl_ctx = ssl.create_default_context(cafile=certifi.where())
        print(f"[deepgram] connecting: {url}")

        async with websockets.connect(url, additional_headers=headers, ssl=ssl_ctx) as ws:
            print("[deepgram] connected")
            sender = asyncio.create_task(self._sender(ws))
            receiver = asyncio.create_task(self._receiver(ws, on_transcript))
            await asyncio.gather(sender, receiver, return_exceptions=True)
            print("[deepgram] session complete")

    async def _sender(self, ws) -> None:
        while True:
            chunk = await self._audio_queue.get()
            if chunk is None:
                await ws.send(json.dumps({"type": "CloseStream"}))
                return
            await ws.send(chunk)

    async def _receiver(self, ws, on_transcript: OnTranscript) -> None:
        async for raw in ws:
            if isinstance(raw, bytes):
                continue
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if msg.get("type") != "Results":
                continue
            alts = msg.get("channel", {}).get("alternatives", [])
            if not alts:
                continue
            transcript = alts[0].get("transcript", "").strip()
            if not transcript:
                continue
            is_final = msg.get("is_final", False)
            langs = alts[0].get("languages", [])
            detected_lang = langs[0] if langs else None
            await on_transcript(transcript, is_final, detected_lang)
