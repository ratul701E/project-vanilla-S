mod audio;
mod commands;
mod storage;
mod whisper;

use audio::recorder::AudioRecorder;
use commands::AppState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            recorder: Mutex::new(AudioRecorder::new()),
            meeting_start: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_meeting,
            commands::stop_and_transcribe,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
