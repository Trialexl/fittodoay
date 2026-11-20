param(
    [ValidateSet('doctor','build','test','live-test','parity-test','full-test','lifecycle-test','layout-test','visual-test','visual-snapshot','local-data-test','workout-test','install','emulator')][string]$Action = 'doctor',
    [string]$QaCredentialsFile = (Join-Path $env:LOCALAPPDATA 'fitTODOay/cross-client-qa.json'),
    [ValidateSet('reference','phone','tablet')][string]$VisualLayout = 'reference'
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$artifactDir = Join-Path $project 'artifacts'
New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User') }
$env:ANDROID_HOME = $sdk
$env:JAVA_TOOL_OPTIONS = '-Djava.net.preferIPv4Stack=true'
$adb = Join-Path $sdk 'platform-tools/adb.exe'
function Restore-TestWindow {
    # Resizing this API 35 AVD can leave Pixel Launcher holding a stale window.
    $serial = (& $adb get-serialno).Trim()
    if ($serial.StartsWith('emulator-') -and ((& $adb shell getprop ro.boot.qemu.avd_name).Trim() -like 'fitTODOay*')) {
        & $adb shell am force-stop com.google.android.apps.nexuslauncher
    }
    & $adb shell am start -W -n com.fittodoay.android/.MainActivity
}
function Restore-TestNetwork {
    # This user-owned test AVD can leave its open Wi-Fi disconnected after an
    # offline scenario. Enabling the radio alone does not establish a route.
    $serial = (& $adb get-serialno).Trim()
    if ($serial.StartsWith('emulator-') -and ((& $adb shell getprop ro.boot.qemu.avd_name).Trim() -like 'fitTODOay*')) {
        & $adb shell svc wifi enable
        & $adb shell cmd wifi connect-network AndroidWifi open
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if ((& $adb shell cmd wifi status) -match 'Wifi is connected') { return }
            Start-Sleep -Milliseconds 500
        }
        throw 'Test AVD Wi-Fi did not reconnect; do not run online checks without a network'
    }
}
$gradle = Join-Path $env:LOCALAPPDATA 'Programs/Gradle/gradle-8.11.1/bin/gradle.bat'
if (-not (Test-Path -LiteralPath $gradle)) { $gradle = Join-Path $project 'gradlew.bat' }
$gradleArgs = @('-p', $project, '--console=plain', '--no-daemon')
$cacheInit = Join-Path $env:LOCALAPPDATA 'fitTODOay/maven-cache.init.gradle'
if (Test-Path -LiteralPath $cacheInit) {
    if (-not (Test-NetConnection 127.0.0.1 -Port 18765 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
        $node = (Get-Command node -ErrorAction Stop).Source
        $proxyScript = Join-Path $PSScriptRoot 'maven-cache.mjs'
        Start-Process -FilePath $node -ArgumentList ('"' + $proxyScript + '"') -WindowStyle Hidden
        $ready = $false
        for ($attempt = 0; $attempt -lt 10; $attempt++) {
            if (Test-NetConnection 127.0.0.1 -Port 18765 -InformationLevel Quiet -WarningAction SilentlyContinue) { $ready = $true; break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $ready) { throw 'Could not start the local Maven cache on 127.0.0.1:18765' }
    }
    $gradleArgs += @('-I', $cacheInit)
}
switch ($Action) {
    'doctor' {
        & (Join-Path $env:JAVA_HOME 'bin/java.exe') -version
        & $adb version
        & (Join-Path $sdk 'emulator/emulator.exe') -accel-check
        & $adb devices
    }
    'build' { & $gradle @gradleArgs assembleDebug; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
    { $_ -in 'test','live-test','parity-test','full-test','lifecycle-test','layout-test','visual-test','visual-snapshot','local-data-test','workout-test' } {
        & $gradle @gradleArgs assembleDebug assembleDebugAndroidTest testDebugUnitTest lintDebug
        if ($LASTEXITCODE) { exit $LASTEXITCODE }
        & $adb install -r (Join-Path $project 'app/build/outputs/apk/debug/app-debug.apk')
        if ($LASTEXITCODE) { exit $LASTEXITCODE }
        & $adb install -r (Join-Path $project 'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')
        if ($LASTEXITCODE) { exit $LASTEXITCODE }
        if ($Action -notin 'visual-snapshot','lifecycle-test','test','workout-test') { Restore-TestNetwork }
        # --no-daemon releases this build's heap before instrumentation and
        # does not stop Gradle processes belonging to other projects.
        $instrumentArgs = @('shell','am','instrument','-w')
        if ($Action -eq 'workout-test') {
            if ((& $adb shell getprop ro.boot.qemu.avd_name).Trim() -ne 'fitTODOay_API_35') { throw 'Workout verification requires the dedicated QA emulator' }
            $snapshot = Join-Path $env:LOCALAPPDATA 'fitTODOay/visual-snapshot/reference.json'
            if (-not (Test-Path -LiteralPath $snapshot)) { throw 'Synthetic reference responses are required' }
            & $adb push $snapshot /data/local/tmp/fittodoay-workout-reference.json
            & $adb shell run-as com.fittodoay.android cp /data/local/tmp/fittodoay-workout-reference.json files/visual-reference.json
            & $adb shell rm /data/local/tmp/fittodoay-workout-reference.json
            $wifiWasOn = (& $adb shell settings get global wifi_on).Trim() -eq '1'
            $dataWasOn = (& $adb shell settings get global mobile_data).Trim() -eq '1'
            try {
                & $adb shell svc wifi disable
                & $adb shell svc data disable
                $flowViewport = switch ($VisualLayout) { 'tablet' { @{Size='1600x2560';Density='240'} }; 'phone' { @{Size='720x1280';Density='320'} }; default { @{Size='786x1704';Density='320'} } }
                & $adb shell wm size $flowViewport.Size
                & $adb shell wm density $flowViewport.Density
                Restore-TestWindow
                $output = & $adb shell am instrument -w -e class com.fittodoay.android.WorkoutFlowTest -e workoutFlow true com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner
                $output | Write-Output
                $output | Set-Content -LiteralPath (Join-Path $artifactDir ('workout-flow-' + $VisualLayout + '.txt'))
                if ($LASTEXITCODE -or ($output -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed') -or -not ($output -match 'OK \(')) { throw 'Workout flow verification failed' }
            } finally {
                & $adb shell am force-stop com.fittodoay.android
                & $adb shell wm size reset
                & $adb shell wm density reset
                if ($wifiWasOn) { & $adb shell svc wifi enable; Restore-TestNetwork }
                if ($dataWasOn) { & $adb shell svc data enable }
            }
            & $adb shell am start -n com.fittodoay.android/.MainActivity
            break
        }
        if ($Action -eq 'local-data-test') {
            if ((& $adb shell getprop ro.boot.qemu.avd_name).Trim() -ne 'fitTODOay_API_35') { throw 'Local data verification requires the dedicated QA emulator' }
            $snapshot = Join-Path $env:LOCALAPPDATA 'fitTODOay/visual-snapshot/reference.json'
            if (-not (Test-Path -LiteralPath $snapshot)) { throw 'Synthetic reference responses are required' }
            & $adb push $snapshot /data/local/tmp/fittodoay-local-reference.json
            & $adb shell run-as com.fittodoay.android cp /data/local/tmp/fittodoay-local-reference.json files/visual-reference.json
            & $adb shell rm /data/local/tmp/fittodoay-local-reference.json
            $wifiWasOn = (& $adb shell settings get global wifi_on).Trim() -eq '1'
            $dataWasOn = (& $adb shell settings get global mobile_data).Trim() -eq '1'
            function Run-LocalPhase([string]$method, [string]$phase) {
                $result = & $adb shell am instrument -w -e class "com.fittodoay.android.LocalDataUiTest#$method" -e localDataPhase $phase com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner
                $result | Write-Output
                $result | Set-Content -LiteralPath (Join-Path $artifactDir "local-data-$phase.txt")
                if ($result -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed' -or -not ($result -match 'OK \(')) { throw "Local data phase failed: $phase" }
            }
            $networkDisabled = $false
            try {
                $storeTests = & $adb shell am instrument -w -e class com.fittodoay.android.LocalDataStoreTest,com.fittodoay.android.ArchiveVideoTest com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner
                $storeTests | Write-Output
                $storeTests | Set-Content -LiteralPath (Join-Path $artifactDir 'local-data-store.txt')
                if ($storeTests -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed' -or -not ($storeTests -match 'OK \(')) { throw 'Local database/media tests failed' }
                & $adb shell am force-stop com.fittodoay.android
                & $adb shell svc wifi disable
                & $adb shell svc data disable
                $networkDisabled = $true
                Start-Sleep -Seconds 2
                Run-LocalPhase 'prepareLocalAccount' 'prepare'
                & $adb shell input keyevent KEYCODE_HOME
                & $adb shell am kill com.fittodoay.android
                if ((& $adb shell pidof com.fittodoay.android | Out-String).Trim()) { throw 'Application process was not killed' }
                Run-LocalPhase 'verifyEveryV2SectionAfterProcessDeath' 'verify'
            } finally {
                try { if ($networkDisabled) { Run-LocalPhase 'restoreEnrolledSession' 'restore' } }
                finally {
                    & $adb shell am force-stop com.fittodoay.android
                    if ($wifiWasOn) { & $adb shell svc wifi enable; Restore-TestNetwork }
                    if ($dataWasOn) { & $adb shell svc data enable }
                }
            }
            & $adb shell am start -n com.fittodoay.android/.MainActivity
            break
        }
        if ($Action -eq 'layout-test') {
            $failed = $false
            try {
                foreach ($layout in @(@{Name='phone-360';Size='720x1280';Density='320'},@{Name='tablet-1067';Size='1600x2560';Density='240'})) {
                    & $adb shell wm size $layout.Size
                    & $adb shell wm density $layout.Density
                    Restore-TestWindow
                    $output = & $adb shell am instrument -w -e class 'com.fittodoay.android.LayoutParityTest,com.fittodoay.android.CalendarParityTest,com.fittodoay.android.AnalyticsParityTest' -e layoutParity true -e calendarParity true -e analyticsParity true -e layoutName $layout.Name com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner
                    $output | Write-Output
                    $output | Set-Content -LiteralPath (Join-Path $project "artifacts/layout-$($layout.Name).txt")
                    if ($output -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed' -or -not ($output -match 'OK \(')) { $failed = $true }
                }
            } finally { & $adb shell wm size reset; & $adb shell wm density reset }
            if ($failed) { exit 1 }
            & $adb shell am start -n com.fittodoay.android/.MainActivity
            break
        }
        if ($Action -eq 'visual-snapshot') {
            $viewport = switch ($VisualLayout) {
                'phone' { @{Size='720x1280';Density='320';Name='phone-360'} }
                'tablet' { @{Size='1600x2560';Density='240';Name='tablet-1067'} }
                default { @{Size='786x1704';Density='320';Name='reference'} }
            }
            $snapshot = Join-Path $env:LOCALAPPDATA 'fitTODOay/visual-snapshot/reference.json'
            if (-not (Test-Path -LiteralPath $snapshot)) { throw 'Recorded synthetic QA server responses are required' }
            & $adb push $snapshot /data/local/tmp/fittodoay-visual-reference.json
            & $adb shell run-as com.fittodoay.android cp /data/local/tmp/fittodoay-visual-reference.json files/visual-reference.json
            & $adb shell rm /data/local/tmp/fittodoay-visual-reference.json
            $wifiWasOn = (& $adb shell settings get global wifi_on).Trim() -eq '1'
            $dataWasOn = (& $adb shell settings get global mobile_data).Trim() -eq '1'
            try {
                & $adb shell svc wifi disable
                & $adb shell svc data disable
                & $adb shell wm size $viewport.Size
                & $adb shell wm density $viewport.Density
                Restore-TestWindow
                $output = & $adb shell am instrument -w -e class com.fittodoay.android.VisualSnapshotTest -e visualSnapshot true -e layoutName $viewport.Name com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner
                $output | Write-Output
                $output | Set-Content -LiteralPath (Join-Path $artifactDir ("visual-snapshot-" + $viewport.Name + ".txt"))
                if ($LASTEXITCODE -or ($output -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed') -or -not ($output -match 'OK \(')) { throw 'Offline visual snapshot verification failed' }
            } finally {
                & $adb shell wm size reset
                & $adb shell wm density reset
                if ($wifiWasOn) { & $adb shell svc wifi enable; Restore-TestNetwork }
                if ($dataWasOn) { & $adb shell svc data enable }
                & $adb shell am force-stop com.fittodoay.android
            }
            & $adb shell am start -n com.fittodoay.android/.MainActivity
            break
        }
        if ($Action -eq 'visual-test') {
            if (-not (Test-Path -LiteralPath $QaCredentialsFile)) { throw 'Dedicated cross-client QA credentials are required' }
            $visualCredentials = Get-Content -LiteralPath $QaCredentialsFile -Raw | ConvertFrom-Json
            try {
                & $adb shell wm size 786x1704
                & $adb shell wm density 320
                Restore-TestWindow
                $output = & $adb shell am instrument -w -e class com.fittodoay.android.VisualReferenceTest -e visualReference true -e qaEmail $visualCredentials.email -e qaPassword $visualCredentials.password com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner
                $output | Write-Output
                $output | Set-Content -LiteralPath (Join-Path $artifactDir 'visual-reference.txt')
                if ($LASTEXITCODE -or ($output -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed') -or -not ($output -match 'OK \(')) { throw 'Visual reference capture failed' }
            } finally { & $adb shell wm size reset; & $adb shell wm density reset }
            & $adb shell am start -n com.fittodoay.android/.MainActivity
            break
        }
        if ($Action -eq 'live-test') {
            $instrumentArgs += @('-e','class','com.fittodoay.android.LiveServerSmokeTest','-e','liveServer','true')
        }
        if ($Action -eq 'parity-test') {
            $instrumentArgs += @('-e','class','com.fittodoay.android.NativeParityTest','-e','parity','true')
        }
        if ($Action -eq 'lifecycle-test') {
            function Invoke-LifecycleCase([string]$Case, [string]$PhaseName, [string]$Phase) {
                $output = & $adb shell am instrument -w -e class "com.fittodoay.android.$Case" -e $PhaseName $Phase com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner
                $output | Write-Output
                $output | Set-Content -LiteralPath (Join-Path $artifactDir ("lifecycle-" + $Case.Replace('#','-') + '.txt'))
                if ($LASTEXITCODE -or ($output -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed') -or -not ($output -match 'OK \(')) { throw "Lifecycle case failed: $Case" }
            }
            & $adb shell pm grant com.fittodoay.android android.permission.POST_NOTIFICATIONS
            & $adb shell appops set com.fittodoay.android SCHEDULE_EXACT_ALARM allow
            Invoke-LifecycleCase 'MediaLifecycleTest#preparePausedQueue' 'mediaPhase' 'prepare'
            Invoke-LifecycleCase 'TimerLifecycleTest#prepareAlarm' 'timerPhase' 'prepare'
            & $adb shell input keyevent KEYCODE_HOME
            & $adb shell am kill com.fittodoay.android
            $remainingProcess = & $adb shell pidof com.fittodoay.android
            if ($remainingProcess) { throw 'Android kept the process alive; process-death verification is not valid' }
            Start-Sleep -Seconds 35
            Invoke-LifecycleCase 'TimerLifecycleTest#verifyAlarmAfterProcessDeath' 'timerPhase' 'verify'
            Invoke-LifecycleCase 'MediaLifecycleTest#verifyPausedQueueAfterProcessDeath' 'mediaPhase' 'verify'
            & $adb shell am start -n com.fittodoay.android/.MainActivity
            break
        }
        if ($Action -eq 'full-test') {
            if (-not (Test-Path -LiteralPath $QaCredentialsFile)) { throw "Cross-client QA credentials file is required: $QaCredentialsFile" }
            $qaCredentials = Get-Content -LiteralPath $QaCredentialsFile -Raw | ConvertFrom-Json
            if (-not $qaCredentials.email -or -not $qaCredentials.password) { throw 'QA credentials must contain email and password' }
            $classes = @('OfflineStoreTest','LiveServerSmokeTest','NativeParityTest','AiParityTest','MediaParityTest','ProgramCrudParityTest','RegistrationParityTest','CrossClientParityTest','AnalyticsParityTest','CalendarParityTest','CustomExerciseParityTest','TimedWorkoutParityTest')
            $instrumentArgs += @('-e','class',(($classes | ForEach-Object { "com.fittodoay.android.$_" }) -join ','))
            foreach ($flag in @('liveServer','parity','aiParity','mediaParity','programParity','registrationParity','crossClient','analyticsParity','calendarParity','customParity','crossRecord','timedParity')) { $instrumentArgs += @('-e',$flag,'true') }
            $instrumentArgs += @('-e','qaEmail',$qaCredentials.email,'-e','qaPassword',$qaCredentials.password,'-e','qaExpectedWeight',[string]$qaCredentials.expectedWeight)
        }
        $instrumentArgs += 'com.fittodoay.android.test/androidx.test.runner.AndroidJUnitRunner'
        $testOutput = & $adb @instrumentArgs
        $testOutput | Write-Output
        $artifactDir = Join-Path $project 'artifacts'
        New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
        $testOutput | Set-Content -LiteralPath (Join-Path $artifactDir "last-$Action.txt")
        if ($LASTEXITCODE -or ($testOutput -match 'FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=|Process crashed') -or -not ($testOutput -match 'OK \(')) { exit 1 }
        & $adb shell am start -n com.fittodoay.android/.MainActivity
    }
    'install' {
        $apk = Join-Path $project 'app/build/outputs/apk/debug/app-debug.apk'
        if (-not (Test-Path -LiteralPath $apk)) { throw 'Build the APK first: ./tools/android.ps1 build' }
        & $adb install -r $apk
        if ($LASTEXITCODE) { exit $LASTEXITCODE }
        & $adb shell am start -n com.fittodoay.android/.MainActivity
    }
    'emulator' {
        Start-Process -FilePath (Join-Path $sdk 'emulator/emulator.exe') -ArgumentList '-avd', 'fitTODOay_API_35', '-no-snapshot-load' -WindowStyle Hidden
    }
}
