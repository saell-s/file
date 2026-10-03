$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:4000/api'
$stamp = Get-Random
$owner = "owner$stamp@example.com"
$guest = "guest$stamp@example.com"
$pass = 'password123'
$script:results = @()

function Check($name, $condition, $detail = '') {
  $state = if ($condition) { 'PASS' } else { 'FAIL' }
  $script:results += [pscustomobject]@{ Step = $name; Result = $state; Detail = "$(if (-not $condition) { $detail })" }
}

function Api {
  param(
    [string]$Method = 'GET',
    [string]$Path,
    [hashtable]$Body,
    [string]$Token
  )
  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  $uri = "$base$Path"
  try {
    if ($null -ne $Body) {
      $json = $Body | ConvertTo-Json -Depth 6
      $r = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -Body $json -ContentType 'application/json' -UseBasicParsing
    } else {
      $r = Invoke-WebRequest -Uri $uri -Method $Method -Headers $headers -UseBasicParsing
    }
    $data = $null
    try { $data = $r.Content | ConvertFrom-Json } catch { $data = $r.Content }
    return [pscustomobject]@{ status = [int]$r.StatusCode; text = "$($r.Content)"; data = $data }
  } catch {
    $resp = $_.Exception.Response
    $status = 0
    $text = ''
    if ($resp) {
      $status = [int]$resp.StatusCode
      try {
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
      } catch { $text = '' }
    } else {
      $text = $_.Exception.Message
    }
    $data = $null
    try { $data = $text | ConvertFrom-Json } catch { $data = $null }
    return [pscustomobject]@{ status = $status; text = $text; data = $data }
  }
}

function MatchCount($items, $id) {
  $count = 0
  foreach ($item in @($items)) {
    if ($item -and $item.id -eq $id) { $count++ }
  }
  return $count
}

# --- auth ---
$r = Api POST '/auth/register' @{ email = $owner; password = $pass; full_name = 'Owner Demo' }
Check 'register owner' ($r.status -eq 201 -and $r.data.access_token) $r.text
$ownerToken = $r.data.access_token

$r = Api POST '/auth/register' @{ email = $guest; password = $pass; full_name = 'Guest Demo' }
Check 'register guest' ($r.status -eq 201 -and $r.data.access_token) $r.text
$guestToken = $r.data.access_token

$r = Api POST '/auth/token' @{ email = $owner; password = $pass }
Check 'login' ($r.status -eq 200 -and $r.data.access_token) $r.text
$refreshToken = $r.data.refresh_token

$r = Api POST '/auth/refresh' @{ refresh_token = $refreshToken }
Check 'refresh token' ($r.status -eq 200 -and $r.data.access_token) $r.text

$r = Api GET '/auth/me' $null $ownerToken
Check 'auth/me' ($r.status -eq 200 -and $r.data.email -eq $owner) $r.text

# --- tree ---
$r = Api POST '/nodes/folders' @{ name = 'Reports'; parent_id = $null } $ownerToken
Check 'create folder' ($r.status -eq 201 -and $r.data.type -eq 'folder') $r.text
$folderId = $r.data.id

$r = Api POST '/nodes/folders' @{ name = 'Q1'; parent_id = $folderId } $ownerToken
Check 'nested folder' ($r.status -eq 201 -and $r.data.parent_id -eq $folderId) $r.text
$childId = $r.data.id

$r = Api GET "/nodes/$childId/breadcrumbs" $null $ownerToken
$crumbs = @($r.data)
Check 'breadcrumbs' ($r.status -eq 200 -and $crumbs.Count -eq 2 -and $crumbs[0].name -eq 'Reports') "count=$($crumbs.Count) $($r.text)"

# --- upload (multipart via curl) ---
$tmp = Join-Path $env:TEMP "smoke-$stamp.txt"
Set-Content -Path $tmp -Value ('FileBox smoke test payload ' * 50) -NoNewline
$uploadArgs = @('-s', '-X', 'POST', "$base/files/upload", '-H', "Authorization: Bearer $ownerToken", '-F', "file=@$tmp;type=text/plain", '-F', "parent_id=$folderId")
$uploadText = & curl.exe @uploadArgs 2>&1 | Out-String
$uploadData = $uploadText | ConvertFrom-Json
Check 'upload file' ($uploadData.type -eq 'file' -and $uploadData.size -gt 0) $uploadText
$fileId = $uploadData.id

# --- list ---
$r = Api GET "/nodes?parent_id=$folderId" $null $ownerToken
Check 'list children' ($r.status -eq 200 -and $r.data.items.Count -eq 2) "count=$($r.data.items.Count)"

# --- range download via curl ---
$rangeOut = & curl.exe -s -D - -o "$env:TEMP\range-out.bin" -H 'Range: bytes=0-9' -H "Authorization: Bearer $ownerToken" "$base/files/$fileId/download" 2>&1 | Out-String
Check 'range download 206' ($rangeOut -match '206 Partial Content') ($rangeOut -replace "`r?`n", ' | ')

# --- preview inline via curl ---
$previewOut = & curl.exe -s -D - -o NUL -H "Authorization: Bearer $ownerToken" "$base/files/$fileId/preview" 2>&1 | Out-String
Check 'preview inline' ($previewOut -match 'Content-Disposition:\s*inline') ($previewOut -replace "`r?`n", ' | ')

# --- star / starred / search ---
$r = Api POST "/nodes/$fileId/star" $null $ownerToken
Check 'star toggle' ($r.status -eq 200 -and $r.data.is_starred -eq $true) $r.text

$r = Api GET '/nodes/starred' $null $ownerToken
$m = MatchCount $r.data.items $fileId
Check 'starred list' ($r.status -eq 200 -and $m -eq 1) "match=$m type=$($r.data.GetType().Name) total=$($r.data.total)"

$r = Api GET '/nodes/search?q=smoke' $null $ownerToken
$m = MatchCount $r.data.items $fileId
Check 'search' ($r.status -eq 200 -and $m -ge 1) "match=$m type=$($r.data.GetType().Name)"

# --- share links ---
$r = Api POST '/share/links' @{ node_id = $folderId; permission = 'viewer'; expires_in_hours = 24 } $ownerToken
Check 'create share link' ($r.status -eq 201 -and $r.data.token) $r.text
$linkId = $r.data.id
$linkToken = $r.data.token

$r = Api GET "/share/links/$linkToken/resolve"
Check 'resolve share link' ($r.status -eq 200 -and $r.data.node.id -eq $folderId) $r.text

$r = Api DELETE "/share/links/$linkId" $null $ownerToken
Check 'revoke share link' ($r.status -eq 200 -and $r.text -match 'revoked') $r.text

$r = Api GET "/share/links/$linkToken/resolve"
Check 'revoked link rejected' ($r.status -eq 404) "status $($r.status)"

# --- permissions ---
$r = Api POST '/share/permissions' @{ node_id = $folderId; email = $guest; permission = 'editor' } $ownerToken
Check 'invite collaborator' ($r.status -eq 201 -and $r.data.user.email -eq $guest) $r.text

$r = Api GET '/share/shared-with-me' $null $guestToken
$sharedCount = 0
foreach ($entry in @($r.data)) { if ($entry -and $entry.node.id -eq $folderId) { $sharedCount++ } }
Check 'shared with me' ($r.status -eq 200 -and $sharedCount -eq 1) "match=$sharedCount type=$($r.data.GetType().Name)"

$r = Api GET "/nodes?parent_id=$folderId" $null $guestToken
Check 'guest lists shared folder' ($r.status -eq 200 -and $r.data.items.Count -eq 2) "count=$($r.data.items.Count)"

$r = Api PATCH "/nodes/$folderId" @{ name = 'Hacked' } $guestToken
Check 'guest rename forbidden' ($r.status -eq 403) "status $($r.status)"

$uploadArgs2 = @('-s', '-X', 'POST', "$base/files/upload", '-H', "Authorization: Bearer $guestToken", '-F', "file=@$tmp;type=text/plain", '-F', "parent_id=$folderId")
$guestUploadText = & curl.exe @uploadArgs2 2>&1 | Out-String
$guestUpload = $guestUploadText | ConvertFrom-Json
Check 'guest upload as editor' ($guestUpload.type -eq 'file') $guestUploadText

# --- storage / activity ---
$r = Api GET '/me/storage' $null $ownerToken
Check 'storage stats' ($r.status -eq 200 -and $r.data.used_bytes -gt 0) $r.text
$r = Api GET '/me/activity' $null $ownerToken
Check 'activity log' ($r.status -eq 200 -and @($r.data).Count -gt 3) "count=$(@($r.data).Count)"

# --- trash flow ---
$r = Api DELETE "/nodes/$childId" $null $ownerToken
Check 'move to trash' ($r.status -eq 200 -and $r.data.message -match 'trash') $r.text
$r = Api GET '/trash' $null $ownerToken
$trashCount = 0
foreach ($item in @($r.data.items)) { if ($item -and $item.id -eq $childId) { $trashCount++ } }
Check 'trash list' ($r.status -eq 200 -and $trashCount -eq 1) "match=$trashCount"

$r = Api POST "/trash/$childId/restore" $null $ownerToken
Check 'restore from trash' ($r.status -eq 200 -and $r.data.message -match 'Restored') $r.text
$r = Api GET "/nodes?parent_id=$folderId" $null $ownerToken
Check 'restored item back' ($r.data.items.Count -eq 3) "count $($r.data.items.Count)"

$r = Api DELETE "/nodes/$childId" $null $ownerToken
Check 're-trash before purge' ($r.status -eq 200) $r.text
$r = Api DELETE "/trash/$childId" $null $ownerToken
Check 'purge forever' ($r.status -eq 200 -and $r.data.message -match 'permanently') $r.text

# --- account management ---
$r = Api PATCH '/me' @{ full_name = 'Owner Updated' } $ownerToken
Check 'update profile' ($r.status -eq 200 -and $r.data.full_name -eq 'Owner Updated') $r.text

$loginBodyPath = Join-Path $env:TEMP "badlogin-$stamp.json"
Set-Content -Path $loginBodyPath -Value ('{"email":"' + $owner + '","password":"wrongpass"}') -NoNewline
$badOut = & curl.exe -s -o "$env:TEMP\badlogin-body.json" -w '%{http_code}' -X POST "$base/auth/token" -H 'Content-Type: application/json' -d "@$loginBodyPath" 2>&1 | Out-String
$badBody = Get-Content "$env:TEMP\badlogin-body.json" -Raw
Check 'bad login rejected' ($badOut.Trim() -eq '401' -and $badBody -match 'Incorrect') "code=$($badOut.Trim()) body=$badBody"
Remove-Item $loginBodyPath -ErrorAction SilentlyContinue

$r = Api POST '/me/password' @{ current_password = $pass; new_password = $pass } $ownerToken
Check 'change password' ($r.status -eq 200 -and $r.data.message -match 'updated') $r.text

$r = Api GET '/nodes'
Check 'unauthenticated blocked' ($r.status -eq 401) "status $($r.status)"

Remove-Item $tmp -ErrorAction SilentlyContinue

$results | Format-Table -AutoSize -Wrap
$failed = @($results | Where-Object { $_.Result -eq 'FAIL' })
Write-Output ("TOTAL: {0}  PASSED: {1}  FAILED: {2}" -f $results.Count, ($results.Count - $failed.Count), $failed.Count)
