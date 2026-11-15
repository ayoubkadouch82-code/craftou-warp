# Build CRAFT WARP on Windows and produce a single self-contained .exe
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$version = (Select-String -Path Cargo.toml -Pattern '^version\s*=\s*"(.*)"').Matches[0].Groups[1].Value
Write-Host "==> CRAFT WARP v$version - Windows build"
cargo build --release

New-Item -ItemType Directory -Force -Path dist | Out-Null
Copy-Item "target\release\craftwarp.exe" "dist\craftwarp-windows-x64.exe" -Force
Copy-Item README.md, LICENSE dist -Force

$size = "{0:N1} MB" -f ((Get-Item "dist\craftwarp-windows-x64.exe").Length / 1MB)
Write-Host "==> $size  dist\craftwarp-windows-x64.exe"
Write-Host "    double-click the exe, then open http://localhost:8080"
