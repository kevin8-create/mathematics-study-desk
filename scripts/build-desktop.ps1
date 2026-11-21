param(
    [string]$OutputPath,
    [string]$PrivateBankPath
)

$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$compilerOptions = @()
if ($PrivateBankPath) {
    $PrivateBankPath = (Resolve-Path -LiteralPath $PrivateBankPath).Path
    if (!$OutputPath) {
        $OutputPath = Join-Path (Split-Path -Parent $PrivateBankPath) 'Mathematics Study Desk - Private.exe'
    }
    $compilerOptions += '/define:PRIVATE_EDITION'
} elseif (!$OutputPath) {
    $OutputPath = Join-Path $appRoot 'desktop/dist/Mathematics Study Desk.exe'
}
$OutputPath = [IO.Path]::GetFullPath($OutputPath)
if ($PrivateBankPath -and $OutputPath.StartsWith($appRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose an output path outside the public app directory for a private build.'
}
$bankPath = Join-Path $appRoot 'bank.json'
$bank = Get-Content -Raw -Encoding utf8 -LiteralPath $bankPath | ConvertFrom-Json
if ($bank.PSObject.Properties['embeddedPrivateQuestions']) {
    throw 'The public bank must not contain embedded private questions.'
}
if ($PrivateBankPath) {
    $privateBank = Get-Content -Raw -Encoding utf8 -LiteralPath $PrivateBankPath | ConvertFrom-Json
    if ($privateBank.version -ne $bank.version -or !$privateBank.questions) {
        throw 'The private bank must use the public bank version and contain questions.'
    }
    $bank | Add-Member -NotePropertyName 'embeddedPrivateQuestions' -NotePropertyValue @($privateBank.questions)
}
$compilerDirectory = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$compiler = Join-Path $compilerDirectory 'csc.exe'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$appFiles = @('index.html', 'app.js', 'app.css', 'bank.json', 'manifest.webmanifest', 'sw.js', 'vendor/katex/LICENSE')
$assetDirectories = @('icons', 'vendor/katex', 'assets')
$assetExtensions = @('.css', '.js', '.png', '.ico', '.svg', '.webp', '.gif', '.jpg', '.jpeg', '.woff', '.woff2', '.ttf')
$resourcePath = Join-Path ([IO.Path]::GetTempPath()) ('math-finals-lab-' + [Guid]::NewGuid().ToString('N') + '.zip')

try {
    $archive = [IO.Compression.ZipFile]::Open($resourcePath, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($name in $appFiles) {
            if ($PrivateBankPath -and $name -eq 'bank.json') {
                $entry = $archive.CreateEntry($name)
                $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
                try { $writer.Write(($bank | ConvertTo-Json -Depth 100 -Compress)) }
                finally { $writer.Dispose() }
                continue
            }
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $appRoot $name), $name) | Out-Null
        }
        foreach ($name in $assetDirectories) {
            $directory = Join-Path $appRoot $name
            if (!(Test-Path -LiteralPath $directory -PathType Container)) { continue }
            $files = Get-ChildItem -LiteralPath $directory -File -Recurse | Where-Object {
                $_.Extension -in $assetExtensions -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
            }
            foreach ($file in $files) {
                $entry = $file.FullName.Substring($appRoot.Length + 1).Replace('\', '/')
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry) | Out-Null
            }
        }
    }
    finally {
        $archive.Dispose()
    }

    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($OutputPath)) | Out-Null
    & $compiler /nologo /target:winexe /optimize+ /platform:anycpu @compilerOptions `
        "/reference:$(Join-Path $compilerDirectory 'System.IO.Compression.dll')" `
        "/resource:$resourcePath,MathFinalsWeb" `
        "/win32icon:$(Join-Path $appRoot 'icons/app.ico')" "/out:$OutputPath" `
        (Join-Path $appRoot 'desktop/StudyDesk.cs')
    if ($LASTEXITCODE -ne 0) { throw "Desktop compiler exited with code $LASTEXITCODE." }
    Get-Item -LiteralPath $OutputPath
}
finally {
    if (Test-Path -LiteralPath $resourcePath) { Remove-Item -LiteralPath $resourcePath }
}
