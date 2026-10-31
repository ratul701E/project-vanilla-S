use crate::audio::recorder::AudioRecorder;
use crate::storage::local_files;
use crate::whisper::engine;
use chrono::{DateTime, Local};
use serde::Serialize;
use std::sync::Mutex;
use tauri::Manager;

/// Shared application state managed by Tauri's `.manage()`.
///
/// All fields are wrapped in `Mutex` because Tauri commands receive
/// `State<AppState>` as a shared reference — we need interior mutability
/// to modify the recorder and timestamp across calls.
pub struct AppState {
    pub recorder: Mutex<AudioRecorder>,
    pub meeting_start: Mutex<Option<DateTime<Local>>>,
}

/// Return type for `stop_and_transcribe`, serialized to JSON over IPC.
#[derive(Serialize)]
pub struct TranscriptionResult {
    pub transcript: String,
    pub file_path: String,
}

/// Starts capturing audio from the default microphone.
///
/// Returns `Ok(())` on success or an error description if the mic
/// can't be opened (e.g., no input device, permission denied).
#[tauri::command]
pub async fn start_meeting(state: tauri::State<'_, AppState>) -> Result<String, String> {
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

    Ok("Recording started".to_string())
}

/// Stops recording, runs Whisper transcription, and saves the result.
///
/// This command:
/// 1. Stops the CPAL stream (releases the microphone)
/// 2. Drains the audio buffer
/// 3. Runs Whisper inference in a blocking thread (CPU-heavy)
/// 4. Saves the transcript as a Markdown file
/// 5. Returns the transcript text and file path to the frontend
#[tauri::command]
pub async fn stop_and_transcribe(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<TranscriptionResult, String> {
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
    // This prevents blocking the Tauri async runtime / UI thread
    // during the (potentially minutes-long) CPU inference pass.
    let transcript = tokio::task::spawn_blocking(move || {
        engine::transcribe(&samples, sample_rate, &model_path)
    })
    .await
    .map_err(|e| format!("Transcription task panicked: {e}"))??;

    // --- Step 4: Save the transcript to a Markdown file ---
    let started_at = {
        let mut start_time = state
            .meeting_start
            .lock()
            .map_err(|e| format!("Failed to lock meeting start state: {e}"))?;

        start_time.take().unwrap_or_else(Local::now)
    };

    let file_path = local_files::save_transcript(&app_data_dir, &transcript, started_at)?;

    let file_path_str = file_path
        .to_str()
        .ok_or_else(|| "File path contains invalid Unicode".to_string())?
        .to_string();

    Ok(TranscriptionResult {
        transcript,
        file_path: file_path_str,
    })
}
