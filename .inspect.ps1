Get-Process -Id 18532, 51824, 52240 -ErrorAction SilentlyContinue |
  ForEach-Object {
    '{0,-8} {1,-20} cmd={2}' -f $_.Id, $_.Name, ($_.CommandLine.Substring(0, [Math]::Min(150, $_.CommandLine.Length)))
  }
