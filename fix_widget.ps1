$ErrorActionPreference = 'Stop'
$path = 'e:\Meetin advisor\src\components\assistant\FloatingAssistantWidget.tsx'
$content = [System.IO.File]::ReadAllText($path)

# Replace the corrupted else block
$old = "    } else {" + [System.Environment]::NewLine + " }," + [System.Environment]::NewLine + "      stopListening();"
$new = "    } else {" + [System.Environment]::NewLine + "      stopListening();" + [System.Environment]::NewLine + "    }"

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($path, $content)
    Write-Output 'Fixed corrupted else block'
} else {
    Write-Output 'Pattern not found - checking partial matches...'
    # Try with different whitespace
    $old2 = "    } else {" + "`r`n" + " }," + "`r`n" + "      stopListening();"
    if ($content.Contains($old2)) {
        $content = $content.Replace($old2, $new)
        [System.IO.File]::WriteAllText($path, $content)
        Write-Output 'Fixed with CRLF'
    } else {
        Write-Output 'Could not find pattern'
        # Show context around line 171
        $lines = [System.IO.File]::ReadAllLines($path)
        Write-Output "Lines 168-178:"
        $lines[167..177] | ForEach-Object { Write-Output $_ }
    }
}
