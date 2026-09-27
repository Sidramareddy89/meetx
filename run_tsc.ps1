$ErrorActionPreference = 'Stop'
$original = [System.Environment]::CurrentDirectory
try {
    [System.Environment]::CurrentDirectory = 'e:\Meetin advisor'
    # Use cmd to run npx tsc, capturing stdout/stderr to files
    $cmd = 'cmd /c "cd /d e:\Meetin advisor && npx tsc --noEmit --pretty 2>tsc_err.txt 1>tsc_out.txt"'
    Invoke-Expression $cmd
    $stdout = [System.IO.File]::ReadAllText('tsc_out.txt')
    $stderr = [System.IO.File]::ReadAllText('tsc_err.txt')
    $combined = ($stdout + "`n" + $stderr).Trim()
    if ($combined) {
        Write-Output $combined
    } else {
        Write-Output '[tsc --noEmit] CLEAN — no errors'
    }
    Remove-Item 'tsc_out.txt', 'tsc_err.txt' -ErrorAction SilentlyContinue
} finally {
    [System.Environment]::CurrentDirectory = $original
}
