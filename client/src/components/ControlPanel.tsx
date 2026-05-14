import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check as checkUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { emit, listen } from "@tauri-apps/api/event";
import {
  getAllWindows,
  primaryMonitor,
  LogicalPosition,
  LogicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { useSessionStore } from "../store/session";
import LanguageSelector from "./LanguageSelector";
import History from "./History";
import Settings from "./Settings";
import type { CaptionEvent } from "../types";

const OVERLAY_POS_KEY = "lingua_overlay_pos";
const HOTKEY = "CommandOrControl+Shift+L";

type Tab = "live" | "history";

const C = {
  bg:        "#0f0e0c",
  surface:   "#1a1715",
  surfaceHi: "#242018",
  border:    "#2e2924",
  accent:    "#c8923a",
  accentDim: "#9a6e28",
  text:      "#e8dcc8",
  textSec:   "#9a8e80",
  textMuted: "#4a4438",
  green:     "#5c8060",
  rust:      "#934535",
};

const BAR_COUNT = 9;
const BAR_DELAYS = Array.from({ length: BAR_COUNT }, (_, i) =>
  `${(i * 0.09).toFixed(2)}s`
);

function Waveform({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 28 }}>
      {BAR_DELAYS.map((delay, i) => (
        <div
          key={i}
          className={active ? "wave-bar wave-bar--active" : "wave-bar"}
          style={{ animationDelay: delay }}
        />
      ))}
    </div>
  );
}

export default function ControlPanel() {
  const { status, caption, partialCaption, detectedLanguage, targetLanguage } =
    useSessionStore();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("live");
  const [overlayMoving, setOverlayMoving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [updating, setUpdating] = useState(false);
  const overlayMovingRef = useRef(false);
  const captionKey = useRef(0);
  const prevCaption = useRef<string | null>(null);
  const statusRef = useRef(status);
  const targetLanguageRef = useRef(targetLanguage);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { targetLanguageRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { overlayMovingRef.current = overlayMoving; }, [overlayMoving]);

  const isActive = status === "active";
  const displayText = partialCaption ?? caption?.original ?? null;

  // Increment key when a new final caption arrives (triggers fade-in)
  if (caption?.original !== prevCaption.current) {
    prevCaption.current = caption?.original ?? null;
    captionKey.current += 1;
  }

  // Check for updates on launch (silent — only shows banner if one is available)
  useEffect(() => {
    checkUpdate().then((u) => { if (u) setPendingUpdate(u); }).catch(() => {});
  }, []);

  // Auto-open settings on first launch (no Deepgram key stored)
  useEffect(() => {
    invoke<{ deepgram_api_key: string }>("get_settings").then((k) => {
      if (!k.deepgram_api_key) setShowSettings(true);
    }).catch(() => {});
  }, []);

  // Global hotkey: Cmd+Shift+L toggles captions from any app
  useEffect(() => {
    register(HOTKEY, () => {
      if (statusRef.current === "active") {
        handleStop();
      } else {
        handleStart();
      }
    }).catch((e) => console.error("[hotkey] register failed:", e));
    return () => { unregister(HOTKEY).catch(() => {}); };
  }, []);

  useEffect(() => {
    const unlisteners = [
      listen<CaptionEvent>("caption", (event) => {
        const { partial, original, translated } = event.payload;
        const store = useSessionStore.getState();
        if (partial) {
          store.setPartialCaption(partial);
        } else if (original) {
          store.setCaption({ original, translated: translated ?? null });
          store.setPartialCaption(null);
        }
      }),
      listen<string>("session_status", (event) => {
        useSessionStore.getState().setStatus(
          event.payload === "active" ? "active" : "idle"
        );
      }),
      listen<string>("session_error", (event) => {
        setError(event.payload);
        useSessionStore.getState().setStatus("idle");
      }),
    ];
    return () => { unlisteners.forEach((p) => p.then((fn) => fn())); };
  }, []);

  const handleStart = async () => {
    setError(null);
    try {
      const wins = await getAllWindows();
      const overlay = wins.find((w) => w.label === "overlay");
      if (overlay) {
        const saved = localStorage.getItem(OVERLAY_POS_KEY);
        if (saved) {
          try {
            const { x, y, w, h } = JSON.parse(saved);
            const monitor = await primaryMonitor();
            const scale = monitor?.scaleFactor ?? 1;
            await overlay.setSize(new LogicalSize(w / scale, h / scale));
            await overlay.setPosition(new PhysicalPosition(x, y));
          } catch {
            // fall through to default positioning
          }
        }
        if (!saved) {
          const monitor = await primaryMonitor();
          if (monitor) {
            const scale = monitor.scaleFactor;
            const logW = monitor.size.width / scale;
            const logH = monitor.size.height / scale;
            const overlayH = 160;
            const marginBottom = 40;
            await overlay.setSize(new LogicalSize(logW, overlayH));
            await overlay.setPosition(new LogicalPosition(0, logH - overlayH - marginBottom));
          }
        }
        await overlay.setIgnoreCursorEvents(true);
        await overlay.show();
      }
      await invoke("start_capture", { targetLanguage: targetLanguageRef.current });
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStop = async () => {
    await invoke("stop_capture");
    useSessionStore.getState().setStatus("idle");
    useSessionStore.getState().setPartialCaption(null);
    const wins = await getAllWindows();
    const overlay = wins.find((w) => w.label === "overlay");
    if (overlay) {
      // Exit drag mode if active before hiding
      if (overlayMovingRef.current) {
        setOverlayMoving(false);
        await emit("overlay_drag_mode", { enabled: false });
        await overlay.setIgnoreCursorEvents(true);
      }
      await overlay.hide();
    }
  };

  const toggleOverlayMove = async () => {
    const wins = await getAllWindows();
    const overlay = wins.find((w) => w.label === "overlay");
    if (!overlay) return;
    const entering = !overlayMoving;
    setOverlayMoving(entering);
    await emit("overlay_drag_mode", { enabled: entering });
    // Overlay.tsx handles setIgnoreCursorEvents on itself via the event
  };

  return (
    <div style={{
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      background: C.bg,
      color: C.text,
      minHeight: "100vh",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Update banner */}
      {pendingUpdate && (
        <div style={{
          background: `${C.accent}18`,
          borderBottom: `1px solid ${C.accent}44`,
          padding: "10px 28px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <span style={{ fontSize: 12, color: C.accent }}>
            Update {pendingUpdate.version} available
          </span>
          <button
            onClick={async () => {
              setUpdating(true);
              await pendingUpdate.downloadAndInstall();
              await relaunch();
            }}
            disabled={updating}
            style={{
              background: C.accent,
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "5px 12px",
              cursor: updating ? "default" : "pointer",
              opacity: updating ? 0.7 : 1,
              letterSpacing: 0.3,
            }}
          >
            {updating ? "Installing…" : "Install & restart"}
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "28px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          {/* Status dot + pulse ring */}
          <div style={{ position: "relative", width: 8, height: 8, flexShrink: 0 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: isActive ? C.green : C.textMuted,
              transition: "background 0.4s",
            }} />
            {isActive && <div className="pulse-ring" />}
          </div>

          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: -0.5, color: C.text }}>
            Lingua
          </h1>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <Waveform active={isActive} />
            <button
              onClick={() => setShowSettings((s) => !s)}
              title="Settings"
              style={{
                background: showSettings ? `${C.accent}22` : "none",
                border: "none",
                color: showSettings ? C.accent : C.textMuted,
                cursor: "pointer",
                fontSize: 16,
                padding: "2px 4px",
                borderRadius: 6,
                lineHeight: 1,
                transition: "color 0.2s, background 0.2s",
              }}
            >
              ⚙
            </button>
          </div>
        </div>

        <p style={{ margin: "0 0 24px 20px", fontSize: 11, color: C.textMuted, letterSpacing: 0.3 }}>
          Real-time translated captions
        </p>

        {/* Tabs with sliding indicator */}
        <div style={{
          position: "relative",
          display: "flex",
          marginBottom: 24,
          background: C.surface,
          borderRadius: 10,
          padding: 4,
          border: `1px solid ${C.border}`,
        }}>
          <div className={`tab-indicator${tab === "history" ? " tab-indicator--history" : ""}`} />
          {(["live", "history"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "7px 0",
                borderRadius: 7,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                background: "transparent",
                color: tab === t ? C.accent : C.textMuted,
                transition: "color 0.2s",
                position: "relative",
                zIndex: 1,
                letterSpacing: 0.2,
              }}
            >
              {t === "live" ? "Live" : "History"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "0 28px 28px", flex: 1, overflowY: "auto" }}>
        {showSettings ? (
          <Settings
            onBack={() => setShowSettings(false)}
            onSaved={() => setShowSettings(false)}
          />
        ) : tab === "live" ? (
          <>
            <LanguageSelector />

            <button
              onClick={isActive ? handleStop : handleStart}
              style={{
                width: "100%",
                padding: "13px 0",
                fontSize: 15,
                fontWeight: 700,
                borderRadius: 10,
                border: "none",
                background: isActive ? C.rust : C.green,
                color: "#fff",
                cursor: "pointer",
                marginBottom: 24,
                letterSpacing: 0.4,
                boxShadow: isActive
                  ? `0 4px 20px ${C.rust}44`
                  : `0 4px 20px ${C.green}44`,
                transition: "background 0.25s, box-shadow 0.25s",
              }}
            >
              {isActive ? "⏹  Stop Captions" : "▶  Start Captions"}
            </button>

            {error && (
              <div style={{
                background: "#2a1210", border: `1px solid ${C.rust}55`,
                borderRadius: 8, padding: "10px 14px",
                color: "#d07060", fontSize: 13, marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            {/* Caption box */}
            <div
              className={isActive ? "caption-box caption-box--active" : "caption-box"}
              style={{
                borderRadius: 12,
                background: C.surface,
                border: `1px solid ${C.border}`,
                padding: "18px 20px",
                minHeight: 130,
                fontSize: 15,
                lineHeight: 1.65,
              }}
            >
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                color: C.textMuted, marginBottom: 12,
                textTransform: "uppercase", display: "flex",
                alignItems: "center", gap: 6,
              }}>
                {isActive && (
                  <span style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: C.green, display: "inline-block",
                    boxShadow: `0 0 6px ${C.green}`,
                  }} />
                )}
                Live Preview
              </div>

              {!isActive && !displayText && (
                <span style={{ color: C.textMuted, fontSize: 14 }}>
                  Captions will appear here…
                </span>
              )}
              {isActive && !displayText && (
                <span style={{ color: C.textSec, fontSize: 14 }}>Listening…</span>
              )}
              {/* Previous final (dimmed) while next sentence builds */}
              {partialCaption && prevCaption.current && (
                <div style={{ color: C.textSec, fontSize: 14, opacity: 0.55, marginBottom: 10 }}>
                  {prevCaption.current}
                </div>
              )}
              {displayText && (
                <>
                  <div
                    key={`orig-${captionKey.current}`}
                    className={partialCaption ? undefined : "caption-in"}
                    style={{ color: C.text, fontSize: 15 }}
                  >
                    {displayText}
                  </div>
                  {caption?.translated && !partialCaption && (
                    <div
                      key={`trans-${captionKey.current}`}
                      className="caption-in"
                      style={{
                        color: C.accent, marginTop: 10, fontSize: 14,
                        paddingTop: 10, borderTop: `1px solid ${C.border}`,
                        animationDelay: "0.05s",
                      }}
                    >
                      {caption.translated}
                    </div>
                  )}
                </>
              )}
            </div>

            {isActive && (
              <button
                onClick={toggleOverlayMove}
                style={{
                  marginTop: 14,
                  width: "100%",
                  padding: "9px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: `1px solid ${overlayMoving ? C.accent : C.border}`,
                  background: overlayMoving ? `${C.accent}18` : "transparent",
                  color: overlayMoving ? C.accent : C.textSec,
                  cursor: "pointer",
                  letterSpacing: 0.3,
                  transition: "background 0.2s, color 0.2s, border-color 0.2s",
                }}
              >
                {overlayMoving ? "✓  Done moving" : "⠿  Move overlay"}
              </button>
            )}

            {detectedLanguage && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.accentDim }} />
                <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>
                  Detected: <span style={{ color: C.textSec }}>{detectedLanguage}</span>
                </p>
              </div>
            )}
          </>
        ) : (
          <History />
        )}
      </div>
    </div>
  );
}
