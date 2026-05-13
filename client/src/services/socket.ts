import { emit } from "@tauri-apps/api/event";
import { useSessionStore } from "../store/session";
import type { CaptionEvent } from "../types";

const WS_URL = "ws://localhost:8000/ws/caption";

let ws: WebSocket | null = null;

export function connectWS(targetLanguage: string): void {
  if (ws) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    ws!.send(JSON.stringify({ type: "session_start", target_language: targetLanguage }));
  };

  ws.onmessage = async (event) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(event.data as string);
    } catch {
      return;
    }

    const store = useSessionStore.getState();

    switch (msg.type) {
      case "session_started":
        store.setStatus("active");
        break;

      case "caption_partial": {
        const text = msg.original_text as string;
        store.setPartialCaption(text);
        const payload: CaptionEvent = { partial: text, original: null, translated: null };
        await emit("caption", payload);
        break;
      }

      case "caption_final": {
        const original = msg.original_text as string;
        const translated = (msg.translated_text as string | undefined) ?? null;
        store.setCaption({ original, translated });
        store.setPartialCaption(null);
        if (msg.detected_language) store.setDetectedLanguage(msg.detected_language as string);
        const payload: CaptionEvent = { partial: null, original, translated };
        await emit("caption", payload);
        break;
      }

      case "language_detected":
        store.setDetectedLanguage(msg.language as string);
        break;

      case "error":
        console.error("[ws] server error:", msg.message);
        break;
    }
  };

  ws.onerror = (e) => console.error("[ws] error", e);

  ws.onclose = () => {
    ws = null;
    useSessionStore.getState().setStatus("idle");
  };
}

export function disconnectWS(): void {
  if (!ws) return;
  ws.send(JSON.stringify({ type: "session_stop" }));
  ws.close();
  ws = null;
}

export function sendAudioChunk(chunk: ArrayBuffer): void {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(chunk);
  }
}
