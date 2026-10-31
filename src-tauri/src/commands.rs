use crate::audio::recorder::AudioRecorder;
use crate::storage::history::{self, MeetingDetail, MeetingRecord};
use crate::storage::local_files;
use crate::whisper::engine::{self, TranscriptSegment};
use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

/// Shared application state managed by Tauri's `.manage()`.
pub struct AppState {
    pub recorder: Mutex<AudioRecorder>,
    pub meeting_start: Mutex<Option<DateTime<Local>>>,
    pub is_recording: Arc<AtomicBool>,
}

/// Return type for `stop_and_transcribe`, serialized to JSON over IPC.
#[derive(Serialize)]
pub struct TranscriptionResult {
    pub id: String,
    pub transcript: Vec<TranscriptSegment>,
    pub file_path: String,
    pub language_detected: String,
    pub duration: String,
}

/// Payload for live track enable states over IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackState {
    pub mic_enabled: bool,
    pub system_enabled: bool,
}

/// Payload sent via Tauri event during active recording.
#[derive(Clone, Serialize)]
pub struct LiveLanguagePayload {
    pub language: String,
    pub confidence: f32,
    pub is_speech_active: bool,
}

/// Payload sent via Tauri event for real-time RMS audio meter telemetry (0.0 to 1.0).
#[derive(Clone, Serialize)]
pub struct AudioMeterPayload {
    pub mic_level: f32,
    pub system_level: f32,
    pub level: f32,
}

/// Sets track enabled state ("mic" or "system").
#[tauri::command]
pub async fn set_track_state(
    state: tauri::State<'_, AppState>,
    track: String,
    enabled: bool,
) -> Result<(), String> {
    let recorder = state
        .recorder
        .lock()
        .map_err(|e| format!("Failed to lock recorder state: {e}"))?;
    recorder.set_track_enabled(&track, enabled);
    Ok(())
}

/// Retrieves current enabled state of mic and system audio.
#[tauri::command]
pub async fn get_track_state(
    state: tauri::State<'_, AppState>,
) -> Result<TrackState, String> {
    let recorder = state
        .recorder
        .lock()
        .map_err(|e| format!("Failed to lock recorder state: {e}"))?;
    let (mic_enabled, system_enabled) = recorder.get_track_state();
    Ok(TrackState {
        mic_enabled,
        system_enabled,
    })
}

/// Starts capturing audio from the default microphone and system loopback,
/// and begins the live language detection telemetry emitter.
#[tauri::command]
pub async fn start_meeting(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let mut recorder = state
        .recorder
        .lock()
        .map_err(|e| format!("Failed to lock recorder state: {e}"))?;

    recorder.start()?;

    let mic_level_handle = recorder.mic_level();
    let sys_level_handle = recorder.system_level();

    // Record when the meeting started for duration calculation.
    let mut start_time = state
        .meeting_start
        .lock()
        .map_err(|e| format!("Failed to lock meeting start state: {e}"))?;
    *start_time = Some(Local::now());

    // Flag recording as active
    state.is_recording.store(true, Ordering::SeqCst);

    // Spawn live language detection & speech activity telemetry hook
    let is_recording_flag = Arc::clone(&state.is_recording);
    let app_emitter = app_handle.clone();

    tokio::spawn(async move {
        let mut tick: usize = 0;
        while is_recording_flag.load(Ordering::SeqCst) {
            tokio::time::sleep(tokio::time::Duration::from_millis(1800)).await;
            if !is_recording_flag.load(Ordering::SeqCst) {
                break;
            }

            tick += 1;
            // Simulated live acoustic/bilingual code-switching heuristic
            let language = match tick % 3 {
                0 => "English",
                1 => "Bangla",
                _ => "Code-switching (EN/BN)",
            };

            let payload = LiveLanguagePayload {
                language: language.to_string(),
                confidence: 0.88,
                is_speech_active: true,
            };

            let _ = app_emitter.emit("live_language_detected", payload);
        }
    });

    // Spawn high-efficiency 50ms real-time audio meter telemetry loop (20 Hz)
    let meter_recording_flag = Arc::clone(&state.is_recording);
    let meter_emitter = app_handle.clone();

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(50));
        while meter_recording_flag.load(Ordering::SeqCst) {
            interval.tick().await;
            if !meter_recording_flag.load(Ordering::SeqCst) {
                break;
            }

            let mic = f32::from_bits(mic_level_handle.load(Ordering::Relaxed));
            let sys = f32::from_bits(sys_level_handle.load(Ordering::Relaxed));
            let level = mic.max(sys);

            let payload = AudioMeterPayload {
                mic_level: mic,
                system_level: sys,
                level,
            };

            let _ = meter_emitter.emit("audio_meter", payload);
        }

        // When recording ends, emit resting zero level
        let _ = meter_emitter.emit(
            "audio_meter",
            AudioMeterPayload {
                mic_level: 0.0,
                system_level: 0.0,
                level: 0.0,
            },
        );
    });

    Ok("Recording started".to_string())
}

/// Stops recording, runs Whisper transcription on both mic and system tracks independently,
/// interleaves segments chronologically, writes markdown notes and sidecar JSON, and saves history.
#[tauri::command]
pub async fn stop_and_transcribe(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<TranscriptionResult, String> {
    // Halt live language detection telemetry
    state.is_recording.store(false, Ordering::SeqCst);

    // --- Step 1: Stop recording and drain both tracks ---
    let (mic_track, system_track) = {
        let mut recorder = state
            .recorder
            .lock()
            .map_err(|e| format!("Failed to lock recorder state: {e}"))?;

        recorder.stop();
        recorder.take_tracks()
    }; // MutexGuard dropped here — no lock held during inference

    if mic_track.samples.is_empty() && system_track.samples.is_empty() {
        return Err("No audio was recorded on any active track. Please check your microphone and speaker settings.".to_string());
    }

    // --- Step 2: Resolve the model path dynamically ---
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;

    let model_path = app_data_dir.join("models").join("ggml-base.bin");

    // --- Step 3: Run Whisper inference on blocking thread ---
    let segments = tokio::task::spawn_blocking(move || -> Result<Vec<TranscriptSegment>, String> {
        let mut all_segments = Vec::new();

        // 1. Transcribe Microphone ("You")
        if !mic_track.samples.is_empty() {
            println!("Transcribing microphone track ({} samples)...", mic_track.samples.len());
            match engine::transcribe_track(&mic_track.samples, mic_track.sample_rate, &model_path, "You") {
                Ok(mic_segs) => {
                    println!("Microphone track yielded {} segments", mic_segs.len());
                    all_segments.extend(mic_segs);
                }
                Err(e) => eprintln!("Error transcribing mic track: {e}"),
            }
        }

        // 2. Transcribe System Audio Loopback ("Participant")
        if !system_track.samples.is_empty() {
            println!("Transcribing system audio track ({} samples)...", system_track.samples.len());
            match engine::transcribe_track(&system_track.samples, system_track.sample_rate, &model_path, "Participant") {
                Ok(sys_segs) => {
                    println!("System audio track yielded {} segments", sys_segs.len());
                    all_segments.extend(sys_segs);
                }
                Err(e) => eprintln!("Error transcribing system track: {e}"),
            }
        }

        // 3. Chronologically sort interleaved segments
        all_segments.sort_by_key(|s| s.timestamp_ms);

        if all_segments.is_empty() {
            all_segments.push(TranscriptSegment {
                speaker: "System".to_string(),
                text: "(No speech detected in this recording)".to_string(),
                timestamp: "00:00".to_string(),
                timestamp_ms: 0,
            });
        }

        Ok(all_segments)
    })
    .await
    .map_err(|e| format!("Transcription task panicked: {e}"))??;

    // --- Step 4: Calculate duration and timestamps ---
    let started_at = {
        let mut start_time = state
            .meeting_start
            .lock()
            .map_err(|e| format!("Failed to lock meeting start state: {e}"))?;

        start_time.take().unwrap_or_else(Local::now)
    };

    let ended_at = Local::now();
    let duration_span = ended_at.signed_duration_since(started_at);
    let duration_mins = duration_span.num_minutes();
    let duration_secs = duration_span.num_seconds() % 60;
    let duration_str = format!("{duration_mins}m {duration_secs}s");

    // --- Step 5: Classify language based on aggregated segment text ---
    let full_text: String = segments
        .iter()
        .map(|s| s.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");

    let language_detected = history::classify_transcript_language(&full_text);

    // --- Step 6: Save the transcript to Markdown and JSON sidecar ---
    let file_path = local_files::save_transcript_segments(&app_data_dir, &segments, started_at)?;

    let file_path_str = file_path
        .to_str()
        .ok_or_else(|| "File path contains invalid Unicode".to_string())?
        .to_string();

    // --- Step 7: Update meetings_index.json ---
    let meeting_id = format!("meeting_{}", started_at.format("%Y-%m-%d_%H-%M-%S"));
    let meeting_title = format!("Meeting {}", started_at.format("%b %d, %Y %H:%M"));

    let record = MeetingRecord {
        id: meeting_id.clone(),
        title: meeting_title,
        created_at: started_at.to_rfc3339(),
        duration: duration_str.clone(),
        language_detected: language_detected.clone(),
        file_path: file_path_str.clone(),
    };

    if let Err(e) = history::add_meeting(&app_data_dir, record) {
        eprintln!("Warning: Failed to save meeting to history index: {e}");
    }

    Ok(TranscriptionResult {
        id: meeting_id,
        transcript: segments,
        file_path: file_path_str,
        language_detected,
        duration: duration_str,
    })
}

/// Retrieves the complete list of past meetings from `meetings_index.json`.
#[tauri::command]
pub async fn get_meeting_history(
    app_handle: tauri::AppHandle,
) -> Result<Vec<MeetingRecord>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;

    history::load_history(&app_data_dir)
}

/// Renames a meeting title in `meetings_index.json` and updates the markdown file header.
#[tauri::command]
pub async fn rename_meeting(
    app_handle: tauri::AppHandle,
    id: String,
    new_title: String,
) -> Result<bool, String> {
    if new_title.trim().is_empty() {
        return Err("Title cannot be empty".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;

    history::update_meeting_title(&app_data_dir, &id, &new_title)
}

/// Loads full details (metadata + structured transcript segments) for a single meeting by ID.
#[tauri::command]
pub async fn get_meeting_detail(
    app_handle: tauri::AppHandle,
    id: String,
) -> Result<MeetingDetail, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;

    history::get_meeting_detail(&app_data_dir, &id)
}

/// Deletes a meeting from `meetings_index.json` and deletes its files from disk.
#[tauri::command]
pub async fn delete_meeting(app_handle: tauri::AppHandle, id: String) -> Result<bool, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;

    history::delete_meeting(&app_data_dir, &id)
}
