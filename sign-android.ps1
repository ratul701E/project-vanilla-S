# Android APK Signing Script for Vanilla

$ErrorActionPreference = "Stop"

$keytool = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot\bin\keytool.exe"
$buildToolsDir = "$env:LOCALAPPDATA\Android\Sdk\build-tools"
$apksignerBatch = (Get-ChildItem -Path $buildToolsDir -Filter apksigner.bat -Recurse | Select-Object -Last 1).FullName

if (-not (Test-Path $keytool)) {
    Write-Error "keytool.exe not found at $keytool"
}
if (-not (Test-Path $apksignerBatch)) {
    Write-Error "apksigner.bat not found in $buildToolsDir"
}

$keystorePath = "$PSScriptRoot\src-tauri\gen\android\vanilla-release.keystore"
$alias = "vanilla-release"
$storePass = "vanilla1234"

# 1. Generate Keystore if it doesn't exist
if (-not (Test-Path $keystorePath)) {
    Write-Host "Creating release keystore at $keystorePath..." -ForegroundColor Cyan
    & $keytool -genkeypair `
        -v `
        -keystore $keystorePath `
        -storepass $storePass `
        -keypass $storePass `
        -alias $alias `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -dname "CN=Vanilla, OU=Engineering, O=VanillaApp, L=Local, ST=State, C=US"
    Write-Host "Keystore created successfully." -ForegroundColor Green
} else {
    Write-Host "Using existing keystore: $keystorePath" -ForegroundColor Cyan
}

# 2. Locate APK
$releaseDir = "$PSScriptRoot\src-tauri\gen\android\app\build\outputs\apk\arm64\release"
$unsignedApk = "$releaseDir\app-arm64-release-unsigned.apk"
$signedApk = "$releaseDir\app-arm64-release-signed.apk"

if (-not (Test-Path $unsignedApk)) {
    Write-Error "Unsigned APK not found at $unsignedApk. Run 'pnpm android:release' first."
}

Write-Host "Signing APK with apksigner..." -ForegroundColor Cyan
& $apksignerBatch sign `
    --ks $keystorePath `
    --ks-pass "pass:$storePass" `
    --ks-key-alias $alias `
    --key-pass "pass:$storePass" `
    --out $signedApk `
    $unsignedApk

# 3. Verify signature
Write-Host "Verifying APK signature..." -ForegroundColor Cyan
& $apksignerBatch verify --verbose $signedApk

$apkItem = Get-Item $signedApk
$sizeMb = [Math]::Round($apkItem.Length / 1MB, 2)
Write-Host ""
Write-Host "SUCCESS: Release APK Signed Successfully!" -ForegroundColor Green
Write-Host "Signed APK Location: $signedApk ($sizeMb MB)" -ForegroundColor Yellow
Write-Host "Keystore Location: $keystorePath (Password: $storePass, Alias: $alias)" -ForegroundColor DarkGray

# 4. Check if connected device exists to install
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$devices = @(cmd.exe /c "adb devices 2>nul" | Where-Object { $_ -match "\bdevice$" })
$ErrorActionPreference = $prevEap

if ($devices.Count -gt 0) {
    Write-Host ""
    Write-Host "Connected Android device detected. Installing signed release APK..." -ForegroundColor Cyan
    adb install -r $signedApk
    Write-Host "Application successfully installed on device!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "To install on your phone:" -ForegroundColor Gray
    Write-Host "  adb install -r `"$signedApk`"" -ForegroundColor Gray
}
