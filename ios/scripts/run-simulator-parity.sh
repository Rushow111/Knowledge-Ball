#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p artifacts/ios

STATUS_FILE="artifacts/ios/runtime-status.txt"
cleanup() {
  code=$?
  if [[ -f artifacts/ios/vite.pid ]]; then
    kill "$(cat artifacts/ios/vite.pid)" 2>/dev/null || true
  fi
  echo "exit=${code}" >> "$STATUS_FILE"
}
trap cleanup EXIT

VERSION=$(node -p "require('./package.json').version")
BUILD_NUMBER=${GITHUB_RUN_NUMBER:-1}
{
  echo "started=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "version=${VERSION}"
  echo "build=${BUILD_NUMBER}"
  echo "commit=${GITHUB_SHA:-local}"
} > "$STATUS_FILE"
cp "$STATUS_FILE" artifacts/ios/build-identity.txt

# This workflow is the iOS runtime gate. General Web/unit/browser regressions are
# already owned by Validate; duplicating them here made the Simulator gate fail
# before Xcode was reached. Install only what the runtime/visual evidence itself
# needs, then exercise the packaged iOS app.
npm ci
npx playwright install chromium
CAPACITOR_BUILD=true npm run build
npx cap sync ios
node ios/scripts/verify-packaged-assets.mjs

DEVICE_ID=$(xcrun simctl list devices available -j | python3 -c "import json,sys; payload=json.load(sys.stdin); devices=[d for group in payload.get('devices',{}).values() for d in group if d.get('isAvailable') and d.get('name','').startswith('iPhone')]; preferred=next((d for d in devices if d.get('name')=='iPhone 16'),None); selected=preferred or (devices[0] if devices else None); selected or (_ for _ in ()).throw(SystemExit('No available iPhone simulator is installed on this runner')); print(selected['udid'])")

echo "device=${DEVICE_ID}" >> "$STATUS_FILE"
xcrun simctl shutdown "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl erase "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true
xcrun simctl bootstatus "$DEVICE_ID" -b

(
  cd ios/App
  xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator -configuration Debug \
    -destination "platform=iOS Simulator,id=${DEVICE_ID}" \
    MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" CODE_SIGNING_ALLOWED=NO build \
    | tee ../../artifacts/ios/xcode-build.log
  rm -rf ../../artifacts/ios/AppUITests.xcresult
  xcodebuild test -workspace App.xcworkspace -scheme App \
    -destination "platform=iOS Simulator,id=${DEVICE_ID}" \
    -resultBundlePath ../../artifacts/ios/AppUITests.xcresult \
    MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD_NUMBER" CODE_SIGNING_ALLOWED=NO \
    | tee ../../artifacts/ios/xcode-ui-test.log
)

# XCUITest intentionally ends on an interaction/validation surface. Restart the
# process before visual parity capture so both screenshots represent the same
# clean product-start state instead of comparing a modal against the Web home.
xcrun simctl terminate "$DEVICE_ID" org.knowledgeball.app >/dev/null 2>&1 || true
xcrun simctl launch "$DEVICE_ID" org.knowledgeball.app | tee artifacts/ios/simulator-launch.txt
sleep 8
xcrun simctl io "$DEVICE_ID" screenshot artifacts/ios/ios-simulator.png

(npm run preview -- --host 127.0.0.1 > artifacts/ios/vite-preview.log 2>&1 & echo $! > artifacts/ios/vite.pid)
sleep 3
node ios/scripts/capture-web-baseline.mjs
python3 -m pip install --quiet Pillow
python3 ios/scripts/compare-screenshots.py artifacts/ios/web-baseline.png artifacts/ios/ios-simulator.png

echo "completed=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$STATUS_FILE"
