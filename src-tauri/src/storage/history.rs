use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Metadata record for a past meeting stored in `meetings_index.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingRecord {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub duration: String,
    pub language_detected: String,
    pub file_path: String,
}

/// Full meeting details including metadata and the full transcript text.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeetingDetail {
    pub record: MeetingRecord,
    pub transcript: String,
}

/// Returns the path to the meetings index JSON file.
fn index_file_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("meetings_index.json")
}

/// Loads all past meetings from `meetings_index.json`.
/// Returns an empty list if the index file does not exist yet.
pub fn load_history(app_data_dir: &Path) -> Result<Vec<MeetingRecord>, String> {
    let path = index_file_path(app_data_dir);
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read meetings index file: {e}"))?;

    if content.trim().is_empty() {
        return Ok(Vec::new());
    }

    let records: Vec<MeetingRecord> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse meetings index JSON: {e}"))?;

    Ok(records)
}

/// Saves the list of meeting records to `meetings_index.json`.
pub fn save_history(app_data_dir: &Path, records: &[MeetingRecord]) -> Result<(), String> {
    // Ensure parent directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    }

    let path = index_file_path(app_data_dir);
    let json = serde_json::to_string_pretty(records)
        .map_err(|e| format!("Failed to serialize meetings index: {e}"))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write meetings index file: {e}"))?;

    Ok(())
}

/// Prepends a new meeting record to the top of the history list.
pub fn add_meeting(app_data_dir: &Path, record: MeetingRecord) -> Result<(), String> {
    let mut history = load_history(app_data_dir)?;
    history.insert(0, record);
    save_history(app_data_dir, &history)
}

/// Updates the title of an existing meeting in both `meetings_index.json`
/// and the header of the associated markdown file.
pub fn update_meeting_title(
    app_data_dir: &Path,
    id: &str,
    new_title: &str,
) -> Result<bool, String> {
    let mut history = load_history(app_data_dir)?;
    let mut found = false;
    let mut target_file_path: Option<String> = None;

    for item in &mut history {
        if item.id == id {
            item.title = new_title.trim().to_string();
            target_file_path = Some(item.file_path.clone());
            found = true;
            break;
        }
    }

    if !found {
        return Err(format!("Meeting with ID '{id}' not found in history"));
    }

    save_history(app_data_dir, &history)?;

    // Optionally update the title in the markdown file header if it exists
    if let Some(file_str) = target_file_path {
        let md_path = PathBuf::from(&file_str);
        if md_path.exists() {
            if let Ok(content) = fs::read_to_string(&md_path) {
                let lines: Vec<&str> = content.lines().collect();
                if !lines.is_empty() && lines[0].starts_with('#') {
                    let mut updated_lines = lines;
                    let new_header = format!("# {}", new_title.trim());
                    updated_lines[0] = &new_header;
                    let new_content = updated_lines.join("\n");
                    let _ = fs::write(&md_path, new_content);
                }
            }
        }
    }

    Ok(true)
}

/// Loads full details (record + transcript) for a single meeting by ID.
pub fn get_meeting_detail(app_data_dir: &Path, id: &str) -> Result<MeetingDetail, String> {
    let history = load_history(app_data_dir)?;
    let record = history
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| format!("Meeting with ID '{id}' not found"))?;

    let file_path = PathBuf::from(&record.file_path);
    let transcript = if file_path.exists() {
        let content = fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read transcript file: {e}"))?;
        
        // Extract transcript part if it has "## Transcript" section
        if let Some(idx) = content.find("## Transcript") {
            let body = &content[idx + "## Transcript".len()..];
            body.trim().to_string()
        } else {
            content
        }
    } else {
        "(Transcript file not found on disk)".to_string()
    };

    Ok(MeetingDetail { record, transcript })
}

/// Deletes a meeting from the index and removes its markdown file from disk.
pub fn delete_meeting(app_data_dir: &Path, id: &str) -> Result<bool, String> {
    let mut history = load_history(app_data_dir)?;
    let initial_len = history.len();
    let mut file_to_delete: Option<PathBuf> = None;

    history.retain(|item| {
        if item.id == id {
            file_to_delete = Some(PathBuf::from(&item.file_path));
            false
        } else {
            true
        }
    });

    if history.len() == initial_len {
        return Err(format!("Meeting with ID '{id}' not found"));
    }

    save_history(app_data_dir, &history)?;

    // Clean up markdown file from disk
    if let Some(file_path) = file_to_delete {
        if file_path.exists() {
            let _ = fs::remove_file(file_path);
        }
    }

    Ok(true)
}

/// Analyzes transcript character distributions to accurately classify language.
/// Detects Bengali (Unicode \u{0980}..\u{09FF}) vs English (ASCII alphabetic).
pub fn classify_transcript_language(text: &str) -> String {
    let mut bengali_count = 0usize;
    let mut english_count = 0usize;

    for c in text.chars() {
        if ('\u{0980}'..='\u{09FF}').contains(&c) {
            bengali_count += 1;
        } else if c.is_ascii_alphabetic() {
            english_count += 1;
        }
    }

    let total_letters = bengali_count + english_count;
    if total_letters == 0 {
        return "English".to_string();
    }

    let bn_ratio = bengali_count as f32 / total_letters as f32;
    let en_ratio = english_count as f32 / total_letters as f32;

    if bn_ratio >= 0.15 && en_ratio >= 0.15 {
        "Code-switching (EN/BN)".to_string()
    } else if bn_ratio > 0.5 {
        "Bangla".to_string()
    } else {
        "English".to_string()
    }
}
