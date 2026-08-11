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
  --rate="-2%" \
  --pitch="-4Hz" \
  --file narration-natural.txt \
  --write-media out/narration-natural.mp3

# Fetch a professionally produced, Mixkit-licensed neutral/technology ambient track.
curl -fsSL -A 'Mozilla/5.0' 'https://mixkit.co/free-stock-music/mood/neutral/' -o /tmp/mixkit-neutral.html
MUSIC_URL="$(python3 - <<'PY'
import html, re
page = html.unescape(open('/tmp/mixkit-neutral.html', encoding='utf-8').read())
urls = re.findall(r'https://assets\.mixkit\.co/music/(?:preview|download)/[^\"\'<> ]+?\.mp3', page)
# Prefer Sonor if its slug is exposed; otherwise use the first music preview from the neutral collection.
for u in urls:
    if 'sonor' in u.lower():
        print(u)
        break
else:
    if urls:
        print(urls[0])
PY
)"

if [ -z "$MUSIC_URL" ]; then
  echo "Could not extract a Mixkit music URL" >&2
  exit 1
fi

echo "Using background music: $MUSIC_URL"
curl -fL -A 'Mozilla/5.0' "$MUSIC_URL" -o out/background-professional.mp3

ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/narration-natural.mp3
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 out/background-professional.mp3
