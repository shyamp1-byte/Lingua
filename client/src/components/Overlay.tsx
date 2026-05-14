import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CaptionEvent } from "../types";

const HIDE_AFTER_MS = 2500;
const OVERLAY_POS_KEY = "lingua_overlay_pos";

export default function Overlay() {
  const [mainText, setMainText] = useState<string | null>(null);
  const [subText, setSubText] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState(false);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const movedUnlisten = useRef<(() => void) | null>(null);

  const bump = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setMainText(null);
      setSubText(null);
    }, HIDE_AFTER_MS);
  };

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  // Caption events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<CaptionEvent>("caption", (event) => {
      const { partial, original, translated } = event.payload;
      bump();
      if (partial != null) {
        setSubText(partial);
        if (translated != null) setMainText(translated);
      } else if (original != null) {
        setSubText(original);
        setMainText((prev) => (prev == null && translated != null ? translated : prev));
      }
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  // Drag mode events from control panel
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ enabled: boolean }>("overlay_drag_mode", async (event) => {
      const entering = event.payload.enabled;
      setDragMode(entering);
      const win = getCurrentWindow();
      await win.setIgnoreCursorEvents(!entering);

      // While in drag mode, track moves and persist position
      if (entering) {
        movedUnlisten.current?.();
        movedUnlisten.current = await win.listen("tauri://move", async () => {
          const pos = await win.outerPosition();
          const size = await win.outerSize();
          localStorage.setItem(
            OVERLAY_POS_KEY,
            JSON.stringify({ x: pos.x, y: pos.y, w: size.width, h: size.height })
          );
        });
      } else {
        movedUnlisten.current?.();
        movedUnlisten.current = null;
      }
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); movedUnlisten.current?.(); };
  }, []);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (!dragMode || e.button !== 0) return;
    await getCurrentWindow().startDragging();
  };

  if (!mainText && !subText && !dragMode) return null;

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        padding: "0 48px 20px",
        pointerEvents: dragMode ? "auto" : "none",
        cursor: dragMode ? "grab" : "default",
        // In drag mode show a full-screen drag target so user can click anywhere
        ...(dragMode && !mainText && !subText ? { top: 0 } : {}),
      }}
    >
      <div
        style={{
          background: dragMode
            ? "rgba(200, 146, 58, 0.18)"
            : "rgba(6, 4, 14, 0.84)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 18,
          padding: "12px 32px 15px",
          maxWidth: 920,
          width: dragMode ? 480 : "fit-content",
          textAlign: "center",
          border: dragMode ? "1.5px dashed rgba(200,146,58,0.6)" : "none",
          transition: "background 0.2s, border 0.2s",
          userSelect: "none",
        }}
      >
        {dragMode && (
          <div style={{
            color: "rgba(200,146,58,0.9)",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.3,
            padding: "8px 0",
            fontFamily: '"SF Pro Text", system-ui, sans-serif',
          }}>
            ⠿ Drag to reposition · click Done in Lingua when finished
          </div>
        )}
        {mainText && (
          <div style={{
            fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
            fontSize: 25,
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: -0.4,
            color: "#FFD93D",
            textShadow: "0 0 20px rgba(255,217,61,0.25)",
          }}>
            {mainText}
          </div>
        )}
        {subText && (
          <div style={{
            color: "rgba(255,255,255,0.48)",
            fontSize: 13,
            lineHeight: 1.45,
            marginTop: mainText ? 5 : 0,
            fontFamily: '"SF Pro Text", system-ui, -apple-system, sans-serif',
            letterSpacing: 0.15,
          }}>
            {subText}
          </div>
        )}
      </div>
    </div>
  );
}
