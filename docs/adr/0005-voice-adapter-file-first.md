# ADR 0005: the adapter is the decision, not the provider (phase 0 voice)

Status: accepted, not built yet (step e).

The Web Speech API gives no audio file and no reliable timing, so it cannot pass the sync gate. Phase 0 uses a
`FileVoiceAdapter`: one pre-rendered audio file per sentence plus its duration, with durations taken by decoding the
files (exact). Files come from a local open-source TTS (Piper, WAV, no keys) or a one-time human recording of the twelve
fixture sentences. Web Speech stays only as an untimed preview mode for component work. An Indic-Speak key later becomes
a second adapter and nothing else changes. No key is needed to reach the phase 0 gate.
