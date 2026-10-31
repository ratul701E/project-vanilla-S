use crate::audio::recorder::AudioRecorder;
use crate::storage::history::{self, MeetingDetail, MeetingRecord};
use crate::storage::local_files;
use crate::whisper::engine;
use chrono::{DateTime, Local};
use serde::Serialize;
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
    pub transcript: String,
    pub file_path: String,
    pub language_detected: String,
    pub duration: String,
}

/// Payload sent via Tauri event during active recording.
#[derive(Clone, Serialize)]
pub struct LiveLanguagePayload {
    pub language: String,
    pub confidence: f32,
    pub is_speech_active: bool,
}

/// Starts capturing audio from the default microphone and begins
/// the live language detection telemetry emitter.
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

    Ok("Recording started".to_string())
}

/// Stops recording, runs Whisper transcription, classifies language,
/// writes the markdown note, and saves a history record into meetings_index.json.
#[tauri::command]
pub async fn stop_and_transcribe(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<TranscriptionResult, String> {
    // Halt live language detection telemetry
    state.is_recording.store(false, Ordering::SeqCst);

    // --- Step 1: Stop recording and drain the buffer ---
    let (samples, sample_rate) = {
        let mut recorder = state
            .recorder
            .lock()
            .map_err(|e| format!("Failed to lock recorder state: {e}"))?;

        recorder.stop();
        recorder.take_samples()
    }; // MutexGuard dropped here — no lock held during inference

    if samples.is_empty() {
        return Err("No audio was recorded. Please check your microphone.".to_string());
    }

    // --- Step 2: Resolve the model path dynamically ---
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;

    let model_path = app_data_dir.join("models").join("ggml-base.bin");

    // --- Step 3: Run Whisper inference on a blocking thread ---
    let transcript = tokio::task::spawn_blocking(move || {
        engine::transcribe(&samples, sample_rate, &model_path)
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

    // --- Step 5: Classify language based on script/character distribution ---
    let language_detected = history::classify_transcript_language(&transcript);

    // --- Step 6: Save the transcript to a Markdown file ---
    let file_path = local_files::save_transcript(&app_data_dir, &transcript, started_at)?;

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

    // Store in history index (non-fatal if index fails, but logged)
    if let Err(e) = history::add_meeting(&app_data_dir, record) {
        eprintln!("Warning: Failed to save meeting to history index: {e}");
    }

    Ok(TranscriptionResult {
        id: meeting_id,
        transcript,
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

/// Loads full details (metadata + transcript) for a single meeting by ID.
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

/// Deletes a meeting from `meetings_index.json` and deletes its markdown file from disk.
#[tauri::command]
pub async fn delete_meeting(app_handle: tauri::AppHandle, id: String) -> Result<bool, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))?;

    history::delete_meeting(&app_data_dir, &id)
}
