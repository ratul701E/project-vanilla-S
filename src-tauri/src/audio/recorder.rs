use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::{Arc, Mutex};

/// Manages CPAL audio capture from the default input device.
///
/// Audio samples are accumulated in a shared `Arc<Mutex<Vec<f32>>>` buffer
/// that can be drained after recording stops. The CPAL `Stream` handle is
/// held in an `Option` so dropping it cleanly releases the microphone.
pub struct AudioRecorder {
    /// Shared buffer where the CPAL callback pushes incoming samples.
    buffer: Arc<Mutex<Vec<f32>>>,
    /// Active CPAL stream handle; `None` when idle.
    stream: Option<cpal::Stream>,
    /// Sample rate of the active recording (needed for resampling to 16 kHz).
    sample_rate: u32,
}

// SAFETY: `cpal::Stream` is `Send` on all desktop platforms Tauri targets.
// We never access it from multiple threads — it is only touched inside
// `start()` and `stop()`, which require `&mut self`.
unsafe impl Send for AudioRecorder {}

impl AudioRecorder {
    /// Creates a new idle recorder with an empty buffer.
    pub fn new() -> Self {
        Self {
            buffer: Arc::new(Mutex::new(Vec::new())),
            stream: None,
            sample_rate: 16000, // default; overwritten in start()
        }
    }

    /// Opens the default input device and begins capturing audio.
    ///
    /// Returns an error string if no input device is available or
    /// the stream cannot be built. Never panics.
    pub fn start(&mut self) -> Result<(), String> {
        // If already recording, stop the previous stream first.
        self.stop();

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No audio input device found".to_string())?;

        let config = device
            .default_input_config()
            .map_err(|e| format!("Failed to get default input config: {e}"))?;

        self.sample_rate = config.sample_rate().0;

        // Clear any stale samples from a previous recording.
        if let Ok(mut buf) = self.buffer.lock() {
            buf.clear();
        }

        let buffer_handle = Arc::clone(&self.buffer);

        let channels = config.channels() as usize;
        println!(
            "Opened mic device: '{}' | Sample rate: {} Hz | Channels: {} | Format: {:?}",
            device.name().unwrap_or_else(|_| "Unknown".into()),
            self.sample_rate,
            channels,
            config.sample_format()
        );

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => device.build_input_stream(
                &config.into(),
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
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
                None, // no timeout
            ),
            cpal::SampleFormat::I16 => device.build_input_stream(
                &config.into(),
                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut buf) = buffer_handle.lock() {
                        if channels == 1 {
                            buf.extend(data.iter().map(|&s| -> f32 {
                                cpal::Sample::to_sample::<f32>(s)
                            }));
                        } else {
                            for chunk in data.chunks_exact(channels) {
                                let sum: f32 = chunk.iter().map(|&s| cpal::Sample::to_sample::<f32>(s)).sum();
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
                &config.into(),
                move |data: &[u16], _: &cpal::InputCallbackInfo| {
                    if let Ok(mut buf) = buffer_handle.lock() {
                        if channels == 1 {
                            buf.extend(data.iter().map(|&s| -> f32 {
                                cpal::Sample::to_sample::<f32>(s)
                            }));
                        } else {
                            for chunk in data.chunks_exact(channels) {
                                let sum: f32 = chunk.iter().map(|&s| cpal::Sample::to_sample::<f32>(s)).sum();
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

        stream
            .play()
            .map_err(|e| format!("Failed to start audio stream: {e}"))?;

        self.stream = Some(stream);
        Ok(())
    }

    /// Stops recording and releases the microphone device.
    ///
    /// After this call, `stream` is `None` and the CPAL handle has been
    /// dropped. Safe to call even if not currently recording.
    pub fn stop(&mut self) {
        // Dropping the Stream handle stops capture and releases the device.
        self.stream = None;
    }

    /// Drains the accumulated audio buffer and returns the samples along
    /// with the sample rate they were recorded at.
    ///
    /// The internal buffer is left empty after this call — samples are
    /// *moved* out, not cloned, to avoid doubling peak memory usage.
    pub fn take_samples(&self) -> (Vec<f32>, u32) {
        let samples = if let Ok(mut buf) = self.buffer.lock() {
            std::mem::take(&mut *buf)
        } else {
            Vec::new()
        };
        (samples, self.sample_rate)
    }

    /// Returns `true` if the recorder currently has an active stream.
    pub fn is_recording(&self) -> bool {
        self.stream.is_some()
    }
}
