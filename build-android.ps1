param(
    [switch]$Release
)

# Automated Android Build Script for Vanilla (Tauri v2 + Whisper)

$ErrorActionPreference = "Stop"

$buildMode = if ($Release) { "release" } else { "debug" }
Write-Host "Setting up Android build environment (Mode: $buildMode)..." -ForegroundColor Cyan

$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:LOCALAPPDATA\Android\Sdk\ndk\28.2.13676358"
$env:ANDROID_NDK = $env:NDK_HOME
$env:CMAKE_GENERATOR = "Ninja"
$env:CMAKE_TOOLCHAIN_FILE = "$PSScriptRoot\src-tauri\android-aarch64.cmake"
$env:ANDROID_PLATFORM = "24"
$llvmBin = "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:Path = "$llvmBin;" + [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")

# 1. Build Frontend
Write-Host "1/3: Bundling frontend..." -ForegroundColor Cyan
pnpm build

# 2. Cross-compile Rust, Whisper, and Audio with cargo-ndk for arm64-v8a
$cargoArgs = @("ndk", "-t", "arm64-v8a", "-o", "gen/android/app/src/main/jniLibs", "build", "--features", "custom-protocol")
if ($Release) {
    $cargoArgs += "--release"
    Write-Host "2/3: Compiling optimized Release Rust & Whisper native libraries (with embedded frontend)..." -ForegroundColor Cyan
} else {
    Write-Host "2/3: Compiling Debug Rust & Whisper native libraries (with embedded frontend)..." -ForegroundColor Cyan
}

Push-Location "$PSScriptRoot\src-tauri"
try {
    & cargo @cargoArgs
} finally {
    Pop-Location
}

# Ensure libc++_shared.so is included in jniLibs
$ndkLibCpp = "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\sysroot\usr\lib\aarch64-linux-android\libc++_shared.so"
$jniArm64 = "$PSScriptRoot\src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
if (Test-Path $ndkLibCpp) {
    Copy-Item $ndkLibCpp -Destination "$jniArm64\libc++_shared.so" -Force
}

# 3. Assemble Android APK with Gradle
$gradleTask = if ($Release) { "assembleArm64Release" } else { "assembleArm64Debug" }
Write-Host "3/3: Assembling Android APK with Gradle ($gradleTask)..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\src-tauri\gen\android"
try {
    .\gradlew.bat $gradleTask -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64
} finally {
    Pop-Location
}

# Locate output APK
$apkDir = "$PSScriptRoot\src-tauri\gen\android\app\build\outputs\apk\arm64\$buildMode"
$apkFile = $null

if ($Release) {
    if (Test-Path "$apkDir\app-arm64-release.apk") {
        $apkFile = Get-Item "$apkDir\app-arm64-release.apk"
    } elseif (Test-Path "$apkDir\app-arm64-release-unsigned.apk") {
        $apkFile = Get-Item "$apkDir\app-arm64-release-unsigned.apk"
    }
} else {
    if (Test-Path "$apkDir\app-arm64-debug.apk") {
        $apkFile = Get-Item "$apkDir\app-arm64-debug.apk"
    }
}

if ($apkFile) {
    $apkPath = $apkFile.FullName
    $sizeMb = [Math]::Round($apkFile.Length / 1MB, 2)
    Write-Host ""
    Write-Host "SUCCESS: Android ($buildMode) APK Built Successfully!" -ForegroundColor Green
    Write-Host "APK Location: $apkPath ($sizeMb MB)" -ForegroundColor Yellow

    if ($apkFile.Name -like "*unsigned*") {
        Write-Host ""
        Write-Host "Unsigned APK produced. Triggering automated signing..." -ForegroundColor Cyan
        & "$PSScriptRoot\sign-android.ps1"
    } else {
        # Check if a device is connected via ADB
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "SilentlyContinue"
        $devices = @(cmd.exe /c "adb devices 2>nul" | Where-Object { $_ -match "\bdevice$" })
        $ErrorActionPreference = $prevEap

        if ($devices.Count -gt 0) {
            Write-Host "Connected Android device detected. Installing APK..." -ForegroundColor Cyan
            adb install -r $apkPath
            Write-Host "Application successfully installed on device!" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "To install on your phone:" -ForegroundColor Gray
            Write-Host "  1. Connect your phone via USB with USB Debugging enabled" -ForegroundColor Gray
            Write-Host "  2. Run: adb install -r `"$apkPath`"" -ForegroundColor Gray
        }
    }
} else {
    Write-Error "APK file not found in $apkDir after build."
}
