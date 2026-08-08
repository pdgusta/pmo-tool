Set-StrictMode -Version 2.0

function Get-PmoNormalizedFullPath {
    param([Parameter(Mandatory=$true)][string]$Path)
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetPathRoot($full)
    if (-not [string]::IsNullOrWhiteSpace($root) -and $full.Equals($root,[StringComparison]::OrdinalIgnoreCase)) {
        return $root
    }
    $trimmed = $full.TrimEnd([char[]]@('\','/'))
    if ([string]::IsNullOrWhiteSpace($trimmed)) { return $full }
    return $trimmed
}

function Resolve-PmoPath {
    param([Parameter(Mandatory=$true)][string]$Base, [Parameter(Mandatory=$true)][string]$Path)
    if ([System.IO.Path]::IsPathRooted($Path)) { return [System.IO.Path]::GetFullPath($Path) }
    return [System.IO.Path]::GetFullPath((Join-Path $Base $Path))
}

function Test-PmoSubPath {
    param([Parameter(Mandatory=$true)][string]$Parent, [Parameter(Mandatory=$true)][string]$Child)
    $p = Get-PmoNormalizedFullPath $Parent
    $c = Get-PmoNormalizedFullPath $Child
    if ($c.Equals($p,[System.StringComparison]::OrdinalIgnoreCase)) { return $false }
    if (-not $p.EndsWith('\',[System.StringComparison]::Ordinal)) { $p += '\' }
    return $c.StartsWith($p, [System.StringComparison]::OrdinalIgnoreCase)
}

function Test-PmoPathEqualOrSubPath {
    param([Parameter(Mandatory=$true)][string]$Parent, [Parameter(Mandatory=$true)][string]$Child)
    $parentFull = Get-PmoNormalizedFullPath $Parent
    $childFull = Get-PmoNormalizedFullPath $Child
    return $childFull.Equals($parentFull,[System.StringComparison]::OrdinalIgnoreCase) -or
        (Test-PmoSubPath $parentFull $childFull)
}

function Assert-PmoPathWithoutReparse {
    param([Parameter(Mandatory=$true)][string]$Path)
    $resolved = Get-PmoNormalizedFullPath $Path
    $current = $resolved
    if ([string]::IsNullOrWhiteSpace($current)) { throw 'Caminho vazio ou invalido.' }
    while (-not [string]::IsNullOrWhiteSpace($current)) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw "Caminho recusado por conter link, junction ou reparse point: $Path"
            }
        }
        $parent = [System.IO.Path]::GetDirectoryName($current)
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent.Equals($current,[StringComparison]::OrdinalIgnoreCase)) { break }
        $current = Get-PmoNormalizedFullPath $parent
    }
    return $resolved
}

function Assert-PmoTreeWithoutReparse {
    param([Parameter(Mandatory=$true)][string]$Path)
    $full = Assert-PmoPathWithoutReparse $Path
    if (-not (Test-Path -LiteralPath $full -PathType Container)) { return $full }
    foreach ($item in @(Get-ChildItem -LiteralPath $full -Recurse -Force)) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Arvore recusada por conter link, junction ou reparse point: $($item.FullName)"
        }
    }
    return $full
}

function Remove-PmoManagedTree {
    param(
        [Parameter(Mandatory=$true)][string]$Root,
        [Parameter(Mandatory=$true)][string]$Path
    )
    $rootFull = Assert-PmoPathWithoutReparse $Root
    $pathFull = Assert-PmoPathWithoutReparse $Path
    if (-not (Test-PmoSubPath $rootFull $pathFull)) { throw "Recusa ao remover arvore fora da raiz gerenciada: $pathFull" }
    if (Test-Path -LiteralPath $pathFull) {
        $null = Assert-PmoTreeWithoutReparse $pathFull
        Remove-Item -LiteralPath $pathFull -Recurse -Force
    }
}

function Copy-PmoFileDurable {
    param(
        [Parameter(Mandatory=$true)][string]$Source,
        [Parameter(Mandatory=$true)][string]$Destination
    )
    $sourceFull = Assert-PmoPathWithoutReparse $Source
    if (-not (Test-Path -LiteralPath $sourceFull -PathType Leaf)) { throw "Arquivo fonte ausente: $Source" }
    $destinationFull = [System.IO.Path]::GetFullPath($Destination)
    $destinationDir = Split-Path -Parent $destinationFull
    $null = Assert-PmoPathWithoutReparse $destinationDir
    if (-not (Test-Path -LiteralPath $destinationDir -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
        $null = Assert-PmoPathWithoutReparse $destinationDir
    }
    if (Test-Path -LiteralPath $destinationFull) { throw "Destino de copia duravel ja existe: $Destination" }
    $tmp = Join-Path $destinationDir ('.durable-copy-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $input = New-Object System.IO.FileStream($sourceFull,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
        try {
            $output = New-Object System.IO.FileStream($tmp,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
            try { $input.CopyTo($output); $output.Flush($true) } finally { $output.Dispose() }
        } finally { $input.Dispose() }
        [System.IO.File]::Move($tmp,$destinationFull)
        $null = Assert-PmoPathWithoutReparse $destinationFull
    } finally {
        if (Test-Path -LiteralPath $tmp -PathType Leaf) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

function Copy-PmoDirectoryDurable {
    param(
        [Parameter(Mandatory=$true)][string]$Source,
        [Parameter(Mandatory=$true)][string]$Destination
    )
    if (-not (Test-Path -LiteralPath $Source)) { return }
    $sourceFull = Assert-PmoPathWithoutReparse $Source
    if (-not (Test-Path -LiteralPath $sourceFull -PathType Container)) { throw "Fonte nao e diretorio: $Source" }
    $destinationFull = [System.IO.Path]::GetFullPath($Destination)
    $null = Assert-PmoPathWithoutReparse $destinationFull
    if (-not (Test-Path -LiteralPath $destinationFull -PathType Container)) {
        New-Item -ItemType Directory -Path $destinationFull -Force | Out-Null
        $null = Assert-PmoPathWithoutReparse $destinationFull
    }
    $items = @(Get-ChildItem -LiteralPath $sourceFull -Force -Recurse)
    foreach ($item in $items) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Diretorio fonte contem link, junction ou reparse point: $($item.FullName)"
        }
    }
    foreach ($directory in @($items | Where-Object { $_.PSIsContainer } | Sort-Object FullName)) {
        $relative = $directory.FullName.Substring($sourceFull.Length).TrimStart('\')
        $targetDirectory = Join-Path $destinationFull $relative
        if (-not (Test-Path -LiteralPath $targetDirectory -PathType Container)) { New-Item -ItemType Directory -Path $targetDirectory | Out-Null }
        $null = Assert-PmoPathWithoutReparse $targetDirectory
    }
    foreach ($file in @($items | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($sourceFull.Length).TrimStart('\')
        Copy-PmoFileDurable -Source $file.FullName -Destination (Join-Path $destinationFull $relative)
    }
}

function Read-PmoJson {
    param([Parameter(Mandatory=$true)][string]$Path, $Default = $null)
    $bak = $Path + '.replace-backup'
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -and (Test-Path -LiteralPath $bak -PathType Leaf)) {
        [System.IO.File]::Move($bak,$Path)
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $Default }
    $raw = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    if ([string]::IsNullOrWhiteSpace($raw)) { return $Default }
    try {
        $value = $raw | ConvertFrom-Json
        if (Test-Path -LiteralPath $bak -PathType Leaf) { Remove-Item -LiteralPath $bak -Force -ErrorAction SilentlyContinue }
        return $value
    } catch {
        if (Test-Path -LiteralPath $bak -PathType Leaf) {
            $backupRaw = [System.IO.File]::ReadAllText($bak,[System.Text.Encoding]::UTF8)
            $backupValue = $backupRaw | ConvertFrom-Json
            $corrupt = $Path + '.corrupt-' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
            [System.IO.File]::Move($Path,$corrupt)
            [System.IO.File]::Move($bak,$Path)
            return $backupValue
        }
        throw
    }
}

function Write-PmoJsonAtomic {
    param([Parameter(Mandatory=$true)][string]$Path, [Parameter(Mandatory=$true)]$Value)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $tmp = $Path + '.tmp-' + [Guid]::NewGuid().ToString('N')
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    try {
        $json = $Value | ConvertTo-Json -Depth 100
        $bytes = $utf8.GetBytes($json)
        $stream = New-Object System.IO.FileStream($tmp,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
        try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        if (Test-Path -LiteralPath $Path) {
            $bak = $Path + '.replace-backup'
            if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
            [System.IO.File]::Replace($tmp, $Path, $bak, $true)
            if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
        } else {
            [System.IO.File]::Move($tmp, $Path)
        }
    } finally {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

function Write-PmoBytesAtomic {
    param([Parameter(Mandatory=$true)][string]$Path, [Parameter(Mandatory=$true)][byte[]]$Bytes)
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $tmp = $Path + '.tmp-' + [Guid]::NewGuid().ToString('N')
    try {
        $stream = New-Object System.IO.FileStream($tmp,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
        try { $stream.Write($Bytes,0,$Bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
        if (Test-Path -LiteralPath $Path) {
            $bak = $Path + '.replace-backup'
            if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
            [System.IO.File]::Replace($tmp, $Path, $bak, $true)
            if (Test-Path -LiteralPath $bak) { Remove-Item -LiteralPath $bak -Force }
        } else {
            [System.IO.File]::Move($tmp, $Path)
        }
    } finally {
        if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
    }
}

function Repair-PmoAtomicBytes {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        $ExpectedSize = $null,
        [string]$ExpectedSha256 = ''
    )
    $backup = $Path + '.replace-backup'
    $hasExpectedSize = $null -ne $ExpectedSize
    $expectedHash = ([string]$ExpectedSha256).ToLowerInvariant()
    if ($expectedHash -and $expectedHash -notmatch '^[0-9a-f]{64}$') { throw 'SHA-256 esperado invalido.' }

    function Test-Candidate([string]$Candidate) {
        if (-not (Test-Path -LiteralPath $Candidate -PathType Leaf)) { return $false }
        $item = Get-Item -LiteralPath $Candidate
        if ($hasExpectedSize -and [Int64]$item.Length -ne [Int64]$ExpectedSize) { return $false }
        if ($expectedHash -and (Get-PmoSha256 $Candidate) -ne $expectedHash) { return $false }
        return $true
    }

    $targetExists = Test-Path -LiteralPath $Path -PathType Leaf
    $backupExists = Test-Path -LiteralPath $backup -PathType Leaf
    if (-not $targetExists -and $backupExists) {
        if (-not (Test-Candidate $backup)) { throw "Backup atomico de bytes invalido: $backup" }
        [System.IO.File]::Move($backup, $Path)
        return $true
    }
    if (-not $targetExists) { return $false }
    if (-not $backupExists) {
        if (($hasExpectedSize -or $expectedHash) -and -not (Test-Candidate $Path)) { return $false }
        return $true
    }

    if (Test-Candidate $Path) {
        Remove-Item -LiteralPath $backup -Force
        return $true
    }
    if (Test-Candidate $backup) {
        $corrupt = $Path + '.corrupt-' + [DateTime]::UtcNow.ToString('yyyyMMddHHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
        [System.IO.File]::Move($Path, $corrupt)
        [System.IO.File]::Move($backup, $Path)
        return $true
    }
    throw "Nem o arquivo nem seu backup atomico correspondem ao contrato esperado: $Path"
}

function Get-PmoSha256 {
    param([Parameter(Mandatory=$true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-PmoMutexName {
    param([Parameter(Mandatory=$true)][string]$InstallRoot, [ValidateSet('runtime','update')][string]$Kind)
    $canonical = (Get-PmoNormalizedFullPath $InstallRoot).ToLowerInvariant()
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($canonical)) }
    finally { $sha.Dispose() }
    $id = -join ($hash[0..11] | ForEach-Object { $_.ToString('x2') })
    return 'Local\PMOTool-' + $Kind + '-' + $id
}

function Enter-PmoMutex {
    param(
        [Parameter(Mandatory=$true)][string]$InstallRoot,
        [ValidateSet('runtime','update')][string]$Kind,
        [int]$TimeoutMs=0,
        [switch]$NoFile
    )
    $installRootFull = Assert-PmoPathWithoutReparse $InstallRoot
    $mutex = New-Object System.Threading.Mutex($false,(Get-PmoMutexName $InstallRoot $Kind))
    $acquired = $false
    try {
        try { $acquired = $mutex.WaitOne($TimeoutMs) }
        catch [System.Threading.AbandonedMutexException] { $acquired = $true }
        if (-not $acquired) { $mutex.Dispose(); return $null }
        if ($NoFile) { return [pscustomobject]@{ Mutex=$mutex } }
        $state = Join-Path $installRootFull 'state'
        $null = Assert-PmoPathWithoutReparse $state
        if (-not (Test-Path -LiteralPath $state)) { New-Item -ItemType Directory -Path $state -Force | Out-Null }
        $null = Assert-PmoPathWithoutReparse $state
        $lockPath = Join-Path $state ($Kind + '.process.lock')
        $null = Assert-PmoPathWithoutReparse $lockPath
        try {
            $stream = [System.IO.File]::Open($lockPath,[System.IO.FileMode]::OpenOrCreate,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None)
            $bytes = [System.Text.Encoding]::UTF8.GetBytes(([string]$PID + ' ' + [DateTime]::UtcNow.ToString('o')))
            $stream.SetLength(0); $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true)
        } catch {
            try { $mutex.ReleaseMutex() } catch { }
            $mutex.Dispose()
            return $null
        }
        return [pscustomobject]@{ Mutex=$mutex; Stream=$stream; Path=$lockPath }
    } catch { $mutex.Dispose(); throw }
}

function Exit-PmoMutex {
    param($Mutex)
    if ($null -eq $Mutex) { return }
    if ($Mutex.PSObject.Properties.Name -contains 'Stream') { try { $Mutex.Stream.Dispose() } catch { } }
    $named = if ($Mutex.PSObject.Properties.Name -contains 'Mutex') { $Mutex.Mutex } else { $Mutex }
    try { $named.ReleaseMutex() } catch { }
    $named.Dispose()
}

function Get-PmoDirectoryInventory {
    param([Parameter(Mandatory=$true)][string]$Root)
    $rootFull = Get-PmoNormalizedFullPath $Root
    $items = @()
    if (-not (Test-Path -LiteralPath $rootFull)) { return @() }
    $null = Assert-PmoPathWithoutReparse $rootFull
    $allItems = @(Get-ChildItem -LiteralPath $rootFull -Recurse -Force)
    foreach ($item in $allItems) {
        if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
            throw "Inventario recusou link, junction ou reparse point: $($item.FullName)"
        }
    }
    foreach ($file in @($allItems | Where-Object { -not $_.PSIsContainer } | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($rootFull.Length).TrimStart('\').Replace('\','/')
        $items += [ordered]@{
            path = $relative
            size = [Int64]$file.Length
            sha256 = Get-PmoSha256 $file.FullName
        }
    }
    return $items
}

function Test-PmoInventory {
    param([Parameter(Mandatory=$true)][string]$Root, [Parameter(Mandatory=$true)]$Files, [string[]]$AllowedExtra=@())
    $errors = @()
    $expected = @{}
    foreach ($entry in $Files) {
        $key = ([string]$entry.path).Replace('\','/').ToLowerInvariant()
        if ($expected.ContainsKey($key)) { $errors += "entrada duplicada no inventario: $($entry.path)"; continue }
        $expected[$key] = $true
        $path = Resolve-PmoPath $Root ([string]$entry.path)
        if (-not (Test-PmoSubPath $Root $path)) { $errors += "caminho fora da raiz: $($entry.path)"; continue }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { $errors += "arquivo ausente: $($entry.path)"; continue }
        $item = Get-Item -LiteralPath $path
        if ([Int64]$item.Length -ne [Int64]$entry.size) { $errors += "tamanho divergente: $($entry.path)"; continue }
        if ((Get-PmoSha256 $path) -ne ([string]$entry.sha256).ToLowerInvariant()) { $errors += "hash divergente: $($entry.path)" }
    }
    $allowed = @{}
    foreach ($extra in $AllowedExtra) { $allowed[$extra.Replace('\','/').ToLowerInvariant()] = $true }
    foreach ($actual in @(Get-PmoDirectoryInventory $Root)) {
        $key = ([string]$actual.path).ToLowerInvariant()
        if (-not $expected.ContainsKey($key) -and -not $allowed.ContainsKey($key)) { $errors += "arquivo fisico nao declarado: $($actual.path)" }
    }
    # Deixe o pipeline vazio quando nao houver erros. Assim tanto atribuicao
    # direta quanto @(Test-PmoInventory ...) preservam Count=0.
    return $errors
}

function Test-PmoArchive {
    param(
        [Parameter(Mandatory=$true)][string]$ZipPath,
        [int]$MaxEntries = 2000,
        [Int64]$MaxEntryBytes = 67108864,
        [Int64]$MaxExpandedBytes = 536870912,
        [Int64]$MaxCompressedEntryBytes = 67108864,
        [Int64]$MaxCompressedBytes = 268435456,
        [double]$MaxCompressionRatio = 200,
        # Allowlists parametrizaveis para que outros pacotes (bootstrap, por
        # exemplo) usem o mesmo validador. Os defaults sao o contrato historico
        # do pacote de runtime: nenhum chamador existente muda de comportamento.
        [string[]]$ArquivosPermitidos = @('serve.ps1','release.json','NOTICE','LICENSE','dist/pmo-tool.html','tools/portable-common.ps1','tools/update-runtime.ps1'),
        [string[]]$PrefixosPermitidos = @('templates/factory/','samples/'),
        [string[]]$DiretoriosPermitidos = @('dist','tools','templates','templates/factory','samples')
    )
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $allowedFiles = @($ArquivosPermitidos)
    $allowedDirectories = @($DiretoriosPermitidos)
    # Prefixo sem barra final casaria com irmaos ('templates/factoryX/').
    $allowedPrefixes = @()
    foreach ($prefixoBruto in @($PrefixosPermitidos)) {
        $prefixoNormalizado = ([string]$prefixoBruto).Replace('\','/')
        if ([string]::IsNullOrWhiteSpace($prefixoNormalizado)) { continue }
        if (-not $prefixoNormalizado.EndsWith('/')) { $prefixoNormalizado = $prefixoNormalizado + '/' }
        $allowedPrefixes += $prefixoNormalizado
    }
    # Nao parametrizavel: e a fronteira do G11 e vale para qualquer pacote,
    # presente ou futuro. Bloqueio vence allowlist em todos os casos abaixo.
    $blockedPrefixes = @('data/','config/','state/','logs/','staging/','versions/')
    $seen = @{}
    $errors = @()
    $count = 0
    [Int64]$total = 0
    [Int64]$compressedTotal = 0
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            $count++
            if ($count -gt $MaxEntries) { $errors += "arquivo excede $MaxEntries entradas"; break }
            $name = ([string]$entry.FullName).Replace('\','/')
            if ([string]::IsNullOrWhiteSpace($name)) { $errors += 'entrada sem nome'; continue }
            if ($name.Length -gt 240 -or $name.IndexOfAny([char[]](0..31)) -ge 0) { $errors += "nome invalido ou longo demais: $name"; continue }
            if ($name.StartsWith('/') -or $name -match '^[A-Za-z]:' -or $name.Contains(':')) { $errors += "caminho absoluto/ADS: $name"; continue }
            $isDirectory = $name.EndsWith('/')
            $canonicalName = if ($isDirectory) { $name.TrimEnd('/') } else { $name }
            if ([string]::IsNullOrWhiteSpace($canonicalName)) { $errors += "diretorio raiz explicito proibido: $name"; continue }
            $segments = $canonicalName.Split('/')
            if ($segments -contains '' -or $segments -contains '..' -or $segments -contains '.') { $errors += "path traversal/segmento vazio: $name"; continue }
            $invalidSegment = $false
            foreach ($segment in $segments) {
                if ($segment.EndsWith('.') -or $segment.EndsWith(' ') -or $segment -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$') { $invalidSegment=$true; break }
            }
            if ($invalidSegment) { $errors += "nome reservado ou nao canonico: $name"; continue }
            $key = $canonicalName.ToLowerInvariant()
            if ($seen.ContainsKey($key)) { $errors += "caminho duplicado ou colisao de caixa: $name"; continue }
            $seen[$key] = $true
            $unixType = (($entry.ExternalAttributes -shr 16) -band 0xF000)
            if ($unixType -eq 0xA000) { $errors += "link simbolico proibido: $name"; continue }
            if ($isDirectory) {
                $allowedDirectory = $allowedDirectories -contains $canonicalName
                if (-not $allowedDirectory) {
                    foreach ($prefix in $allowedPrefixes) {
                        if (($canonicalName + '/').StartsWith($prefix,[System.StringComparison]::OrdinalIgnoreCase)) { $allowedDirectory=$true; break }
                    }
                }
                foreach ($prefix in $blockedPrefixes) {
                    if (($canonicalName + '/').StartsWith($prefix,[System.StringComparison]::OrdinalIgnoreCase)) { $allowedDirectory=$false; break }
                }
                if (-not $allowedDirectory) { $errors += "diretorio fora da allowlist: $name" }
            } else {
                if ([Int64]$entry.Length -gt $MaxEntryBytes) { $errors += "entrada excede $MaxEntryBytes bytes: $name"; continue }
                if ([Int64]$entry.CompressedLength -lt 0 -or [Int64]$entry.CompressedLength -gt $MaxCompressedEntryBytes) {
                    $errors += "entrada comprimida excede $MaxCompressedEntryBytes bytes: $name"; continue
                }
                $compressedTotal += [Int64]$entry.CompressedLength
                if ($compressedTotal -gt $MaxCompressedBytes) { $errors += "conteudo comprimido excede $MaxCompressedBytes bytes"; break }
                $denominator = [Math]::Max([double]1, [double]$entry.CompressedLength)
                if ([double]$entry.Length / $denominator -gt $MaxCompressionRatio) {
                    $errors += "razao de compressao excede $MaxCompressionRatio`:1: $name"; continue
                }
                $total += [Int64]$entry.Length
                if ($total -gt $MaxExpandedBytes) { $errors += "conteudo expandido excede $MaxExpandedBytes bytes"; break }
                $allowed = $allowedFiles -contains $name
                if (-not $allowed) {
                    foreach ($prefix in $allowedPrefixes) { if ($name.StartsWith($prefix,[System.StringComparison]::OrdinalIgnoreCase)) { $allowed = $true; break } }
                }
                foreach ($prefix in $blockedPrefixes) {
                    if ($name.StartsWith($prefix,[System.StringComparison]::OrdinalIgnoreCase)) { $allowed = $false; break }
                }
                if (-not $allowed) { $errors += "entrada fora da allowlist: $name" }
            }
        }
    } finally { $archive.Dispose() }
    return [pscustomobject]@{ ok = ($errors.Count -eq 0); errors = $errors; entries = $count; expandedBytes = $total; compressedBytes = $compressedTotal }
}

function Expand-PmoArchiveSafe {
    param(
        [Parameter(Mandatory=$true)][string]$ZipPath,
        [Parameter(Mandatory=$true)][string]$Destination,
        [string[]]$ArquivosPermitidos,
        [string[]]$PrefixosPermitidos,
        [string[]]$DiretoriosPermitidos
    )
    # Revalida com a allowlist do chamador. Sem os parametros, cai no default de
    # runtime e o comportamento historico permanece intacto.
    $regrasArquivo = @{}
    foreach ($nomeRegra in @('ArquivosPermitidos','PrefixosPermitidos','DiretoriosPermitidos')) {
        if ($PSBoundParameters.ContainsKey($nomeRegra)) { $regrasArquivo[$nomeRegra] = $PSBoundParameters[$nomeRegra] }
    }
    $check = Test-PmoArchive $ZipPath @regrasArquivo
    if (-not $check.ok) { throw ('ZIP rejeitado: ' + ($check.errors -join '; ')) }
    $destinationFull = [System.IO.Path]::GetFullPath($Destination)
    if (Test-Path -LiteralPath $destinationFull) {
        if (@(Get-ChildItem -LiteralPath $destinationFull -Force).Count -gt 0) { throw 'Destino de extracao nao esta vazio.' }
    } else { New-Item -ItemType Directory -Path $destinationFull -Force | Out-Null }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        foreach ($entry in $archive.Entries) {
            $name = ([string]$entry.FullName).Replace('/','\')
            $target = [System.IO.Path]::GetFullPath((Join-Path $destinationFull $name))
            if (-not (Test-PmoSubPath $destinationFull $target)) { throw "Entrada escapou do staging: $name" }
            if ([string]::IsNullOrEmpty($entry.Name)) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
            $parent = Split-Path -Parent $target
            if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
            $tmp = $target + '.extracting'
            $source = $entry.Open()
            $dest = [System.IO.File]::Open($tmp,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
            try { $source.CopyTo($dest) } finally { $dest.Dispose(); $source.Dispose() }
            [System.IO.File]::Move($tmp,$target)
        }
    } finally { $archive.Dispose() }
}

function Copy-PmoDirectory {
    param([Parameter(Mandatory=$true)][string]$Source, [Parameter(Mandatory=$true)][string]$Destination)
    if (-not (Test-Path -LiteralPath $Source)) { return }
    if (-not (Test-Path -LiteralPath $Destination)) { New-Item -ItemType Directory -Path $Destination -Force | Out-Null }
    foreach ($item in (Get-ChildItem -LiteralPath $Source -Force)) {
        Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $Destination $item.Name) -Recurse -Force
    }
}
