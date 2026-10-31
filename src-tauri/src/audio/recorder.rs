use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

/// Represents extracted audio samples with their associated sample rate.
#[derive(Clone, Debug)]
pub struct AudioTrack {
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

/// Manages CPAL audio capture with separate streams and buffers for:
/// - Microphone audio (User / Input device)
/// - System audio loopback (Participant / Desktop output device)
pub struct AudioRecorder {
    /// Shared buffer for microphone PCM samples.
    mic_buffer: Arc<Mutex<Vec<f32>>>,
    /// Shared buffer for system loopback PCM samples.
    system_buffer: Arc<Mutex<Vec<f32>>>,
    /// Active microphone stream handle; `None` when idle.
    mic_stream: Option<cpal::Stream>,
    /// Active system loopback stream handle; `None` when idle.
    system_stream: Option<cpal::Stream>,
    /// Live toggle flag for microphone capture.
    mic_enabled: Arc<AtomicBool>,
    /// Live toggle flag for system loopback capture.
    system_enabled: Arc<AtomicBool>,
    /// Sample rate of microphone recording.
    mic_sample_rate: u32,
    /// Sample rate of system audio recording.
    system_sample_rate: u32,
    /// Real-time normalized RMS level of microphone (f32 bits, 0.0 - 1.0).
    mic_level: Arc<AtomicU32>,
    /// Real-time normalized RMS level of system loopback (f32 bits, 0.0 - 1.0).
    system_level: Arc<AtomicU32>,
}

// SAFETY: `cpal::Stream` is `Send` on desktop platforms Tauri targets.
unsafe impl Send for AudioRecorder {}

impl AudioRecorder {
    /// Creates a new idle recorder with empty buffers and both tracks enabled by default.
    pub fn new() -> Self {
        Self {
            mic_buffer: Arc::new(Mutex::new(Vec::new())),
            system_buffer: Arc::new(Mutex::new(Vec::new())),
            mic_stream: None,
            system_stream: None,
            mic_enabled: Arc::new(AtomicBool::new(true)),
            system_enabled: Arc::new(AtomicBool::new(true)),
            mic_sample_rate: 16000,
            system_sample_rate: 16000,
            mic_level: Arc::new(AtomicU32::new(0)),
            system_level: Arc::new(AtomicU32::new(0)),
        }
    }

    /// Returns handle to the live mic level atomic (f32 bits).
    pub fn mic_level(&self) -> Arc<AtomicU32> {
        Arc::clone(&self.mic_level)
    }

    /// Returns handle to the live system loopback level atomic (f32 bits).
    pub fn system_level(&self) -> Arc<AtomicU32> {
        Arc::clone(&self.system_level)
    }

    /// Toggles capture on or off for the specified track ("mic" or "system").
    pub fn set_track_enabled(&self, track: &str, enabled: bool) {
        match track {
            "mic" => {
                self.mic_enabled.store(enabled, Ordering::SeqCst);
                if !enabled {
                    self.mic_level.store(0, Ordering::Relaxed);
                }
            }
            "system" => {
                self.system_enabled.store(enabled, Ordering::SeqCst);
                if !enabled {
                    self.system_level.store(0, Ordering::Relaxed);
                }
            }
            _ => eprintln!("Unknown audio track: {track}"),
        }
    }

    /// Returns the active enabled state of (mic_enabled, system_enabled).
    pub fn get_track_state(&self) -> (bool, bool) {
        (
            self.mic_enabled.load(Ordering::SeqCst),
            self.system_enabled.load(Ordering::SeqCst),
        )
    }

    /// Opens both the default input device (microphone) and default output device (system loopback)
    /// and begins independent capture into separate buffers.
    pub fn start(&mut self) -> Result<(), String> {
        // If already recording, stop previous streams first.
        self.stop();

        let host = cpal::default_host();

        // ─── 1. Setup Microphone Capture (Input) ───
        let mic_device = host
            .default_input_device()
            .ok_or_else(|| "No audio input device (microphone) found".to_string())?;

        let mic_config = mic_device
            .default_input_config()
            .map_err(|e| format!("Failed to get default microphone config: {e}"))?;

        self.mic_sample_rate = mic_config.sample_rate().0;

        // Clear stale mic samples
        if let Ok(mut buf) = self.mic_buffer.lock() {
            buf.clear();
        }

        println!(
            "Opened mic device: '{}' | Sample rate: {} Hz | Channels: {} | Format: {:?}",
            mic_device.name().unwrap_or_else(|_| "Unknown".into()),
            self.mic_sample_rate,
            mic_config.channels(),
            mic_config.sample_format()
        );

        let mic_stream = build_stream(
            &mic_device,
            &mic_config,
            Arc::clone(&self.mic_buffer),
            Arc::clone(&self.mic_enabled),
            Arc::clone(&self.mic_level),
        )
        .map_err(|e| format!("Failed to build microphone stream: {e}"))?;

        mic_stream
            .play()
            .map_err(|e| format!("Failed to start microphone stream: {e}"))?;

        self.mic_stream = Some(mic_stream);

        // ─── 2. Setup System Audio Loopback Capture (Output) ───
        if let Ok(mut buf) = self.system_buffer.lock() {
            buf.clear();
        }

        if let Some(sys_device) = host.default_output_device() {
            match sys_device.default_output_config() {
                Ok(sys_config) => {
                    self.system_sample_rate = sys_config.sample_rate().0;
                    println!(
                        "Opened system loopback device: '{}' | Sample rate: {} Hz | Channels: {} | Format: {:?}",
                        sys_device.name().unwrap_or_else(|_| "Unknown".into()),
                        self.system_sample_rate,
                        sys_config.channels(),
                        sys_config.sample_format()
                    );

                    match build_stream(
                        &sys_device,
                        &sys_config,
                        Arc::clone(&self.system_buffer),
                        Arc::clone(&self.system_enabled),
                        Arc::clone(&self.system_level),
                    ) {
                        Ok(sys_stream) => {
                            if let Err(e) = sys_stream.play() {
                                eprintln!("Warning: Failed to start system loopback stream: {e}");
                            } else {
                                self.system_stream = Some(sys_stream);
                            }
                        }
                        Err(e) => {
                            eprintln!("Warning: Could not build system loopback stream: {e}");
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Warning: Could not get default output config for system loopback: {e}");
                }
            }
        } else {
            eprintln!("Warning: No default output device found for system audio capture.");
        }

        Ok(())
    }

    /// Stops recording and drops both CPAL stream handles, releasing hardware devices.
    pub fn stop(&mut self) {
        self.mic_stream = None;
        self.system_stream = None;
        self.mic_level.store(0, Ordering::Relaxed);
        self.system_level.store(0, Ordering::Relaxed);
    }

    /// Drains both mic and system audio buffers, returning `(mic_track, system_track)`.
    /// Samples are moved out (`std::mem::take`) to eliminate high peak memory allocations.
    pub fn take_tracks(&self) -> (AudioTrack, AudioTrack) {
        let mic_samples = if let Ok(mut buf) = self.mic_buffer.lock() {
            std::mem::take(&mut *buf)
        } else {
            Vec::new()
        };

        let system_samples = if let Ok(mut buf) = self.system_buffer.lock() {
            std::mem::take(&mut *buf)
        } else {
            Vec::new()
        };

        (
            AudioTrack {
                samples: mic_samples,
                sample_rate: self.mic_sample_rate,
            },
            AudioTrack {
                samples: system_samples,
                sample_rate: self.system_sample_rate,
            },
        )
    }

    /// Returns `true` if either capture stream is currently active.
    #[allow(dead_code)]
    pub fn is_recording(&self) -> bool {
        self.mic_stream.is_some() || self.system_stream.is_some()
    }

    /// Returns the most recent `count` microphone samples without draining the buffer.
    /// Useful for live acoustic monitoring, waveforms, and speech heuristics.
    #[allow(dead_code)]
    pub fn peek_recent_samples(&self, count: usize) -> Vec<f32> {
        if let Ok(buf) = self.mic_buffer.lock() {
            let start = buf.len().saturating_sub(count);
            buf[start..].to_vec()
        } else {
            Vec::new()
        }
    }

    /// Returns the current microphone recording sample rate.
    #[allow(dead_code)]
    pub fn sample_rate(&self) -> u32 {
        self.mic_sample_rate
    }
}

/// Helper function to update smoothed real-time volume levels with fast attack & smooth release.
#[inline]
fn update_smoothed_level(level_handle: &AtomicU32, rms: f32) {
    // Normal speech in typical mics is between 0.02 and 0.25 RMS.
    // Scale factor 4.5 maps typical speech to dynamic 0.10 - 0.95 range.
    let normalized = (rms * 4.5).min(1.0);
    let prev_val = f32::from_bits(level_handle.load(Ordering::Relaxed));
    let smoothed = if normalized > prev_val {
        // Fast attack for crisp responsiveness when voice begins
        prev_val * 0.35 + normalized * 0.65
    } else {
        // Smooth release for natural acoustic decay
        prev_val * 0.82 + normalized * 0.18
    };
    level_handle.store(smoothed.to_bits(), Ordering::Relaxed);
}

/// Helper to build a CPAL input stream for a device with downmixing to mono f32
/// and atomic enable gating with live level calculation.
fn build_stream(
    device: &cpal::Device,
    config: &cpal::SupportedStreamConfig,
    buffer_handle: Arc<Mutex<Vec<f32>>>,
    enabled_handle: Arc<AtomicBool>,
    level_handle: Arc<AtomicU32>,
) -> Result<cpal::Stream, String> {
    let channels = config.channels() as usize;

    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            &config.clone().into(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !enabled_handle.load(Ordering::Relaxed) {
                    level_handle.store(0, Ordering::Relaxed);
                    return;
                }

                // Compute RMS level
                let mut sum_sq = 0.0f32;
                for &s in data {
                    sum_sq += s * s;
                }
                let rms = if !data.is_empty() {
                    (sum_sq / data.len() as f32).sqrt()
                } else {
                    0.0
                };
                update_smoothed_level(&level_handle, rms);

                if let Ok(mut buf) = buffer_handle.lock() {
                    if channels == 1 {
                        buf.extend_from_slice(data);
                    } else {
                        for chunk in data.chunks_exact(channels) {
                            let sum: f32 = chunk.iter().sum();
                            buf.push(sum / channels as f32);
                        }
                    }
                }
            },
            move |err| {
                eprintln!("Audio stream error: {err}");
            },
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            &config.clone().into(),
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                if !enabled_handle.load(Ordering::Relaxed) {
                    level_handle.store(0, Ordering::Relaxed);
                    return;
                }

                let mut sum_sq = 0.0f32;
                for &s in data {
                    let f = s as f32 / 32768.0;
                    sum_sq += f * f;
                }
                let rms = if !data.is_empty() {
                    (sum_sq / data.len() as f32).sqrt()
                } else {
                    0.0
                };
                update_smoothed_level(&level_handle, rms);

                if let Ok(mut buf) = buffer_handle.lock() {
                    if channels == 1 {
                        buf.extend(data.iter().map(|&s| cpal::Sample::to_sample::<f32>(s)));
                    } else {
                        for chunk in data.chunks_exact(channels) {
                            let sum: f32 = chunk
                                .iter()
                                .map(|&s| cpal::Sample::to_sample::<f32>(s))
                                .sum();
                            buf.push(sum / channels as f32);
                        }
                    }
                }
            },
            move |err| {
                eprintln!("Audio stream error: {err}");
            },
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            &config.clone().into(),
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                if !enabled_handle.load(Ordering::Relaxed) {
                    level_handle.store(0, Ordering::Relaxed);
                    return;
                }

                let mut sum_sq = 0.0f32;
                for &s in data {
                    let f = (s as f32 - 32768.0) / 32768.0;
                    sum_sq += f * f;
                }
                let rms = if !data.is_empty() {
                    (sum_sq / data.len() as f32).sqrt()
                } else {
                    0.0
                };
                update_smoothed_level(&level_handle, rms);

                if let Ok(mut buf) = buffer_handle.lock() {
                    if channels == 1 {
                        buf.extend(data.iter().map(|&s| cpal::Sample::to_sample::<f32>(s)));
                    } else {
                        for chunk in data.chunks_exact(channels) {
                            let sum: f32 = chunk
                                .iter()
                                .map(|&s| cpal::Sample::to_sample::<f32>(s))
                                .sum();
                            buf.push(sum / channels as f32);
                        }
                    }
                }
            },
            move |err| {
                eprintln!("Audio stream error: {err}");
            },
            None,
        ),
        other => {
            return Err(format!("Unsupported sample format: {other:?}"));
        }
    }
    .map_err(|e| format!("Failed to build input stream: {e}"))?;

    Ok(stream)
}
