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

# Pick one continuous source for the entire film. This removes audible song-to-song joins.
MAIN_TRACK="$(python3 - <<'PY'
import subprocess
tracks=['out/music1.mp3','out/music2.mp3','out/music3.mp3']
best=None
for p in tracks:
    try:
        d=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',p], text=True).strip())
    except Exception:
        continue
    print(f'{p}: {d:.2f}s')
    if best is None or d > best[1]:
        best=(p,d)
if best is None:
    raise SystemExit('No usable background track')
print(best[0])
PY
)"
# The Python diagnostic lines are included above; keep only the final path.
MAIN_TRACK="$(printf '%s\n' "$MAIN_TRACK" | tail -n 1)"
MAIN_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$MAIN_TRACK")"
echo "Continuous background source: $MAIN_TRACK (${MAIN_DURATION}s)"

# Build a legal atempo chain so the selected track becomes exactly 300 seconds without pitch shifting.
TEMPO_CHAIN="$(python3 - "$MAIN_DURATION" <<'PY'
import sys
ratio=float(sys.argv[1])/300.0
parts=[]
while ratio < 0.5:
    parts.append(0.5)
    ratio /= 0.5
while ratio > 2.0:
    parts.append(2.0)
    ratio /= 2.0
parts.append(ratio)
print(','.join(f'atempo={x:.8f}' for x in parts))
PY
)"

echo "Background tempo chain: $TEMPO_CHAIN"
ffmpeg -hide_banner -loglevel error -y \
  -i "$MAIN_TRACK" \
  -filter_complex "[0:a]aresample=48000,${TEMPO_CHAIN},atrim=0:300,apad=whole_dur=300,highpass=f=45,lowpass=f=14500,afade=t=in:st=0:d=3,afade=t=out:st=296:d=4[bg]" \
  -map "[bg]" -ar 48000 -ac 2 out/background-5min.wav

VOICE_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/narration-5min.wav)"
BG_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/background-5min.wav)"
echo "Final narration duration: $VOICE_DURATION"
echo "Continuous background duration: $BG_DURATION"
