#!/usr/bin/env bash
set -euo pipefail

mkdir -p out
python3 -m pip install --quiet --disable-pip-version-check edge-tts

VOICE_LIST="$(edge-tts --list-voices)"
VOICE=""
for candidate in \
  en-US-AndrewMultilingualNeural \
  en-US-BrianMultilingualNeural \
  en-US-AndrewNeural \
  en-US-BrianNeural \
  en-US-ChristopherNeural; do
  if printf '%s\n' "$VOICE_LIST" | grep -q "$candidate"; then
    VOICE="$candidate"
    break
  fi
done

if [ -z "$VOICE" ]; then
  VOICE="$(printf '%s\n' "$VOICE_LIST" | awk '/en-US/ && /Male/ {print $1; exit}')"
fi

if [ -z "$VOICE" ]; then
  echo "No suitable neural English male voice found" >&2
  exit 1
fi

echo "Using neural voice: $VOICE"
edge-tts \
  --voice "$VOICE" \
  --rate="+12%" \
  --file narration-5min.txt \
  --write-media out/narration-5min-raw.mp3

RAW_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/narration-5min-raw.mp3)"
echo "Raw narration duration: $RAW_DURATION"

# Keep the narration naturally inside a five-minute film with a short visual opening and closing.
RATIO="$(python3 - "$RAW_DURATION" <<'PY'
import sys
raw=float(sys.argv[1])
target=294.0
print(max(1.0, raw/target))
PY
)"

ffmpeg -hide_banner -loglevel error -y \
  -i out/narration-5min-raw.mp3 \
  -filter:a "atempo=${RATIO},highpass=f=70,lowpass=f=12500" \
  -ar 48000 -ac 1 out/narration-5min.wav

# Download multiple CC0/public-domain music cues. Each slot has fallbacks so CI stays reproducible.
BASE="https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com"
fetch_track() {
  local out="$1"; shift
  for name in "$@"; do
    local url="${BASE}/${name}"
    echo "Trying music: $url"
    if curl -fL --retry 2 --retry-delay 1 "$url" -o "$out"; then
      return 0
    fi
  done
  return 1
}

fetch_track out/music1.mp3 "Asking%20Questions.mp3" "Deep%20Tones.mp3"
fetch_track out/music2.mp3 "Deep%20Tones.mp3" "Circuit.mp3" "Asking%20Questions.mp3"
fetch_track out/music3.mp3 "Circuit.mp3" "Asking%20Questions.mp3" "Deep%20Tones.mp3"

# Build a long research-documentary bed with crossfades. Reusing the first cue as a fourth section
# guarantees more than five minutes of source material before trimming.
ffmpeg -hide_banner -loglevel error -y \
  -i out/music1.mp3 -i out/music2.mp3 -i out/music3.mp3 -i out/music1.mp3 \
  -filter_complex "\
    [0:a]aresample=48000,volume=0.9[a0];\
    [1:a]aresample=48000,volume=0.9[a1];\
    [2:a]aresample=48000,volume=0.9[a2];\
    [3:a]aresample=48000,volume=0.9[a3];\
    [a0][a1]acrossfade=d=5:c1=tri:c2=tri[x1];\
    [x1][a2]acrossfade=d=5:c1=tri:c2=tri[x2];\
    [x2][a3]acrossfade=d=5:c1=tri:c2=tri,atrim=0:300,apad=whole_dur=300,afade=t=in:st=0:d=2.5,afade=t=out:st=296:d=4[bg]" \
  -map "[bg]" -ar 48000 -ac 2 out/background-5min.wav

VOICE_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/narration-5min.wav)"
BG_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/background-5min.wav)"
echo "Final narration duration: $VOICE_DURATION"
echo "Background duration: $BG_DURATION"
