"""Batch Piper driver for scripts/build-voice.mjs.

Reads a JSON array of jobs on stdin and writes one WAV per job:

    [{"text": "...", "model": "/abs/path.onnx", "length": 0.97, "out": "/abs/out.wav"}]

Exists because the piper CLI reloads the model on every invocation — around ten
seconds each for a `high` model, which is most of an hour across a mission's
worth of lines. Here each model is loaded once and reused.
"""
import json
import sys
import wave

from piper import PiperVoice
from piper.config import SynthesisConfig

jobs = json.load(sys.stdin)
cache = {}
for n, job in enumerate(jobs, 1):
    model = job["model"]
    if model not in cache:
        print(f"loading {model.rsplit('/', 1)[-1]}", file=sys.stderr, flush=True)
        cache[model] = PiperVoice.load(model)
    cfg = SynthesisConfig(length_scale=job.get("length", 1.0), normalize_audio=True)
    with wave.open(job["out"], "wb") as wav:
        cache[model].synthesize_wav(job["text"], wav, syn_config=cfg)
    print(f"{n}/{len(jobs)} {job['out'].rsplit('/', 1)[-1]}", file=sys.stderr, flush=True)
