param(
    [Parameter(Mandatory = $true)][string]$AppRoot,
    [Parameter(Mandatory = $true)][string]$PortalCheckout,
    [Parameter(Mandatory = $true)][string]$StageDirectory
)

$ErrorActionPreference = 'Stop'

function Assert-NoLinks($Item) {
    while ($Item) {
        if ($Item.LinkType) { throw "Linked files and directories cannot be staged: $($Item.FullName)" }
        if ($Item -is [IO.FileInfo]) { $Item = $Item.Directory }
        else { $Item = $Item.Parent }
    }
}

function Get-CheckedDirectory($Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item -isnot [IO.DirectoryInfo]) { throw "Expected a directory: $Path" }
    Assert-NoLinks $item
    return $item.FullName
}

$AppRoot = Get-CheckedDirectory $AppRoot
$PortalCheckout = Get-CheckedDirectory $PortalCheckout
$StageDirectory = [IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($StageDirectory))
$stageParent = Get-CheckedDirectory ([IO.Path]::GetDirectoryName($StageDirectory))
$StageDirectory = Join-Path $stageParent ([IO.Path]::GetFileName($StageDirectory))
foreach ($source in @($AppRoot, $PortalCheckout)) {
    if ($StageDirectory.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or
        $StageDirectory.StartsWith($source + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Choose a new staging directory outside the app and the portal checkout.'
    }
}
if (Test-Path -LiteralPath $StageDirectory) { throw 'The staging directory must be new.' }

$manifest = Get-Item -LiteralPath (Join-Path $PortalCheckout '.openai/hosting.json')
$homepage = Get-Item -LiteralPath (Join-Path $PortalCheckout 'dist/index.html')
Assert-NoLinks $manifest
Assert-NoLinks $homepage
$hosting = Get-Content -Raw -Encoding utf8 -LiteralPath $manifest.FullName | ConvertFrom-Json
if ($hosting.project_id -ne 'appgprj_6ad794f6ede8819197bdfb67c779da3e' -or $hosting.static.directory -ne 'dist') {
    throw 'Expected the Kevin Spectrum checkout and its dist/ hosting configuration.'
}
if (Test-Path -LiteralPath (Join-Path $PortalCheckout 'dist/math')) { throw 'The portal already contains a math/ directory.' }
$before = Get-Content -Raw -Encoding utf8 -LiteralPath $homepage.FullName
if ($before -notmatch '<title>Kevin · Spectrum</title>' -or $before -notmatch '<main id="featured"' -or
    [regex]::Matches($before, '  </main>').Count -ne 1 -or $before -match 'href="/math/"') {
    throw 'The portal homepage does not match the expected project-card layout.'
}

$files = @(
    'index.html', 'app.css', 'app.js', 'bank.json', 'manifest.webmanifest', 'sw.js',
    'icons/app.ico', 'icons/icon-192.png', 'icons/icon-512.png',
    'vendor/katex/katex.min.css', 'vendor/katex/katex.min.js', 'vendor/katex/LICENSE'
)
$katexStyle = Get-Item -LiteralPath (Join-Path $AppRoot 'vendor/katex/katex.min.css')
Assert-NoLinks $katexStyle
$fontPaths = [regex]::Matches((Get-Content -Raw -LiteralPath $katexStyle.FullName), 'url\(["'']?(fonts/KaTeX_[A-Za-z0-9-]+\.(?:woff2?|ttf))["'']?\)') |
    ForEach-Object { 'vendor/katex/' + $_.Groups[1].Value } | Sort-Object -Unique
if (!$fontPaths) { throw 'KaTeX stylesheet does not list recognized font assets.' }
$files += $fontPaths
$assets = foreach ($relative in $files) {
    $file = Get-Item -LiteralPath (Join-Path $AppRoot $relative)
    if ($file -isnot [IO.FileInfo]) { throw "Expected an app file: $relative" }
    Assert-NoLinks $file
    [pscustomobject]@{ Relative = $relative; FullName = $file.FullName }
}

$bank = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $AppRoot 'bank.json') | ConvertFrom-Json
$approvedKeys = @('version', 'topics', 'questions')
if (($bank.PSObject.Properties.Name | Where-Object { $_ -notin $approvedKeys }) -or !$bank.questions -or
    ($bank.questions | Where-Object { $_.id -notmatch '^(026|028)-[a-z0-9-]+$' })) {
    throw 'The bank must contain only reviewed public MTH026 and MTH028 questions.'
}

$card = @'
    <article class="project-card">
      <a class="image-field" href="/math/" aria-label="打开期末数学自习室">
        <img src="/math/icons/icon-512.png" width="512" height="512" alt="">
      </a>
      <div class="card-copy">
        <p class="label">期末数学复习 · MTH026 + MTH028</p>
        <h2><a href="/math/">期末数学自习室</a></h2>
        <p>按知识点练习原创题，用计时模式做模拟卷，并在错题本里回看解析。</p>
        <a class="button primary" href="/math/">打开自习室</a>
      </div>
    </article>
'@
$newline = if ($before.Contains("`r`n")) { "`r`n" } else { "`n" }
$card = ($card -replace '\r?\n', $newline) + $newline
$after = $before.Replace('  </main>', $card + '  </main>')
$stagedDist = Join-Path $StageDirectory 'dist'
$mathDirectory = Join-Path $stagedDist 'math'
[IO.Directory]::CreateDirectory($mathDirectory) | Out-Null
[IO.File]::WriteAllText((Join-Path $stagedDist 'index.html'), $after, [Text.UTF8Encoding]::new($false))
foreach ($asset in $assets) {
    $destination = Join-Path $mathDirectory $asset.Relative
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
    Copy-Item -LiteralPath $asset.FullName -Destination $destination
}

[pscustomobject]@{
    Stage = $StageDirectory
    Homepage = (Join-Path $stagedDist 'index.html')
    PublicQuestionCount = @($bank.questions).Count
    AppFiles = @($assets).Count
}
