#!/usr/bin/env bash
set -e

PROJECT_DIR="/storage/emulated/0/Download/Office Kit/audiorip-android"
BUILD_DIR="$PROJECT_DIR/build"
SDK_DIR="/root/android-sdk"
ANDROID_JAR="$SDK_DIR/platforms/android-34/android.jar"
D8_JAR="$SDK_DIR/build-tools/34.0.0/lib/d8.jar"
APKSIGNER_JAR="$SDK_DIR/build-tools/34.0.0/lib/apksigner.jar"
OUTPUT_DIR="/storage/emulated/0/Download/opencode"

echo "=== Building AudioRip Pro Android 16 APK ==="

# Clean build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/gen" "$BUILD_DIR/classes" "$BUILD_DIR/dex" "$OUTPUT_DIR"

cd "$PROJECT_DIR"

# 1. Generate R.java
echo "[1/5] Generating R.java with AAPT..."
/usr/bin/aapt package -f -m \
    -J "$BUILD_DIR/gen" \
    -M "$PROJECT_DIR/AndroidManifest.xml" \
    -S "$PROJECT_DIR/res" \
    -I "$ANDROID_JAR" \
    --min-sdk-version 26 \
    --target-sdk-version 35 \
    --version-code 2 \
    --version-name "1.0.1"

# 2. Compile Java Source Code
echo "[2/5] Compiling Java source files..."
/usr/bin/javac -source 1.8 -target 1.8 \
    -d "$BUILD_DIR/classes" \
    -cp "$ANDROID_JAR" \
    "$BUILD_DIR/gen/com/sujalbhure/audiorip/R.java" \
    "$PROJECT_DIR/src/com/sujalbhure/audiorip/MainActivity.java"

# 3. Convert Bytecode to DEX using D8
echo "[3/5] Converting bytecode to classes.dex using D8..."
java -cp "$D8_JAR" com.android.tools.r8.D8 \
    --release \
    --min-api 26 \
    --output "$BUILD_DIR/dex" \
    --lib "$ANDROID_JAR" \
    "$BUILD_DIR/classes/com/sujalbhure/audiorip/"*.class

# 4. Package Assets, Resources, and DEX into APK
echo "[4/5] Packaging APK resources, assets and DEX..."
cd "$BUILD_DIR/dex"
/usr/bin/aapt package -f \
    -M "$PROJECT_DIR/AndroidManifest.xml" \
    -S "$PROJECT_DIR/res" \
    -A "$PROJECT_DIR/assets" \
    -I "$ANDROID_JAR" \
    -F "$BUILD_DIR/unaligned.apk" \
    --min-sdk-version 26 \
    --target-sdk-version 35 \
    --version-code 2 \
    --version-name "1.0.1"

# Add classes.dex to APK
zip -u -q "$BUILD_DIR/unaligned.apk" classes.dex
cd "$PROJECT_DIR"

# 5. Align APK to 4-byte boundaries (MUST BE BEFORE APKSIGNER)
echo "[5/5] Aligning APK with zipalign (4-byte alignment)..."
/usr/bin/zipalign -f -p 4 "$BUILD_DIR/unaligned.apk" "$BUILD_DIR/aligned.apk"

# 6. Sign APK with apksigner (v2 & v3 schemes)
KEYSTORE="$PROJECT_DIR/release.keystore"
if [ ! -f "$KEYSTORE" ]; then
    keytool -genkeypair -validity 10000 \
        -dname "CN=sujalbhure,OU=AudioRip,O=AudioRip,L=City,ST=State,C=US" \
        -keystore "$KEYSTORE" \
        -storepass "audiorip123" \
        -keypass "audiorip123" \
        -alias "audiorip" \
        -keyalg RSA \
        -keysize 2048
fi

echo "Signing APK with APK Signature Schemes v2 & v3..."
java -jar "$APKSIGNER_JAR" sign \
    --ks "$KEYSTORE" \
    --ks-pass "pass:audiorip123" \
    --ks-key-alias "audiorip" \
    --key-pass "pass:audiorip123" \
    --v1-signing-enabled true \
    --v2-signing-enabled true \
    --v3-signing-enabled true \
    --out "$OUTPUT_DIR/AudioRip.apk" \
    "$BUILD_DIR/aligned.apk"

cp "$OUTPUT_DIR/AudioRip.apk" "$PROJECT_DIR/AudioRip.apk"

echo "=== Alignment & Signature Verification ==="
/usr/bin/zipalign -c -v 4 "$OUTPUT_DIR/AudioRip.apk"
java -jar "$APKSIGNER_JAR" verify --verbose "$OUTPUT_DIR/AudioRip.apk"

echo "=========================================="
echo "SUCCESS! Android 16 Compatible APK is Ready:"
echo "File: $OUTPUT_DIR/AudioRip.apk"
echo "Size: $(du -h "$OUTPUT_DIR/AudioRip.apk" | cut -f1)"
echo "=========================================="
