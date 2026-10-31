export interface MeetingRecord {
  id: string;
  title: string;
  created_at: string;
  duration: string;
  language_detected: string;
  file_path: string;
}

export interface TranscriptSegment {
  speaker: string;
  text: string;
  timestamp: string;
  timestamp_ms?: number;
}

export interface MeetingDetail {
  record: MeetingRecord;
  transcript: TranscriptSegment[];
}

export interface LiveLanguagePayload {
  language: string;
  confidence: number;
  is_speech_active: boolean;
}

export interface StopAndTranscribeResult {
  id: string;
  transcript: TranscriptSegment[];
  file_path: string;
  language_detected: string;
  duration: string;
}

export interface TrackState {
  mic_enabled: boolean;
  system_enabled: boolean;
}

export interface AudioMeterPayload {
  mic_level: number;
  system_level: number;
  level: number;
}

