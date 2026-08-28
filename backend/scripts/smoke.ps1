$ErrorActionPreference = 'Stop'
$API = 'http://localhost:4000/api'
$PASS = 'ChangeMe123!'

function Login($email) {
  $r = Invoke-RestMethod -Uri "$API/auth/login" -Method POST -ContentType 'application/json' -Body (@{ email = $email; password = $PASS } | ConvertTo-Json)
  if ($r.mfaRequired) { throw "MFA unexpectedly required for $email" }
  if ($r.user.mustSetupMfa) { throw "mustSetupMfa unexpectedly true for $email" }
  if (-not $r.accessToken) { throw "No token for $email" }
  return $r.accessToken
}

function ApiGet($path, $token) {
  return Invoke-RestMethod -Uri "$API$path" -Headers @{ Authorization = "Bearer $token" }
}

$accounts = @(
  @{ role = 'SUPER_ADMIN'; email = 'admin@siportal.edu' },
  @{ role = 'MANAGEMENT'; email = 'management@siportal.edu' },
  @{ role = 'ACADEMIC_ADMIN'; email = 'academic.admin@siportal.edu' },
  @{ role = 'ACCOUNTS'; email = 'accounts@siportal.edu' },
  @{ role = 'FACULTY'; email = 'priya.faculty@siportal.edu' },
  @{ role = 'STUDENT'; email = 'aarav.kumar@student.siportal.edu' },
  @{ role = 'PARENT'; email = 'parent.aarav@siportal.edu' }
)

Write-Host "=== Role logins ==="
foreach ($a in $accounts) {
  $token = Login $a.email
  $me = ApiGet '/auth/me' $token
  if ($me.role -ne $a.role) { throw "Role mismatch $($a.email): $($me.role)" }
  if ($a.role -eq 'ACCOUNTS') {
    $dash = ApiGet '/dashboard/me' $token
    if ($null -eq $dash.counts) { throw 'Accounts dashboard missing counts' }
  } else {
    $null = ApiGet '/dashboard/me' $token
  }
  Write-Host "OK $($a.role)"
}

Write-Host "=== Admin lists ==="
$admin = Login 'academic.admin@siportal.edu'
foreach ($p in @('/students?pageSize=5','/batches?pageSize=5','/exams?pageSize=5','/sessions?pageSize=5','/tasks?pageSize=5','/behaviour','/interns','/action-centre','/feed','/certificates')) {
  $null = ApiGet $p $admin
  Write-Host "OK GET $p"
}

Write-Host "=== Fees / Student exams / Faculty blocked ==="
$acc = Login 'accounts@siportal.edu'
$null = ApiGet '/fees/dashboard' $acc
Write-Host 'OK fees dashboard'
$stu = Login 'aarav.kumar@student.siportal.edu'
$exams = ApiGet '/exams?pageSize=5' $stu
if (-not $exams.items) { throw 'Student has no exams' }
Write-Host "OK student exams ($($exams.items.Count))"
$fac = Login 'priya.faculty@siportal.edu'
try {
  ApiGet '/fees/dashboard' $fac | Out-Null
  throw 'Faculty should not access fees'
} catch {
  if ($_.Exception.Message -match 'Faculty should not') { throw }
  Write-Host 'OK faculty blocked from fees'
}

Write-Host "=== Transfer + leave endpoints exist ==="
$sa = Login 'admin@siportal.edu'
$transfers = ApiGet '/batch-transfers?status=PENDING' $sa
Write-Host "OK pending transfers: $($transfers.items.Count)"
$interns = ApiGet '/interns' $admin
Write-Host "OK interns: $($interns.Count)"

Write-Host "SMOKE PASSED"
