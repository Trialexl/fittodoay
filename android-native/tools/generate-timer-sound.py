"""Generate the bundled notification asset from the web completion-tone parameters.

Playback and audio focus belong to Android, not this build-time script. The 1.2 s
asset includes the web's two beeps and its volume-restoration window.
"""
from pathlib import Path
import math
import struct
import wave

SAMPLE_RATE = 44100
DURATION = 1.2
BEEPS = ((0.0, 900, 680, 0.22), (0.28, 1040, 760, 0.2))


def generate(destination: Path) -> None:
    frames = bytearray()
    for index in range(int(SAMPLE_RATE * DURATION)):
        time = index / SAMPLE_RATE
        value = 0.0
        for start, frequency_start, frequency_end, duration in BEEPS:
            elapsed = time - start
            if not 0 <= elapsed < duration:
                continue
            rate = math.log(frequency_end / frequency_start) / duration
            phase = 2 * math.pi * frequency_start * math.expm1(rate * elapsed) / rate
            if elapsed < 0.03:
                gain = 0.0001 * (0.42 / 0.0001) ** (elapsed / 0.03)
            else:
                gain = 0.42 * (0.0001 / 0.42) ** ((elapsed - 0.03) / (duration - 0.03))
            value += gain * math.sin(phase)
        frames.extend(struct.pack("<h", round(value * 32767)))
    with wave.open(str(destination), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


if __name__ == "__main__":
    asset = Path(__file__).resolve().parents[1] / "app/src/main/res/raw/timer_complete.wav"
    generate(asset)
    print(f"Generated {asset.name}: {DURATION} s, mono PCM16, {SAMPLE_RATE} Hz")
