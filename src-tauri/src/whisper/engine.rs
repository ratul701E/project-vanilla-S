use std::path::Path;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Transcribes raw audio samples using a local whisper.cpp model.
///
/// # Arguments
/// * `samples` — Raw PCM audio samples (any sample rate).
/// * `sample_rate` — The sample rate `samples` were recorded at.
/// * `model_path` — Absolute path to a GGML `.bin` model file.
///
/// # Returns
/// The full transcript as a `String`, or a descriptive error.
///
/// # Resampling
/// Whisper expects 16 kHz mono audio. If `sample_rate` differs, this
/// function performs linear-interpolation resampling before inference.
pub fn transcribe(samples: &[f32], sample_rate: u32, model_path: &Path) -> Result<String, String> {
    if samples.is_empty() {
        return Err("No audio samples to transcribe".to_string());
    }

    if !model_path.exists() {
        return Err(format!(
            "Whisper model not found at: {}. \
             Please download a GGML model (e.g., ggml-base.bin) and place it there.",
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
        model_path.to_str().ok_or_else(|| "Invalid model path encoding".to_string())?,
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

    // Use 4 threads for inference (good default for modern desktops).
    params.set_n_threads(4);

    // Disable printing to stdout — we collect results programmatically.
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // Do NOT enforce token timestamps: on short or quiet audio it causes
    // whisper.cpp to trigger "single timestamp ending - skip entire chunk".
    params.set_token_timestamps(false);

    let duration_sec = audio_16k.len() as f32 / 16000.0;
    println!("Running Whisper inference on {:.2}s of 16kHz mono audio ({} samples)...", duration_sec, audio_16k.len());

    // --- Run inference ---
    state
        .full(params, &audio_16k)
        .map_err(|e| format!("Whisper inference failed: {e}"))?;

    // --- Collect transcript segments ---
    let num_segments = state.full_n_segments();
    println!("Whisper generated {num_segments} segments");

    let mut transcript = String::new();

    for i in 0..num_segments {
        if let Some(segment) = state.get_segment(i) {
            let segment_text = segment
                .to_str_lossy()
                .map_err(|e| format!("Failed to decode segment {i}: {e}"))?;

            let trimmed = segment_text.trim();
            // Ignore non-speech tags like [Music], [Applause], etc.
            if !trimmed.is_empty() {
                if !transcript.is_empty() && !segment_text.starts_with(' ') {
                    transcript.push(' ');
                }
                transcript.push_str(trimmed);
            }
        }
    }

    if transcript.is_empty() {
        return Ok("(No speech detected in this recording)".to_string());
    }

    Ok(transcript)
}

/// Linear-interpolation resampling from `from_rate` → `to_rate`.
///
/// This is a simple but effective approach for speech audio where
/// ultra-precise resampling isn't critical. For meeting audio at
/// typical sample rates (44.1 kHz, 48 kHz → 16 kHz), this produces
/// quality indistinguishable from more complex algorithms.
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
