"""
Test: stream a WAV file to the Lingua backend and print transcripts + translations.

WAV requirements: PCM 16-bit, 16kHz, mono.
Convert any audio with ffmpeg:
  ffmpeg -i input.mp4 -ar 16000 -ac 1 -sample_fmt s16 test.wav

Usage:
  python scripts/test_wav.py path/to/audio.wav [target_language]
  python scripts/test_wav.py test16k.wav es
"""

import asyncio
import json
import sys
import wave

import websockets

WS_URL = "ws://localhost:8000/ws/caption"
CHUNK_DURATION_S = 0.25


async def stream_wav(wav_path: str, target_language: str = "en") -> None:
    async with websockets.connect(WS_URL) as ws:
        await ws.send(json.dumps({"type": "session_start", "target_language": target_language}))
        print(f"[test] connected — streaming {wav_path}")

        with wave.open(wav_path, "rb") as wf:
            ch, width, rate = wf.getnchannels(), wf.getsampwidth(), wf.getframerate()
            print(f"[test] WAV: {ch}ch  {rate}Hz  {width * 8}bit")
            if ch != 1 or rate != 16000 or width != 2:
                print("[warn] expected mono / 16kHz / 16-bit — results may degrade")

            frames_per_chunk = int(rate * CHUNK_DURATION_S)

            async def recv_loop():
                async for raw in ws:
                    data = json.loads(raw)
                    t = data.get("type", "")
                    if t == "session_started":
                        print("[test] session confirmed by server")
                    elif t in ("caption_partial", "caption_final"):
                        label = "FINAL  " if t == "caption_final" else "partial"
                        lang = data.get("detected_language", "")
                        lang_tag = f" [{lang}]" if lang else ""
                        original = data.get("original_text", "")
                        translated = data.get("translated_text", "")
                        suffix = f" → {translated}" if translated else ""
                        print(f"  [{label}]{lang_tag} {original}{suffix}")
                    elif t == "language_detected":
                        print(f"  [lang detected] {data.get('language')}")
                    elif t == "error":
                        print(f"  [ERROR] {data.get('message')}")

            recv_task = asyncio.create_task(recv_loop())

            while True:
                frames = wf.readframes(frames_per_chunk)
                if not frames:
                    break
                await ws.send(frames)
                await asyncio.sleep(CHUNK_DURATION_S)

            print("[test] stream complete — waiting for finals...")
            await asyncio.sleep(3)
            await ws.send(json.dumps({"type": "session_stop"}))
            await asyncio.sleep(1)
            recv_task.cancel()
            print("[test] done")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    target = sys.argv[2] if len(sys.argv) > 2 else "en"
    asyncio.run(stream_wav(sys.argv[1], target))
