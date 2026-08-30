[CmdletBinding()]
param(
    [string]$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$OutputPath = "$PSScriptRoot\..\binaries\AudioRip-v1.0.1-optimized.apk"
)

$ErrorActionPreference = 'Stop'

$buildTools = Join-Path $SdkRoot 'build-tools\35.0.0'
$androidJar = Join-Path $SdkRoot 'platforms\android-35\android.jar'
$javaHome = $env:JAVA_HOME
if (-not $javaHome) { $javaHome = 'C:\Program Files\Microsoft\jdk-17.0.18.8-hotspot' }

$aapt = Join-Path $buildTools 'aapt.exe'
$d8 = Join-Path $buildTools 'd8.bat'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$javac = Join-Path $javaHome 'bin\javac.exe'
$jar = Join-Path $javaHome 'bin\jar.exe'
$keystore = Join-Path $PSScriptRoot 'release.keystore'
$buildDir = Join-Path $PSScriptRoot 'build'

foreach ($required in @($aapt, $d8, $zipalign, $apksigner, $javac, $jar, $androidJar, $keystore)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Missing required build dependency: $required"
    }
}

$hadKeystorePassword = Test-Path Env:AUDIORIP_KEYSTORE_PASSWORD
$originalKeystorePassword = $env:AUDIORIP_KEYSTORE_PASSWORD
if (-not $env:AUDIORIP_KEYSTORE_PASSWORD) {
    $securePassword = Read-Host 'AudioRip keystore password' -AsSecureString
    $credential = [System.Management.Automation.PSCredential]::new('audiorip', $securePassword)
    $env:AUDIORIP_KEYSTORE_PASSWORD = $credential.GetNetworkCredential().Password
}

try {
    Remove-Item -LiteralPath $buildDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path "$buildDir\gen", "$buildDir\classes", "$buildDir\dex" | Out-Null
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null

    & $aapt package -f -m -J "$buildDir\gen" -M "$PSScriptRoot\AndroidManifest.xml" -S "$PSScriptRoot\res" -I $androidJar --min-sdk-version 26 --target-sdk-version 35 --version-code 2 --version-name '1.0.1'
    & $javac -source 1.8 -target 1.8 -d "$buildDir\classes" -cp $androidJar "$buildDir\gen\com\sujalbhure\audiorip\R.java" "$PSScriptRoot\src\com\sujalbhure\audiorip\MainActivity.java"

    $classFiles = Get-ChildItem -LiteralPath "$buildDir\classes\com\sujalbhure\audiorip" -Filter '*.class' | Select-Object -ExpandProperty FullName
    & $d8 --release --min-api 26 --output "$buildDir\dex" --lib $androidJar @classFiles

    & $aapt package -f -M "$PSScriptRoot\AndroidManifest.xml" -S "$PSScriptRoot\res" -A "$PSScriptRoot\assets" -I $androidJar -F "$buildDir\unaligned.apk" --min-sdk-version 26 --target-sdk-version 35 --version-code 2 --version-name '1.0.1'
    Push-Location "$buildDir\dex"
    try { & $jar --update --file "$buildDir\unaligned.apk" 'classes.dex' } finally { Pop-Location }

    & $zipalign -f -p 4 "$buildDir\unaligned.apk" "$buildDir\aligned.apk"
    & $apksigner sign --ks $keystore --ks-pass "pass:$env:AUDIORIP_KEYSTORE_PASSWORD" --ks-key-alias 'audiorip' --key-pass "pass:$env:AUDIORIP_KEYSTORE_PASSWORD" --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true --out $OutputPath "$buildDir\aligned.apk"
    & $zipalign -c -v 4 $OutputPath
    & $apksigner verify --verbose $OutputPath
    Write-Host "Built and verified: $OutputPath"
}
finally {
    if ($hadKeystorePassword) {
        $env:AUDIORIP_KEYSTORE_PASSWORD = $originalKeystorePassword
    }
    else {
        Remove-Item Env:AUDIORIP_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
    }
}
