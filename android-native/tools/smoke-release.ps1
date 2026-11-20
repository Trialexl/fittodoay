param()
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$sdk = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
$adb = Join-Path $sdk 'platform-tools/adb.exe'
$emulator = Join-Path $sdk 'emulator/emulator.exe'
$serial = 'emulator-5554'
$output = Join-Path $project 'artifacts/release-install'
$buildInfo = Get-Content (Join-Path $project 'artifacts/release/build-info.json') -Raw | ConvertFrom-Json
$apk = Join-Path $project (Join-Path 'artifacts/release' $buildInfo.apk)
New-Item -ItemType Directory -Path $output -Force | Out-Null
function Wait-Boot([string]$name) {
    for ($attempt = 0; $attempt -lt 180; $attempt++) {
        $boot = (& $adb -s $serial shell getprop sys.boot_completed 2>$null | Out-String).Trim()
        if ($boot -eq '1') {
            $actual = (& $adb -s $serial shell getprop ro.boot.qemu.avd_name).Trim()
            if ($actual -ne $name) { throw "Unexpected AVD: $actual" }
            return
        }
        Start-Sleep -Seconds 2
    }
    throw "AVD did not boot: $name"
}
function Stop-TestAvd([string]$name) {
    $actual = (& $adb -s $serial shell getprop ro.boot.qemu.avd_name 2>$null | Out-String).Trim()
    if ($actual -ne $name) { throw "Refusing to stop unexpected AVD: $actual" }
    $qemuIds = @(Get-CimInstance Win32_Process -Filter "Name='qemu-system-x86_64.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($name) } | Select-Object -ExpandProperty ProcessId)
    & $adb -s $serial emu kill | Out-Null
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if ((& $adb devices | Out-String) -notmatch $serial) {
            foreach ($qemuId in $qemuIds) { if (Get-Process -Id $qemuId -ErrorAction SilentlyContinue) { Wait-Process -Id $qemuId -Timeout 30 } }
            return
        }
        Start-Sleep -Seconds 1
    }
    throw 'AVD did not stop'
}
$original = (& $adb -s $serial shell getprop ro.boot.qemu.avd_name).Trim()
if ($original -ne 'fitTODOay_API_35') { throw 'Expected the original QA emulator on port 5554' }
if (-not (Test-Path -LiteralPath $apk)) { throw 'Build the signed candidate first' }
Stop-TestAvd $original
try {
    Start-Process -FilePath $emulator -ArgumentList '-avd','fitTODOay_Release_API_35','-port','5554','-memory','2048','-cores','4','-gpu','software','-no-window','-no-audio','-no-snapshot','-timezone','Europe/Moscow' -WindowStyle Hidden -RedirectStandardOutput (Join-Path $output 'emulator-out.txt') -RedirectStandardError (Join-Path $output 'emulator-error.txt') | Out-Null
    Wait-Boot 'fitTODOay_Release_API_35'
    & $adb -s $serial install -r $apk
    if ($LASTEXITCODE) { throw 'Signed APK installation failed' }
    & $adb -s $serial logcat -c
    $launch = & $adb -s $serial shell am start -W -n com.fittodoay.android/.MainActivity
    $launch | Set-Content (Join-Path $output 'launch.txt')
    if ($LASTEXITCODE -or ($launch -join "`n") -notmatch 'Status: ok') { throw 'Release activity did not launch' }
    Start-Sleep -Seconds 3
    & $adb -s $serial shell uiautomator dump /sdcard/release-smoke.xml
    & $adb -s $serial pull /sdcard/release-smoke.xml (Join-Path $output 'ui.xml') | Out-Null
    $ui = Get-Content (Join-Path $output 'ui.xml') -Raw
    foreach ($label in @('Email','Пароль','Войти')) {
        if (-not $ui.Contains($label)) { throw "Missing native authentication field: $label" }
    }
    if ($ui -match 'android.webkit.WebView') { throw 'Unexpected WebView in the native authentication screen' }
    & $adb -s $serial shell screencap -p /sdcard/release-smoke.png
    & $adb -s $serial pull /sdcard/release-smoke.png (Join-Path $output 'auth.png') | Out-Null
    $package = & $adb -s $serial shell dumpsys package com.fittodoay.android
    $package | Set-Content (Join-Path $output 'package.txt')
    if (($package -join "`n") -match '\bDEBUGGABLE\b') { throw 'Release package is debuggable' }
    $installed = (& $adb -s $serial shell pm path com.fittodoay.android).Trim() -replace '^package:',''
    & $adb -s $serial pull $installed (Join-Path $output 'installed.apk') | Out-Null
    if ($LASTEXITCODE) { throw 'Could not verify installed APK' }
    $expected = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    $actual = (Get-FileHash (Join-Path $output 'installed.apk') -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw 'Installed APK hash differs from the candidate' }
    $log = & $adb -s $serial logcat -d -s AndroidRuntime:E
    $log | Set-Content (Join-Path $output 'runtime.txt')
    if (($log -join "`n") -match 'FATAL EXCEPTION') { throw 'Release crashed during launch' }
    @{result='passed';sha256=$actual;version=$buildInfo.version;avd='fitTODOay_Release_API_35';nativeAuth=$true;debuggable=$false;serverFlowsTested=$false} | ConvertTo-Json | Set-Content (Join-Path $output 'result.json')
    Write-Output "Signed candidate installation and native launch passed: $actual"
} finally {
    $running = (& $adb -s $serial shell getprop ro.boot.qemu.avd_name 2>$null | Out-String).Trim()
    if ($running -eq 'fitTODOay_Release_API_35') { Stop-TestAvd 'fitTODOay_Release_API_35' }
    if ((& $adb devices | Out-String) -notmatch $serial) {
        Start-Process -FilePath $emulator -ArgumentList '-avd',$original,'-port','5554','-memory','2048','-cores','4','-gpu','host','-no-snapshot','-no-audio','-no-window','-timezone','Europe/Moscow' -WindowStyle Hidden | Out-Null
        Wait-Boot $original
        & $adb -s $serial shell am start -n com.fittodoay.android/.MainActivity | Out-Null
    }
}
