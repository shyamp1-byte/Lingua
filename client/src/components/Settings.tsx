import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const C = {
  bg:        "#0f0e0c",
  surface:   "#1a1715",
  border:    "#2e2924",
  accent:    "#c8923a",
  accentDim: "#9a6e28",
  text:      "#e8dcc8",
  textSec:   "#9a8e80",
  textMuted: "#4a4438",
  green:     "#5c8060",
  rust:      "#934535",
};

interface ApiKeys {
  deepgram_api_key: string;
  deepl_api_key: string;
  openai_api_key: string;
}

interface Props {
  onBack: () => void;
  onSaved: () => void;
}

const FIELDS: { key: keyof ApiKeys; label: string; hint: string }[] = [
  {
    key: "deepgram_api_key",
    label: "Deepgram API Key",
    hint: "Required — speech-to-text transcription",
  },
  {
    key: "deepl_api_key",
    label: "DeepL API Key",
    hint: "Required — real-time translation",
  },
  {
    key: "openai_api_key",
    label: "OpenAI API Key",
    hint: "Optional — session summaries in History",
  },
];

export default function Settings({ onBack, onSaved }: Props) {
  const [keys, setKeys] = useState<ApiKeys>({
    deepgram_api_key: "",
    deepl_api_key: "",
    openai_api_key: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Record<keyof ApiKeys, boolean>>({
    deepgram_api_key: false,
    deepl_api_key: false,
    openai_api_key: false,
  });

  useEffect(() => {
    invoke<ApiKeys>("get_settings").then(setKeys).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!keys.deepgram_api_key.trim() || !keys.deepl_api_key.trim()) {
      setError("Deepgram and DeepL keys are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await invoke("save_settings", { keys });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onSaved();
      }, 800);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const isSet = (val: string) => val.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: C.textSec,
          cursor: "pointer",
          fontSize: 13,
          padding: "0 0 20px",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        ← Back
      </button>

      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>
        API Keys
      </div>
      <p style={{ fontSize: 12, color: C.textMuted, margin: "0 0 24px", lineHeight: 1.6 }}>
        Keys are stored locally at <span style={{ color: C.textSec }}>~/.lingua/settings.json</span> and
        never leave your machine.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 6,
            }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec, letterSpacing: 0.3 }}>
                {label}
              </label>
              {isSet(keys[key]) && (
                <span style={{ fontSize: 10, color: C.green, letterSpacing: 0.5 }}>● SET</span>
              )}
            </div>
            <div style={{ position: "relative" }}>
              <input
                type={show[key] ? "text" : "password"}
                value={keys[key]}
                onChange={(e) => setKeys((k) => ({ ...k, [key]: e.target.value }))}
                placeholder="Paste key here…"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 40px 10px 12px",
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.text,
                  fontSize: 13,
                  fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button
                onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
                style={{
                  position: "absolute", right: 10, top: "50%",
                  transform: "translateY(-50%)",
                  background: "none", border: "none",
                  color: C.textMuted, cursor: "pointer", fontSize: 13,
                }}
              >
                {show[key] ? "🙈" : "👁"}
              </button>
            </div>
            <p style={{ margin: "5px 0 0", fontSize: 11, color: C.textMuted }}>{hint}</p>
          </div>
        ))}
      </div>

      {error && (
        <div style={{
          marginTop: 16, background: "#2a1210",
          border: `1px solid ${C.rust}55`, borderRadius: 8,
          padding: "10px 14px", color: "#d07060", fontSize: 13,
        }}>
          {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || saved}
        style={{
          marginTop: 24,
          width: "100%",
          padding: "12px 0",
          fontSize: 14,
          fontWeight: 700,
          borderRadius: 10,
          border: "none",
          background: saved ? C.green : C.accent,
          color: "#fff",
          cursor: saving || saved ? "default" : "pointer",
          letterSpacing: 0.4,
          transition: "background 0.2s",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saved ? "✓  Saved" : saving ? "Saving…" : "Save & start server"}
      </button>
    </div>
  );
}
