use futures_util::{SinkExt, StreamExt};
use screencapturekit::{
    cm::CMSampleBuffer,
    prelude::*,
    stream::configuration::audio::{AudioChannelCount, AudioSampleRate},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::{process::CommandChild, ShellExt};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

// ── Settings ───────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Default)]
struct ApiKeys {
    deepgram_api_key: String,
    deepl_api_key: String,
    openai_api_key: String,
}

fn settings_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join(".lingua").join("settings.json")
}

fn read_settings() -> ApiKeys {
    std::fs::read_to_string(settings_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_settings(keys: &ApiKeys) -> Result<(), String> {
    let path = settings_path();
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(path, serde_json::to_string_pretty(keys).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

// ── App state ──────────────────────────────────────────────────────────────

struct CaptureHandle {
    stream: SCStream,
}

#[derive(Default)]
struct AppState {
    capture: Mutex<Option<CaptureHandle>>,
    sidecar: Mutex<Option<CommandChild>>,
}

// ── Sidecar management ─────────────────────────────────────────────────────

async fn spawn_server(app: &AppHandle, keys: &ApiKeys) -> Result<(), String> {
    let (mut rx, child) = app
        .shell()
        .sidecar("lingua-server")
        .map_err(|e| format!("[sidecar] {e}"))?
        .env("DEEPGRAM_API_KEY", &keys.deepgram_api_key)
        .env("DEEPL_API_KEY", &keys.deepl_api_key)
        .env("OPENAI_API_KEY", &keys.openai_api_key)
        .spawn()
        .map_err(|e| format!("[sidecar] spawn: {e}"))?;

    let state = app.state::<AppState>();
    *state.sidecar.lock().unwrap() = Some(child);

    // Drain output events to prevent the channel from blocking
    tauri::async_runtime::spawn(async move {
        while rx.recv().await.is_some() {}
    });

    Ok(())
}

// ── Tauri commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn get_settings() -> ApiKeys {
    read_settings()
}

#[tauri::command]
async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    keys: ApiKeys,
) -> Result<(), String> {
    write_settings(&keys)?;

    // Kill existing sidecar
    if let Some(child) = state.sidecar.lock().unwrap().take() {
        let _ = child.kill();
    }

    // Spawn new sidecar if the Deepgram key is set (minimum required)
    if !keys.deepgram_api_key.is_empty() {
        spawn_server(&app, &keys).await?;
    }

    Ok(())
}

#[tauri::command]
async fn start_capture(
    app: AppHandle,
    target_language: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (audio_tx, mut audio_rx) = mpsc::channel::<Vec<u8>>(64);
    let audio_tx_cb = audio_tx.clone();
    drop(audio_tx);

    // SCShareableContent::get() and stream setup are blocking — run off-thread.
    let stream = tokio::task::spawn_blocking(move || -> Result<SCStream, String> {
        let content = SCShareableContent::get()
            .map_err(|e| format!("[SCKit] get content failed: {e}"))?;

        let displays = content.displays();
        if displays.is_empty() {
            return Err("[SCKit] no displays found".into());
        }

        let filter = SCContentFilter::create()
            .with_display(&displays[0])
            .with_excluding_windows(&[])
            .build();

        let config = SCStreamConfiguration::new()
            .with_captures_audio(true)
            .with_sample_rate(AudioSampleRate::Rate16000)
            .with_channel_count(AudioChannelCount::Mono)
            .with_excludes_current_process_audio(true);

        let mut stream = SCStream::new(&filter, &config);

        // PCM accumulator shared within this serial callback.
        // Mutex satisfies Sync bound; lock is never contended because
        // SCKit serialises audio callbacks.
        let pcm_buf = Mutex::new(Vec::<u8>::new());
        stream.add_output_handler(
            move |sample: CMSampleBuffer, _| {
                let Some(abl) = sample.audio_buffer_list() else {
                    return;
                };
                let mut buf = pcm_buf.lock().unwrap();
                for audio_buf in abl.iter() {
                    let raw = audio_buf.data();
                    if raw.is_empty() {
                        continue;
                    }
                    // SCKit delivers f32 LE; Deepgram expects i16 LE
                    let n = raw.len() / 4;
                    let samples =
                        unsafe { std::slice::from_raw_parts(raw.as_ptr() as *const f32, n) };
                    for &s in samples {
                        let i = (s.clamp(-1.0, 1.0) * 32_767.0) as i16;
                        buf.extend_from_slice(&i.to_le_bytes());
                    }
                }
                // Flush ~250 ms at 16 kHz mono = 4 000 samples × 2 bytes
                if buf.len() >= 8_000 {
                    let chunk: Vec<u8> = buf.drain(..).collect();
                    let _ = audio_tx_cb.try_send(chunk);
                }
            },
            SCStreamOutputType::Audio,
        );

        stream
            .start_capture()
            .map_err(|e| format!("[SCKit] start_capture failed: {e}"))?;

        Ok(stream)
    })
    .await
    .map_err(|e| format!("spawn_blocking panicked: {e}"))??;

    {
        let mut guard = state.capture.lock().unwrap();
        *guard = Some(CaptureHandle { stream });
    }

    // --- WebSocket task ---
    tokio::task::spawn(async move {
        // Retry connecting — the sidecar may need a moment to start up.
        let (ws, _) = {
            let mut last_err = String::from("not started");
            let mut pair = None;
            for _ in 0..12 {
                match connect_async("ws://127.0.0.1:8000/ws/caption").await {
                    Ok(p) => { pair = Some(p); break; }
                    Err(e) => {
                        last_err = e.to_string();
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }
            match pair {
                Some(p) => p,
                None => {
                    let _ = app.emit("session_error", format!("Backend unreachable: {last_err}"));
                    return;
                }
            }
        };

        let (mut write, mut read) = ws.split();

        let _ = write
            .send(Message::Text(
                json!({"type": "session_start", "target_language": target_language}).to_string(),
            ))
            .await;

        // Sender subtask: PCM bytes → WS binary frames
        tokio::task::spawn(async move {
            while let Some(bytes) = audio_rx.recv().await {
                if write.send(Message::Binary(bytes)).await.is_err() {
                    break;
                }
            }
            let _ = write
                .send(Message::Text(json!({"type": "session_stop"}).to_string()))
                .await;
            let _ = write.close().await;
        });

        // Receiver: backend messages → Tauri events
        while let Some(result) = read.next().await {
            match result {
                Ok(Message::Text(text)) => {
                    let Ok(val) = serde_json::from_str::<Value>(&text) else {
                        continue;
                    };
                    match val["type"].as_str() {
                        Some("session_started") => {
                            let _ = app.emit("session_status", "active");
                        }
                        Some("caption_partial") => {
                            let _ = app.emit(
                                "caption",
                                json!({
                                    "partial": val["original_text"],
                                    "original": null,
                                    "translated": val["translated_text"],
                                }),
                            );
                        }
                        Some("caption_final") => {
                            let _ = app.emit(
                                "caption",
                                json!({
                                    "partial": null,
                                    "original": val["original_text"],
                                    "translated": val["translated_text"],
                                }),
                            );
                        }
                        _ => {}
                    }
                }
                Ok(Message::Close(_)) | Err(_) => break,
                _ => {}
            }
        }

        let _ = app.emit("session_status", "idle");
    });

    Ok(())
}

#[tauri::command]
async fn stop_capture(state: State<'_, AppState>) -> Result<(), String> {
    let handle = state.capture.lock().unwrap().take();
    if let Some(h) = handle {
        // stop_capture() blocks; run off-thread to avoid stalling the async executor.
        // When the stream drops, the handler closure drops, audio_tx_cb drops,
        // audio_rx closes, and the WS sender subtask sends session_stop.
        tokio::task::spawn_blocking(move || {
            if let Err(e) = h.stream.stop_capture() {
                eprintln!("[SCKit] stop_capture error: {e}");
            }
        })
        .await
        .ok();
    }
    Ok(())
}

// ── Entry point ────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let keys = read_settings();
            tauri::async_runtime::spawn(async move {
                if !keys.deepgram_api_key.is_empty() {
                    if let Err(e) = spawn_server(&handle, &keys).await {
                        eprintln!("{e}");
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            start_capture,
            stop_capture
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
