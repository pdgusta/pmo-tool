# L1 — Build e release

## Artefatos e autoridade de versão

O build concatena CSS e JavaScript em ordem alfabética e os injeta nos marcadores de
`src/shell.html`, produzindo um HTML autocontido. O prefixo numérico dos módulos é parte do
contrato de dependência.

O build reproduzível recebe estes parâmetros no Windows PowerShell 5.1:

```powershell
.\build.ps1 -Version <semver> -Commit <sha> -BuildTimestamp <ISO-8601> -OutputPath <arquivo>
```

`-Verboso` apenas detalha a execução. Na ausência de parâmetros, os fallbacks são
`PMO_BUILD_VERSION`, `PMO_BUILD_COMMIT` e `PMO_BUILD_TIMESTAMP`. Uma release nunca usa relógio de
parede como identidade de build. Tag, `PMO.model.APP_VERSION` e versão solicitada precisam
coincidir.

Node.js `22.22.0` é ferramenta obrigatória e fixada apenas no ambiente de testes/build. Ele executa
as fixtures de migração e `tests/validate-built-html.mjs`, que exige exatamente um script inline,
recompila esse script com `vm.Script`, rejeita marcadores de injeção restantes e confere os
metadados de versão, commit e timestamp. Node.js e pacotes npm não entram no ZIP nem são requisito
da máquina B; o runtime publicado continua sem dependências externas.

## Pacote de runtime

`tools/New-ReleasePackage.ps1` produz:

- `pmo-tool-<semver>-windows.zip`;
- `pmo-tool-<semver>-manifest.json`;
- `pmo-tool-<semver>-windows.zip.sha256`.

O ZIP contém somente a allowlist:

- `serve.ps1`;
- `dist/pmo-tool.html`;
- `templates/factory/**`;
- `samples/**` sanitizados;
- `LICENSE` e `NOTICE` de direitos reservados;
- `tools/portable-common.ps1`;
- `tools/update-runtime.ps1`;
- `release.json`.

O pacote nunca inclui `data/`, `config/`, `state/`, `logs/`, `staging/`, fontes, `.git` ou
artefatos locais. Qualquer entrada fora da allowlist bloqueia a release.

## Manifesto

O `release.json` interno e o manifesto externo carregam, conforme sua finalidade:

- `formatVersion`, produto, versão, canal e plataforma;
- PowerShell e bootstrap mínimos;
- commit e timestamp determinístico;
- intervalo de schema lido/escrito;
- lista ordenada de arquivos com caminho normalizado, tamanho e SHA-256.

O manifesto externo permite verificar o download antes da extração. O interno permite conferir o
conteúdo extraído. Hashes provam integridade do conteúdo recebido; a autenticidade inicial depende
de HTTPS do GitHub e release imutável.

O inventário interno é completo: `release.json` declara todo arquivo do ZIP exceto ele próprio,
sem ausências, extras ou duplicidades, com caminho, tamanho e SHA-256. O manifesto externo ancora
nome, tamanho e SHA-256 do ZIP, SHA-256 do `release.json`, versão, commit e timestamp.

`tools/Test-ReleasePackage.ps1` valida nomes, allowlist, manifesto completo, hashes e segurança do
ZIP. Além dos limites expandidos, limita o arquivo ZIP, cada entrada comprimida, o total comprimido
e a razão expandido/comprimido; os defaults atuais são 132 MiB para o arquivo, 50 MiB por entrada
comprimida, 128 MiB comprimidos no total e razão máxima `200:1`. Links simbólicos no ZIP e
links/junctions/reparse points encontrados ao inventariar conteúdo materializado são recusados.
A ordem de arquivos, encoding, timestamps normalizados e metadados do ZIP permitem que duas
execuções para o mesmo commit gerem conteúdo equivalente.

## Pipeline GitHub

`.github/workflows/release.yml` executa em pull request, `main` e tags `v<semver>` usando runner
Windows e `shell: powershell`:

1. fixa Node.js `22.22.0` e executa `tests/Run-Tests.ps1`, incluindo fixtures de migração e a
   validação sintática do HTML compilado;
2. valida o índice L0/L1/L2 e seus contratos com `tools/validar-contexto.ps1 -Detalhado`;
3. exercita recuperação transacional com `tests/Test-UpdaterRecovery.ps1` e as APIs locais com
   `tests/Invoke-ServerIntegration.ps1`;
4. compara versão da tag, app e manifesto;
5. gera e testa o pacote reproduzível;
6. em tag, cria uma GitHub Release em **draft**, anexa ZIP, manifesto e checksum e encerra sem
   publicar.

Uma pessoa revisa o draft, as evidências e o plano de rollback. Somente então publica a release
estável e imutável. Prerelease e draft nunca são oferecidos à máquina B.

## Invariantes

- O repositório é público, mas não concede licença open-source; avisos legais devem permanecer.
- A máquina B consome o ZIP próprio da release, nunca `git pull` nem o source archive automático.
- Segredos, dados, anexos e configurações locais não entram no Git nem nos artefatos.
- Mudança de schema sem migrador, snapshot compatível e teste de restauração não pode ser publicada.
- O build do artefato não baixa dependências nem acessa rede; Node.js existe somente no gate de
  desenvolvimento e não altera o contrato sem runtime da aplicação.

## Gate de release

Antes da publicação humana: migrações, contexto, recuperação do updater e integração do servidor
aprovados; todos os testes verdes; pacote revalidado a partir dos assets do draft; SHA-256
conferido; conteúdo da allowlist inspecionado; restore drill aprovado; instruções de rollback
presentes; comparação de dados pré/pós-update sem divergência indevida.
