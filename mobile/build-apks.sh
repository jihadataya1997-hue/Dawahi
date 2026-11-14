#!/usr/bin/env bash
# يبني تطبيقات الأندرويد (الزبون + عامل التوصيل) على السيرفر نفسه.
# بيشتغل جوّا حاوية eclipse-temurin:21-jdk، وكل شي تقيل (SDK، Gradle، Node) بيتخزّن بـ /cache لحتى المرة الجاية تكون أسرع.
#   /keys    مفتاح التوقيع (سرّي، ما بيطلع من السيرفر) + google-services.json (اختياري)
#   /out     ملفات APK الجاهزة (بتنخدم من zapp.prodev.cloud/apk/)
#   /backups نسخة احتياطية من مفتاح التوقيع
set -euo pipefail
log() { echo "=== $(date -u +%H:%M:%S) $*"; }

export DEBIAN_FRONTEND=noninteractive
if ! command -v git >/dev/null || ! command -v unzip >/dev/null || ! command -v curl >/dev/null; then
  log "apt packages"
  apt-get update -qq && apt-get install -y -qq git unzip curl ca-certificates xz-utils >/dev/null
fi

# Node 22 (Capacitor 8 بيحتاجه)
NODE_VER=v22.12.0
if [ ! -x /cache/node/bin/node ]; then
  log "node $NODE_VER"
  mkdir -p /cache/node
  curl -fsSL "https://nodejs.org/dist/$NODE_VER/node-$NODE_VER-linux-x64.tar.xz" | tar -xJ -C /cache/node --strip-components=1
fi
export PATH=/cache/node/bin:$PATH

# Android SDK
export ANDROID_HOME=/cache/android-sdk ANDROID_SDK_ROOT=/cache/android-sdk
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  log "android cmdline-tools"
  mkdir -p "$ANDROID_HOME/cmdline-tools" /tmp/clt
  curl -fsSL -o /tmp/clt.zip "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
  unzip -q /tmp/clt.zip -d /tmp/clt && rm -rf "$ANDROID_HOME/cmdline-tools/latest" && mv /tmp/clt/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
fi
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [ ! -d "$ANDROID_HOME/platforms/android-36" ] || [ ! -d "$ANDROID_HOME/build-tools/36.0.0" ]; then
  log "sdk packages"
  yes | "$SDKM" --licenses >/dev/null || true
  "$SDKM" --install "platform-tools" "platforms;android-36" "build-tools;36.0.0" >/dev/null
fi
export GRADLE_USER_HOME=/cache/gradle

# الكود
log "clone"
rm -rf /work && git clone --depth 1 "${REPO_URL}" /work
COMMIT=$(git -C /work rev-parse --short HEAD)

# مفتاح التوقيع: بيتولّد مرة وحدة وبيضل نفسه (ضروري لحتى التحديثات تنزل فوق التطبيق القديم)
mkdir -p /keys /out /backups/apk-signing
if [ ! -f /keys/zapp-release.jks ]; then
  log "generating signing key"
  head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24 > /keys/password
  keytool -genkeypair -keystore /keys/zapp-release.jks -alias zapp -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=ZAPP Delivery, O=ZAPP, L=Damascus, C=SY" -storepass "$(cat /keys/password)" -keypass "$(cat /keys/password)" >/dev/null
  chmod 600 /keys/zapp-release.jks /keys/password
fi
cp -f /keys/zapp-release.jks /keys/password /backups/apk-signing/ 2>/dev/null || true
export ZAPP_KEYSTORE=/keys/zapp-release.jks ZAPP_KEYSTORE_PASSWORD="$(cat /keys/password)"
export ZAPP_VERSION_CODE=$(date -u +%y%m%d%H) ZAPP_VERSION_NAME="1.0.$(date -u +%y%m%d)"

build() {
  local app=$1 out=$2
  log "build $app"
  cd /work/mobile/$app
  npm ci --no-audit --no-fund >/dev/null
  if [ "$app" = customer ] && [ -s /keys/google-services.json ]; then
    cp /keys/google-services.json android/app/google-services.json
    # التطبيق بيعرف إنه فيه إشعارات Firebase
    node -e "const f='capacitor.config.json',c=require('./'+f);c.appendUserAgent+=' ZappFCM';require('fs').writeFileSync(f,JSON.stringify(c,null,2))"
    log "firebase enabled for customer app"
  fi
  # رقم النسخة بيوصل للموقع مع كل طلب، لحتى التطبيق يعرف إذا في نسخة أحدث لازم تنزل
  node -e "const f='capacitor.config.json',c=require('./'+f);c.appendUserAgent+=' ZappBuild/'+process.env.ZAPP_VERSION_CODE;require('fs').writeFileSync(f,JSON.stringify(c,null,2))"
  npx cap sync android >/dev/null
  cd android
  chmod +x gradlew
  ./gradlew --no-daemon -q assembleRelease
  cp app/build/outputs/apk/release/app-release.apk "/out/$out.tmp"
  mv -f "/out/$out.tmp" "/out/$out"
  log "done $app → $out ($(du -h /out/$out | cut -f1))"
}

build customer zapp.apk
build driver zapp-driver.apk

cat > /out/version.json <<JSON
{ "versionName": "$ZAPP_VERSION_NAME", "versionCode": $ZAPP_VERSION_CODE, "commit": "$COMMIT", "builtAt": "$(date -u +%FT%TZ)" }
JSON
log "ALL_APKS_READY $ZAPP_VERSION_NAME ($COMMIT)"
