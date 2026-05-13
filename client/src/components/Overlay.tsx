import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { CaptionEvent } from "../types";

const HIDE_AFTER_MS = 2500;

export default function Overlay() {
  const [mainText, setMainText] = useState<string | null>(null);
  const [subText, setSubText] = useState<string | null>(null);

  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWasPartial = useRef(false);

  const bump = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setMainText(null);
      setSubText(null);
      lastWasPartial.current = false;
    }, HIDE_AFTER_MS);
  };

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<CaptionEvent>("caption", (event) => {
      const { partial, original, translated } = event.payload;
      bump();

      if (partial != null) {
        lastWasPartial.current = true;
        setSubText(partial);
        if (translated != null) setMainText(translated);
      } else if (original != null) {
        lastWasPartial.current = false;
        setSubText(original);
        setMainText((prev) => (prev == null && translated != null ? translated : prev));
      }
    }).then((fn) => { unlisten = fn; });

    return () => unlisten?.();
  }, []);

  if (!mainText && !subText) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        padding: "0 48px 20px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          background: "rgba(6, 4, 14, 0.84)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderRadius: 18,
          padding: "12px 32px 15px",
          maxWidth: 920,
          width: "fit-content",
          textAlign: "center",
        }}
      >
        {mainText && (
          <div
            style={{
              fontFamily: '"SF Pro Display", system-ui, -apple-system, sans-serif',
              fontSize: 25,
              fontWeight: 700,
              lineHeight: 1.3,
              letterSpacing: -0.4,
              color: "#FFD93D",
              textShadow: "0 0 20px rgba(255,217,61,0.25)",
            }}
          >
            {mainText}
          </div>
        )}
        {subText && (
          <div
            style={{
              color: "rgba(255,255,255,0.48)",
              fontSize: 13,
              lineHeight: 1.45,
              marginTop: mainText ? 5 : 0,
              fontFamily: '"SF Pro Text", system-ui, -apple-system, sans-serif',
              letterSpacing: 0.15,
            }}
          >
            {subText}
          </div>
        )}
      </div>
    </div>
  );
}
