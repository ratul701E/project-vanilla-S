use chrono::{DateTime, Local};
use std::fs;
use std::path::{Path, PathBuf};

/// Saves a meeting transcript as a Markdown file in the app's notes directory.
///
/// # Arguments
/// * `app_data_dir` — The root app data directory (from Tauri's `app_data_dir()`).
/// * `transcript` — The transcribed meeting text.
/// * `started_at` — When the meeting recording began.
///
/// # Returns
/// The absolute path to the saved Markdown file, or a descriptive error.
///
/// # Directory Structure
/// Files are saved to `<app_data_dir>/notes/meeting_YYYY-MM-DD_HH-MM-SS.md`
/// and the directory is auto-created if it doesn't exist.
pub fn save_transcript(
    app_data_dir: &Path,
    transcript: &str,
    started_at: DateTime<Local>,
) -> Result<PathBuf, String> {
    let notes_dir = app_data_dir.join("notes");

    // Ensure the notes directory exists.
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Failed to create notes directory: {e}"))?;

    // Build a sortable, collision-free filename.
    let timestamp = started_at.format("%Y-%m-%d_%H-%M-%S");
    let filename = format!("meeting_{timestamp}.md");
    let file_path = notes_dir.join(&filename);

    // Calculate approximate meeting duration.
    let ended_at = Local::now();
    let duration = ended_at.signed_duration_since(started_at);
    let duration_mins = duration.num_minutes();
    let duration_secs = duration.num_seconds() % 60;

    // Build the Markdown content with frontmatter metadata.
    let readable_date = started_at.format("%Y-%m-%d %H:%M:%S");
    let markdown = format!(
        r#"# Meeting Notes — {title_date}

- **Date:** {readable_date}
- **Duration:** {duration_mins}m {duration_secs}s

---

## Transcript

{transcript}
"#,
        title_date = started_at.format("%B %d, %Y"),
        readable_date = readable_date,
        duration_mins = duration_mins,
        duration_secs = duration_secs,
        transcript = transcript,
    );

    fs::write(&file_path, &markdown)
        .map_err(|e| format!("Failed to write transcript file: {e}"))?;

    Ok(file_path)
}
