#!/usr/bin/env bash
set -euo pipefail

mkdir -p out public
python3 -m pip install --quiet --disable-pip-version-check edge-tts

VOICE_LIST="$(edge-tts --list-voices)"
VOICE=""
for candidate in \
  en-US-AndrewMultilingualNeural \
  en-US-BrianMultilingualNeural \
  en-US-AndrewNeural \
  en-US-BrianNeural \
  en-US-ChristopherNeural \
  en-US-GuyNeural; do
  if printf '%s\n' "$VOICE_LIST" | grep -q "$candidate"; then
    VOICE="$candidate"
    break
  fi
done

if [ -z "$VOICE" ]; then
  VOICE="$(printf '%s\n' "$VOICE_LIST" | awk '/en-US/ && /Male/ {print $1; exit}')"
fi

if [ -z "$VOICE" ]; then
  echo "No suitable en-US male Edge neural voice found" >&2
  exit 1
fi

echo "Using neural voice: $VOICE"
edge-tts \
  --voice "$VOICE" \
  --rate="+3%" \
  --pitch="-2Hz" \
  --file narration-natural.txt \
  --write-media out/narration-natural.mp3

# CC0/public-domain background music hosted on GitHub for reproducible CI rendering.
MUSIC_URLS=(
  "https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/Asking%20Questions.mp3"
  "https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/Circuit.mp3"
  "https://raw.githubusercontent.com/SoundSafari/CC0-1.0-Music/main/freepd.com/Deep%20Tones.mp3"
)

MUSIC_OK=0
for MUSIC_URL in "${MUSIC_URLS[@]}"; do
  echo "Trying background music: $MUSIC_URL"
  if curl -fL --retry 2 --retry-delay 1 "$MUSIC_URL" -o out/background-professional.mp3; then
    MUSIC_OK=1
    break
  fi
done

if [ "$MUSIC_OK" -ne 1 ]; then
  echo "Could not download a CC0 background track" >&2
  exit 1
fi

VOICE_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/narration-natural.mp3)"
MUSIC_DURATION="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/background-professional.mp3)"
echo "Narration duration: $VOICE_DURATION"
echo "Background duration: $MUSIC_DURATION"
