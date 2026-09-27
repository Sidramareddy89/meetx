$f = 'src\pages\HomePage.tsx'
$l = Get-Content $f

# Fix resources block indentation (lines 123-129, 0-indexed 122-128)
$l[122] = '      resources: rawFiles.map((f) => ({'
$l[123] = '        id: `file-${Date.now()}-${f.name}`'
$l[124] = '        name: f.name,'
$l[125] = "        type: f.type || 'document',"
$l[126] = '        size: f.size,'
$l[127] = '        content: f.name,'
$l[128] = '      })), // Phase 4: background upload replaces with proper MeetingResource objects'

# Fix IIFE closing line (line 164, 0-indexed 163)
$l[163] = '    })();'

Set-Content -Path $f -Value $l
Write-Host 'Indentation fixed.'