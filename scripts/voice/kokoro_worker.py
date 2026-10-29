"""A voice worker for the Kokoro voice (ADR 0084).

Started once by the build with the model, the voices file, the voice name and the speed. It reads one JSON object per line on standard input,
{"text": ..., "out": ...} or {"text": ..., "out": ..., "speed": 0.80} (optional speed overrides the global speed for that sentence),
voices the text into a 16-bit mono WAV at `out`, and answers with one JSON line on standard output, {"ok": true} or {"ok": false, "error": ...}. Loading the model takes a
few seconds, so one worker voices every sentence of a build. It ends when standard input closes. Nothing is fetched from the network.
"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

# every sentence is brought to the same loudness (RMS of -15 dBFS), never past a peak of -0.5 dBFS, so the voice is as loud as the development voice and even from sentence to sentence
TARGET_RMS_DB = -15.0
PEAK_LIMIT = 0.944


def level(samples: np.ndarray) -> np.ndarray:
    x = np.asarray(samples, dtype=np.float32)
    rms = float(np.sqrt(np.mean(x * x))) if x.size else 0.0
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    if rms < 1e-6 or peak < 1e-6:
        return x
    gain = min(10 ** (TARGET_RMS_DB / 20) / rms, PEAK_LIMIT / peak)
    return x * gain


def main() -> int:
    model, voices, voice, speed, lang = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), sys.argv[5]
    kokoro = Kokoro(model, voices)
    print(json.dumps({"ready": True}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            # optional per-sentence speed override (e.g. 0.80 for [slow]-marked sentences)
            req_speed = float(req["speed"]) if "speed" in req and req["speed"] is not None else speed
            samples, rate = kokoro.create(req["text"], voice=voice, speed=req_speed, lang=lang)
            sf.write(req["out"], level(samples), rate, subtype="PCM_16")
            print(json.dumps({"ok": True}), flush=True)
        except Exception as e:  # one bad sentence must not end the worker
            print(json.dumps({"ok": False, "error": str(e)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
