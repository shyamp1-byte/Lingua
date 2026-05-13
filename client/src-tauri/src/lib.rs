use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::Message};

struct CaptureHandle {
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
struct AppState(Mutex<Option<CaptureHandle>>);

#[tauri::command]
async fn start_capture(
    app: AppHandle,
    target_language: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let stop = Arc::new(AtomicBool::new(false));
    {
        let mut guard = state.0.lock().unwrap();
        *guard = Some(CaptureHandle { stop: stop.clone() });
    }

    // Channel: cpal thread → WS sender task (raw PCM bytes at 16 kHz)
    let (audio_tx, mut audio_rx) = mpsc::channel::<Vec<u8>>(64);

    // --- Audio capture thread ---
    let stop_audio = stop.clone();
    std::thread::spawn(move || {
        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                eprintln!("[cpal] no input device");
                return;
            }
        };

        let supported = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[cpal] config error: {e}");
                return;
            }
        };

        let native_sr = supported.sample_rate().0 as f64;
        let channels = supported.channels() as usize;
        let ratio = native_sr / 16_000.0;

        let config = cpal::StreamConfig {
            channels: supported.channels(),
            sample_rate: supported.sample_rate(),
            buffer_size: cpal::BufferSize::Default,
        };

        let stream = device.build_input_stream(
            &config,
            {
                let mut acc = 0.0_f64;
                let mut buf = Vec::<i16>::new();
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    for ch in data.chunks(channels) {
                        let mono = ch.iter().sum::<f32>() / channels as f32;
                        acc += 1.0;
                        if acc >= ratio {
                            acc -= ratio;
                            buf.push((mono.clamp(-1.0, 1.0) * 32_767.0) as i16);
                        }
                    }
                    // Flush ~250 ms worth of 16-kHz samples
                    if buf.len() >= 4_000 {
                        let bytes: Vec<u8> = buf
                            .drain(..)
                            .flat_map(|s| s.to_le_bytes())
                            .collect();
                        let _ = audio_tx.try_send(bytes);
                    }
                }
            },
            |err| eprintln!("[cpal] stream error: {err}"),
            None,
        );

        let stream = match stream {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[cpal] build stream error: {e}");
                return;
            }
        };

        if let Err(e) = stream.play() {
            eprintln!("[cpal] play error: {e}");
            return;
        }

        while !stop_audio.load(Ordering::Relaxed) {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        // stream drops here → capture stops
    });

    // --- WebSocket task ---
    tokio::task::spawn(async move {
        let (ws, _) = match connect_async("ws://127.0.0.1:8000/ws/caption").await {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("[ws] connect failed: {e}");
                let _ = app.emit("session_error", format!("Backend unreachable: {e}"));
                return;
            }
        };

        let (mut write, mut read) = ws.split();

        // Send session_start
        let _ = write
            .send(Message::Text(
                json!({"type": "session_start", "target_language": target_language})
                    .to_string(),
            ))
            .await;

        // Sender subtask: PCM bytes → WS binary frames
        let stop_sender = stop.clone();
        tokio::task::spawn(async move {
            while let Some(bytes) = audio_rx.recv().await {
                if stop_sender.load(Ordering::Relaxed) {
                    break;
                }
                if write.send(Message::Binary(bytes)).await.is_err() {
                    break;
                }
            }
            let _ = write
                .send(Message::Text(
                    json!({"type": "session_stop"}).to_string(),
                ))
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
                                    "translated": val["translated_text"], // null if absent
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
    let guard = state.0.lock().unwrap();
    if let Some(handle) = guard.as_ref() {
        handle.stop.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![start_capture, stop_capture])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
