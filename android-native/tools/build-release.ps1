param()
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$signingRoot = Join-Path $env:LOCALAPPDATA 'fitTODOay/android-signing'
$credentialsFile = Join-Path $signingRoot 'credentials.json'
$keystore = Join-Path $signingRoot 'fittodoay-release.p12'
$fingerprintFile = Join-Path $signingRoot 'certificate.txt'
New-Item -ItemType Directory -Path $signingRoot -Force | Out-Null
if (-not (Test-Path -LiteralPath $credentialsFile)) {
    $password = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(36))
    $protected = ConvertTo-SecureString $password -AsPlainText -Force | ConvertFrom-SecureString
    @{storePasswordProtected=$protected;alias='fittodoay'} | ConvertTo-Json | Set-Content -LiteralPath $credentialsFile
    $password = $null
}
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User') }
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
$gradle = Join-Path $env:LOCALAPPDATA 'Programs/Gradle/gradle-8.11.1/bin/gradle.bat'
if (-not (Test-Path -LiteralPath $gradle)) { $gradle = Join-Path $project 'gradlew.bat' }
try {
    $credentials = Get-Content -LiteralPath $credentialsFile -Raw | ConvertFrom-Json
    $secret = ConvertTo-SecureString $credentials.storePasswordProtected
    $env:FITTODOAY_ANDROID_STORE_PASSWORD = [Net.NetworkCredential]::new('', $secret).Password
    $env:FITTODOAY_ANDROID_KEYSTORE = $keystore
    if (-not (Test-Path -LiteralPath $keystore)) {
        if (Test-Path -LiteralPath $fingerprintFile) { throw 'Restore the existing release signing key from your backup; do not replace it' }
        & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') -genkeypair -noprompt -storetype PKCS12 -keystore $keystore -alias fittodoay -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=fitTODOay Android, O=fitTODOay' -storepass:env FITTODOAY_ANDROID_STORE_PASSWORD -keypass:env FITTODOAY_ANDROID_STORE_PASSWORD
        if ($LASTEXITCODE) { throw 'Release key generation failed' }
    }
    $buildArgs = @('-p', $project, '--console=plain', '--no-daemon')
    $cacheInit = Join-Path $env:LOCALAPPDATA 'fitTODOay/maven-cache.init.gradle'
    if (Test-Path -LiteralPath $cacheInit) { $buildArgs += @('-I', $cacheInit) }
    & $gradle @buildArgs assembleRelease testReleaseUnitTest lintRelease
    if ($LASTEXITCODE) { throw 'Release build failed' }
    $apk = Join-Path $project 'app/build/outputs/apk/release/app-release.apk'
    if (-not (Test-Path -LiteralPath $apk)) { throw 'Signed release APK was not produced' }
    $certificate = & (Join-Path $sdk 'build-tools/35.0.0/apksigner.bat') verify --verbose --print-certs $apk
    if ($LASTEXITCODE) { throw 'APK signature verification failed' }
    $badging = & (Join-Path $sdk 'build-tools/35.0.0/aapt.exe') dump badging $apk
    if ($LASTEXITCODE -or ($badging -match 'application-debuggable')) { throw 'Release APK must be valid and non-debuggable' }
    $version = [regex]::Match(($badging -join "`n"), "versionName='([^']+)'").Groups[1].Value
    if (-not $version) { throw 'Could not read APK version' }
    $output = Join-Path $project 'artifacts/release'
    New-Item -ItemType Directory -Path $output -Force | Out-Null
    $fileName = "fitTODOay-$version.apk"
    $deliverable = Join-Path $output $fileName
    Copy-Item -LiteralPath $apk -Destination $deliverable -Force
    $hash = (Get-FileHash -LiteralPath $deliverable -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $fileName" | Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt')
    $sourceCommit = (& git -C $project rev-parse HEAD).Trim()
    $sourceDirty = [bool](& git -C $project status --porcelain -- .)
    @{version=$version;apk=$fileName;sha256=$hash;sourceCommit=$sourceCommit;sourceDirty=$sourceDirty;published=$false} |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'build-info.json')
    $certificate | Set-Content -LiteralPath $fingerprintFile
    $certificate | Set-Content -LiteralPath (Join-Path $output 'certificate.txt')
    Write-Output "Verified release APK: $deliverable"
    Write-Output "SHA256: $hash"
} finally {
    Remove-Item Env:FITTODOAY_ANDROID_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:FITTODOAY_ANDROID_KEYSTORE -ErrorAction SilentlyContinue
}
