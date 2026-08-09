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
- `pmo-tool-<semver>-windows.zip.sha256`;
- `pmo-tool-<semver>-bootstrap.zip`;
- `portable-common.ps1`;
- `pmo-instalar.ps1`.

Os três primeiros são o contrato histórico e não mudam de nome nem de forma: o updater da v1.4.1
depende deles exatamente como estão. Os três últimos são acréscimo, consumidos apenas por quem
instala do zero.

`pmo-instalar.ps1` é o único arquivo que uma máquina nova baixa, e por isso vai sem versão no nome:
a URL precisa ser previsível. Ele **não** entra no manifesto. Um hash publicado no mesmo canal não
autentica o arquivo que veio daquele canal; declará-lo daria uma falsa sensação de verificação.
A garantia real é que o instalador é curto o suficiente para ser lido antes de executado, e que
tudo o que ele carrega depois tem hash conferido.

O ZIP de runtime contém somente a allowlist:

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

## Pacote de bootstrap e helper

`pmo-tool-<semver>-bootstrap.zip` contém `pmo.ps1`, `atualizar.ps1`, `bootstrap.json`, `LICENSE`,
`NOTICE`, `tools/portable-common.ps1` e `tools/install-common.ps1` — e nada mais. São justamente
os arquivos que o ZIP de runtime **não** pode conter: mantê-los fora dele é o que impede um update
regular de substituir script de raiz. Uma instalação nova precisa deles; uma instalação existente,
nunca.

`portable-common.ps1` viaja também como asset solto, sem versão no nome. Ele é a única coisa que
um instalador consegue verificar antes de saber validar qualquer ZIP: baixa, confere o SHA-256
contra o digest do próprio GitHub e contra o manifesto, e só então carrega. Com isso o instalador
não precisa conter nenhum código de segurança de arquivo compactado.

`tools/Test-BootstrapPackage.ps1` valida esse pacote com allowlist e limites próprios, e é
independente de `Test-ReleasePackage.ps1`: cada um recusa o pacote do outro, e um artefato íntegro
não diz nada sobre o outro. Os limites são menores por natureza — 8 MiB de arquivo, 64 entradas,
4 MiB por entrada.

## Instalação a partir de uma release

`tools/pmo-instalar.ps1` monta uma instalação nova baixando os artefatos da release. A ordem existe
para resolver o problema do ovo e da galinha da confiança: ele baixa manifesto e helper, confere os
dois contra o digest SHA-256 que a API do GitHub publica, carrega o helper já verificado e só então
interpreta o manifesto e valida os pacotes. `install-common.ps1` sai do bootstrap validado, e a
materialização é a mesma função que `New-PortableInstall.ps1` usa. O instalador não contém código
próprio de validação de arquivo compactado nem de montagem de instalação.

Ele recusa release em draft, prerelease ou ainda não imutável, aceita download só por HTTPS em host
do GitHub, e trata `403` como limite de taxa por IP em vez de erro genérico. Reexecução sobre uma
instalação válida é estritamente somente leitura e orienta `pmo.ps1 -Atualizar`.

Uma instalação produzida pelo instalador é indistinguível de uma produzida pelo gerador local:
mesmo layout, mesmo inventário e mesmo pin. A única diferença é o log da execução, depositado em
`logs/` depois do commit.

O procedimento humano está em `docs/context/runbooks/instalar-maquina-nova.md`, incluindo o
pré-requisito de política de execução — que o script não consegue diagnosticar, porque
`Get-ExecutionPolicy` só responde depois que algum script já executou.

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

O manifesto externo ganhou `bootstrapArtifact` e `helperArtifact`, irmãos de `artifact`, com o
mesmo trio nome/tamanho/SHA-256. `artifact` e `runtimeManifest` permanecem intocados em nome e
forma, e é por isso que um updater da v1.4.1 continua funcionando contra uma release nova: ele
compara exatamente os campos que sempre comparou e ignora o que não conhece. Retrocompatibilidade
aqui é acréscimo, nunca renomeação.

`Assert-PmoReleaseManifest`, em `tools/portable-common.ps1`, é o contrato do lado de quem instala:
exige os quatro artefatos, recusa nome com separador de caminho e confere que cada nome
corresponde à versão declarada. Ele vive no helper, e não em `install-common.ps1`, por causa da
ordem de confiança — o helper é carregado antes de o pacote de bootstrap existir na máquina.

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
5. gera e testa os pacotes reproduzíveis, runtime e bootstrap;
6. instala **offline** a partir dos artefatos recém-gerados com `-PacoteLocal` e roda
   `pmo.ps1 -Diagnostico` na instalação resultante — o smoke test exercita os artefatos que seriam
   publicados, não os que a suíte constrói para si;
7. em tag, cria uma GitHub Release em **draft**, anexa os seis assets e encerra sem publicar.

A conferência de assets é por **allowlist nominal**, não por contagem: nome a nome, um faltante ou
um extra bloqueia a release. Contagem não diz se os arquivos são os certos e precisa ser mexida a
cada artefato novo.

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
