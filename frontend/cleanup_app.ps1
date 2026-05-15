$file = 'D:\xampp\htdocs\Dashboard\frontend\src\App.tsx'
$lines = Get-Content $file

$startRemove = ($lines | Select-String -Pattern 'function displayStatusLabel' | Select-Object -First 1).LineNumber
$keepStart   = ($lines | Select-String -Pattern 'function inputClassName'     | Select-Object -First 1).LineNumber
$keepEnd     = ($lines | Select-String -Pattern 'function renderInlineError'  | Select-Object -First 1).LineNumber + 4
$removeRest  = ($lines | Select-String -Pattern 'function validateLogin'      | Select-Object -First 1).LineNumber

Write-Host "displayStatusLabel at: $startRemove"
Write-Host "inputClassName at:     $keepStart"
Write-Host "renderInlineError ends: $keepEnd"
Write-Host "validateLogin at:      $removeRest"
Write-Host "Total lines:           $($lines.Count)"

# Build new content: keep up to before displayStatusLabel, then the 2 keeper functions
$newLines  = $lines[0..($startRemove - 2)]              # everything before displayStatusLabel
$newLines += $lines[($keepStart - 1)..($keepEnd - 1)]   # inputClassName + renderInlineError block
$newLines += ''                                          # trailing newline

Set-Content -Path $file -Value $newLines -Encoding UTF8
Write-Host "Done. New line count: $($newLines.Count)"
