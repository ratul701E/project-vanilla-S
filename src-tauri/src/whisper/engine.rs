use serde::{Deserialize, Serialize};
use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// A single structured transcript segment with speaker attribution and timestamp.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptSegment {
    pub speaker: String,
    pub text: String,
    pub timestamp: String,
    #[serde(default)]
    pub timestamp_ms: u64,
}

/// Transcribes raw audio samples for a specific speaker using a local whisper.cpp model.
///
/// Returns an array of structured `TranscriptSegment` objects tagged with `speaker`
/// and precise timestamps extracted directly from Whisper inference tokens.
pub fn transcribe_track(
    samples: &[f32],
    sample_rate: u32,
    model_path: &Path,
    speaker: &str,
) -> Result<Vec<TranscriptSegment>, String> {
    if samples.is_empty() {
        return Ok(Vec::new());
    }

    if !model_path.exists() {
        return Err(format!(
            "Whisper model not found at: {}. Please download a GGML model (e.g., ggml-base.bin) and place it there.",
            model_path.display()
        ));
    }

    // --- Resample to 16 kHz if needed ---
    let audio_16k = if sample_rate != 16000 {
        resample(samples, sample_rate, 16000)
    } else {
        samples.to_vec()
    };

    // --- Initialize the Whisper context ---
    let ctx = WhisperContext::new_with_params(
        model_path
            .to_str()
            .ok_or_else(|| "Invalid model path encoding".to_string())?,
        WhisperContextParameters::default(),
    )
    .map_err(|e| format!("Failed to load Whisper model: {e}"))?;

    let mut state = ctx
        .create_state()
        .map_err(|e| format!("Failed to create Whisper state: {e}"))?;

    // --- Configure inference parameters ---
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    // "auto" language detection supports English ↔ Bengali code-switching.
    params.set_language(Some("auto"));

    // Use 4 threads for inference.
    params.set_n_threads(4);

    // Disable printing to stdout.
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // Do NOT enforce token timestamps to avoid "single timestamp ending" chunk drops.
    params.set_token_timestamps(false);

    let duration_sec = audio_16k.len() as f32 / 16000.0;
    println!(
        "Running Whisper inference for '{}' on {:.2}s of 16kHz audio ({} samples)...",
        speaker,
        duration_sec,
        audio_16k.len()
    );

    // --- Run inference ---
    state
        .full(params, &audio_16k)
        .map_err(|e| format!("Whisper inference failed for {speaker}: {e}"))?;

    // --- Collect structured transcript segments ---
    let num_segments = state.full_n_segments();
    let mut segments = Vec::new();

    for i in 0..num_segments {
        if let Some(segment) = state.get_segment(i) {
            let segment_text = segment
                .to_str_lossy()
                .map_err(|e| format!("Failed to decode segment {i}: {e}"))?;

            let trimmed = segment_text.trim();
            // Ignore empty segments or non-speech music tags
            if !trimmed.is_empty() && trimmed != "[BLANK_AUDIO]" {
                // start_timestamp returns centiseconds (10ms units)
                let start_cs = segment.start_timestamp().max(0);
                let timestamp_ms = (start_cs as u64) * 10;
                let total_secs = timestamp_ms / 1000;
                let mins = total_secs / 60;
                let secs = total_secs % 60;
                let timestamp = format!("{:02}:{:02}", mins, secs);

                segments.push(TranscriptSegment {
                    speaker: speaker.to_string(),
                    text: trimmed.to_string(),
                    timestamp,
                    timestamp_ms,
                });
            }
        }
    }

    Ok(segments)
}

/// Linear-interpolation resampling from `from_rate` → `to_rate`.
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if samples.is_empty() || from_rate == to_rate {
        return samples.to_vec();
    }

    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = ((samples.len() as f64) / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let src_idx = i as f64 * ratio;
        let idx_floor = src_idx.floor() as usize;
        let idx_ceil = (idx_floor + 1).min(samples.len() - 1);
        let frac = (src_idx - idx_floor as f64) as f32;

        let sample = samples[idx_floor] * (1.0 - frac) + samples[idx_ceil] * frac;
        output.push(sample);
    }

    output
}
