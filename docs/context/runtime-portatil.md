# L1 — Runtime portátil

## Estado atual

O repositório suporta dois modos. No desenvolvimento, `serve.ps1` usa a raiz do checkout e aceita
defaults locais. Na instalação gerada por `tools/New-PortableInstall.ps1`, `pmo.ps1` seleciona um
runtime imutável e fornece diretórios persistentes explícitos. O layout implementado é:

```text
PMO-Tool/
  pmo.ps1
  atualizar.ps1
  bootstrap.json
  portable-install-manifest.json
  tools/portable-common.ps1
  config/install.json
  state/active.json
  state/update.json
  state/update.lock
  state/app-ready.json
  state/restore.json
  state/restore-pending.json
  state/restore-ack.json
  versions/<semver>/
    serve.ps1
    dist/pmo-tool.html
    templates/factory/
    samples/
    tools/portable-common.ps1
    tools/update-runtime.ps1
    release.json
  data/portfolio.json
  data/attachments/
  data/backups/
  data/update-backups/
  data/user-templates/
  data/recovery/
  staging/
  logs/
```

Arquivos operacionais em `state/` e `data/recovery/` aparecem somente quando a operação
correspondente existe; não fazem parte do pacote inicial de runtime.

## Propriedade e mutabilidade

- `versions/<semver>` pertence à release e é imutável depois da instalação.
- `data/` pertence ao usuário e é compartilhado entre versões locais.
- `config/` pertence à instalação; uma release regular não o substitui.
- `state/` pertence ao bootstrap e guarda somente estado operacional recuperável.
- `logs/` não contém dados funcionais nem segredos.
- `staging/` é temporário; o updater remove apenas seu diretório de trabalho validado ao concluir,
  falhar com segurança ou recuperar uma fase pré-ativação. Journal e snapshots não dependem dele.

Customização nunca ocorre dentro de `versions/`. Templates de fábrica vivem no runtime e
templates do usuário em `data/user-templates/`, com precedência do usuário em colisões lógicas.

## Launcher e servidor

O bootstrap `pmo.ps1` resolve a raiz pela própria localização, valida `install.json`, lê
`active.json` e inicia o `serve.ps1` daquela versão. Interfaces públicas:

```powershell
.\pmo.ps1
.\pmo.ps1 -Atualizar
.\pmo.ps1 -SemAtualizacao
.\pmo.ps1 -Rollback
.\pmo.ps1 -RestaurarSnapshot <id>
.\pmo.ps1 -Diagnostico
```

O servidor de runtime aceita:

```text
-DataDir -ConfigDir -StateDir -Porta -SemBuild -SemBrowser
-HealthOnly -AdminToken -ActivationId -UrlInicial
```

`ActivationId` e `UrlInicial` são parâmetros internos do bootstrap; não são comandos de operação
manual. O primeiro correlaciona uma instância recém-iniciada com o journal de ativação. Não existe
parâmetro que dispense o lock: sua propriedade pertence sempre ao processo `serve.ps1`.

No modo portátil, os três diretórios persistentes são explícitos e o build já vem pronto. Launcher,
servidor e updater resolvem `data`, `config`, `state`, `logs`, `staging` e `versions`; `config`
participa da mesma validação par a par que as demais raízes. Qualquer igualdade, ancestralidade ou
sobreposição é recusada depois da resolução canônica, inclusive quando o caminho usa `..`. A raiz,
seus ancestrais existentes e os alvos de alto risco também não podem conter reparse point. Dados
jamais ficam sob um runtime versionado. Caminhos precisam ser locais e graváveis. O primeiro suporte
assume NTFS local; OneDrive, compartilhamento de rede e mídia removível ficam fora do contrato.

A normalização preserva uma raiz de volume com seu separador, por exemplo `C:\`; ela nunca a reduz
a `C:`, que no Windows significa um caminho relativo ao diretório atual daquela unidade. Assim a
mesma configuração produz o mesmo caminho canônico independentemente do `cwd`, e uma raiz de volume
configurada indevidamente continua sendo detectada como ancestral das demais raízes.

Antes de executar uma release estável, o launcher exige `activeVersion` SemVer como filho direto
de `versions/`, recusa reparse points, valida versão/canal/plataforma e contrato de schema do
`release.json`, requisitos mínimos, `bootstrapProtocolVersion`, o pin
`activeReleaseManifestSha256` e o inventário completo de tamanho/hash sem arquivos extras. O modo
`development` usa validação estrutural separada e não representa uma instalação distribuída.

## Materialização de uma instalação

Existe uma única implementação de como uma instalação é montada:
`Install-PmoPortableFromPackages`, em `tools/install-common.ps1`. Ela recebe o pacote de runtime
e o de bootstrap, monta um staging irmão do destino, valida cada pacote com a allowlist
correspondente, gera `install.json`, `active.json` e `update.json` com o pin
`activeReleaseManifestSha256` calculado do runtime real, confere o inventário completo e comita
por rename. Falha em qualquer ponto remove o staging e não toca no destino.

Existem duas origens para esses pacotes, e apenas essas duas. `tools/New-PortableInstall.ps1`
constrói os pacotes a partir do checkout; `tools/pmo-instalar.ps1` baixa os pacotes de uma release
do GitHub. As duas chamam a mesma função, e é isso que garante que as instalações resultantes
tenham o mesmo layout, o mesmo inventário e o mesmo pin.

Montar uma instalação extraindo o ZIP de runtime à mão não é caminho suportado: aquele ZIP é o
insumo do atualizador e não contém os scripts de raiz.

`New-PortableInstall.ps1` sem `-Version` deriva a versão de `model.APP_VERSION`. Um default fixo no
script envelheceria em silêncio a cada release.

O bootstrap carrega `pmo.ps1`, `atualizar.ps1`, `bootstrap.json`, `LICENSE`, `NOTICE` e
`tools/portable-common.ps1`. Esses arquivos ficam fora do pacote de runtime por construção: é
isso que impede um update regular de substituir script de raiz. `Test-PmoArchive` aceita a
allowlist como parâmetro justamente porque os dois pacotes têm conteúdos legítimos diferentes;
a lista de prefixos bloqueados (`data/`, `config/`, `state/`, `logs/`, `staging/`, `versions/`)
não é parametrizável e vence qualquer allowlist informada pelo chamador.

## Origem e instância

A origem é sempre `http://localhost:8090`. Se a porta estiver ocupada, o launcher falha com
diagnóstico; não escolhe outra. Host ou porta diferentes criariam outro armazenamento do navegador
e fariam dados parecerem ausentes.

Uma única instância de runtime por sessão Windows é permitida pelo mutex `Local\` e pelo handle
exclusivo de `state/runtime.process.lock`, ambos derivados da raiz da instalação. `serve.ps1` é o
único proprietário desse lock durante a execução da aplicação, tanto quando iniciado por `pmo.ps1`
quanto diretamente. Apenas o health check isolado (`HealthOnly`) não participa desse lock.

Antes de qualquer recuperação, o updater tenta adquirir o mesmo mutex de runtime. A leitura inicial
é estritamente somente leitura e o lock de processo do update é aberto sem arquivo nessa fase; se o
runtime estiver ocupado, a recuperação falha sem reparar JSON, criar diretórios ou alterar
`active.json`, `update.json` ou dados. O contrato inicial assume um usuário e uma sessão interativa;
abrir a mesma instalação em outra sessão Windows permanece fora do suporte. `state/update.lock`
vincula o snapshot preparado ao PID do servidor e ao instante de criação; ele não substitui o lock
de instância.

## Contratos de configuração

`install.json` informa formato, repositório público, canal `stable`, porta 8090, intervalo de
consulta, retenção e diretórios. `bootstrap.json` informa as versões do bootstrap e do protocolo.
Valores locais sobrevivem a releases.

`active.json` informa versões e schemas ativo/anterior, versão do bootstrap, protocolo, instante
de ativação e os pins `activeReleaseManifestSha256` e `previousReleaseManifestSha256`. O launcher
confere o pin ativo em todo boot. O wrapper de atualização associa cada candidato ativo, anterior
ou indicado pelo journal ao pin correto, valida `release.json` e o inventário completo e só então
executa seu script; recalcular os hashes internos de um runtime adulterado não contorna o pin. A
gravação ocorre por temporário e troca atômica; ele é o único ponteiro alterado na ativação normal.

`release.json` informa requisitos mínimos e hashes do runtime. Bootstrap incompatível bloqueia o
update e orienta atualização manual; scripts raiz não são trocados silenciosamente.

## Gate de validação

Instalar duas versões lado a lado, iniciar cada uma com os mesmos diretórios persistentes e
confirmar origem, IDs, configurações, anexos e templates. Alterar arquivo dentro da versão deve ser
detectado pelo diagnóstico. Testar diretórios coincidentes/aninhados, reparse point, pin divergente,
inventário incompleto, versão ativa inválida, protocolo divergente, caminho com espaços, segunda
instância, rejeição do antigo `LauncherLockHeld`, recovery com runtime ocupado e nenhuma escrita,
porta ocupada, diretório sem permissão e bootstrap abaixo do mínimo. `Run-Tests.ps1` também muda o
`cwd` antes de validar uma raiz de volume e comprova que a normalização permanece absoluta.
