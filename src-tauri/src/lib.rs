mod audio;
mod commands;
mod storage;
mod whisper;

use audio::recorder::AudioRecorder;
use commands::AppState;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            recorder: Mutex::new(AudioRecorder::new()),
            meeting_start: Mutex::new(None),
            is_recording: Arc::new(AtomicBool::new(false)),
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_meeting,
            commands::stop_and_transcribe,
            commands::get_meeting_history,
            commands::rename_meeting,
            commands::get_meeting_detail,
            commands::delete_meeting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
