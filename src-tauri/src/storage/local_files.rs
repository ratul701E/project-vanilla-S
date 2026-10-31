use crate::whisper::engine::TranscriptSegment;
use chrono::{DateTime, Local};
use std::fs;
use std::path::{Path, PathBuf};

/// Saves structured meeting segments to a Markdown file in the notes directory,
/// along with a structured JSON sidecar (`meeting_YYYY-MM-DD_HH-MM-SS_segments.json`).
pub fn save_transcript_segments(
    app_data_dir: &Path,
    segments: &[TranscriptSegment],
    started_at: DateTime<Local>,
) -> Result<PathBuf, String> {
    let notes_dir = app_data_dir.join("notes");

    // Ensure the notes directory exists.
    fs::create_dir_all(&notes_dir)
        .map_err(|e| format!("Failed to create notes directory: {e}"))?;

    // Build sortable filenames based on start time.
    let timestamp = started_at.format("%Y-%m-%d_%H-%M-%S");
    let md_filename = format!("meeting_{timestamp}.md");
    let json_filename = format!("meeting_{timestamp}_segments.json");

    let md_path = notes_dir.join(&md_filename);
    let json_path = notes_dir.join(&json_filename);

    // Save structured JSON sidecar for exact IPC retrieval
    let json_content = serde_json::to_string_pretty(segments)
        .map_err(|e| format!("Failed to serialize transcript segments: {e}"))?;
    fs::write(&json_path, json_content)
        .map_err(|e| format!("Failed to write transcript segments JSON: {e}"))?;

    // Calculate approximate meeting duration.
    let ended_at = Local::now();
    let duration = ended_at.signed_duration_since(started_at);
    let duration_mins = duration.num_minutes();
    let duration_secs = duration.num_seconds() % 60;

    // Build the Markdown formatted transcript
    let mut formatted_transcript = String::new();
    if segments.is_empty() {
        formatted_transcript.push_str("(No speech detected in this recording)\n");
    } else {
        for seg in segments {
            formatted_transcript.push_str(&format!(
                "**[{}] {}:** {}\n\n",
                seg.timestamp, seg.speaker, seg.text
            ));
        }
    }

    let readable_date = started_at.format("%Y-%m-%d %H:%M:%S");
    let markdown = format!(
        r#"# Meeting Notes — {title_date}

- **Date:** {readable_date}
- **Duration:** {duration_mins}m {duration_secs}s

---

## Transcript

{formatted_transcript}
"#,
        title_date = started_at.format("%B %d, %Y"),
        readable_date = readable_date,
        duration_mins = duration_mins,
        duration_secs = duration_secs,
        formatted_transcript = formatted_transcript.trim_end(),
    );

    fs::write(&md_path, &markdown)
        .map_err(|e| format!("Failed to write transcript Markdown file: {e}"))?;

    Ok(md_path)
}
