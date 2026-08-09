<div align="center">

# PMO Tool

**Governança local de portfólio para transformar dados de projetos em decisões de PMO.**

Uma aplicação para Windows, voltada a PMO Leads que precisam consolidar projetos, acompanhar
saúde, riscos, prazos, custos e preparar informações para comitês — sem enviar o portfólio para
a nuvem.

[Versão estável](https://github.com/pdgusta/pmo-tool/releases/latest) ·
[Instalação](#instalação) ·
[Funcionalidades](#principais-benefícios-e-funcionalidades) ·
[Atualização e recuperação](#atualizações-sem-perda-de-dados) ·
[Suporte](#suporte-e-feedback)

[![Versão estável](https://img.shields.io/github/v/release/pdgusta/pmo-tool?display_name=tag&label=vers%C3%A3o%20est%C3%A1vel)](https://github.com/pdgusta/pmo-tool/releases/latest)
![Sistema: Windows](https://img.shields.io/badge/sistema-Windows-0078D4?logo=windows&logoColor=white)
![PowerShell 5.1 ou superior](https://img.shields.io/badge/PowerShell-5.1%2B-5391FE?logo=powershell&logoColor=white)
![Canal estável](https://img.shields.io/badge/canal-est%C3%A1vel-2E8B57)
[![Validação do projeto](https://github.com/pdgusta/pmo-tool/actions/workflows/release.yml/badge.svg)](https://github.com/pdgusta/pmo-tool/actions/workflows/release.yml)
[![Direitos reservados](https://img.shields.io/badge/licen%C3%A7a-direitos%20reservados-lightgrey)](LICENSE)

</div>

> **Importante — primeira instalação:** baixe **apenas** o `pmo-instalar.ps1` da release e execute.
> Não monte a instalação extraindo o ZIP anexado: aquele ZIP é o runtime consumido pelo
> atualizador, não uma instalação.

## O que é e para quem serve

O PMO Tool é uma ferramenta local de governança de portfólio para quem coordena projetos no nível
de PMO. Ele reúne informações que normalmente ficam dispersas em cronogramas, planilhas e registros
de governança, oferecendo uma visão comum para análise, priorização e prestação de contas.

Seu foco é a camada de decisão: saúde do portfólio, exceções, gates, riscos, valor, capacidade e
dinheiro. O cronograma detalhado continua sendo mantido na ferramenta de planejamento de origem e
pode ser importado por formatos compatíveis.

## Conheça o PMO Tool

As capturas abaixo usam o portfólio fictício de demonstração e apresentam algumas das principais áreas da aplicação.

### Visão executiva do portfólio

Veja rapidamente onde a liderança precisa agir, com indicadores consolidados e alertas de
governança.

![Painel executivo do PMO Tool com KPIs, farol do portfólio, curva S e alertas de governança](docs/images/readme/painel-executivo.png)

### Portfólio organizado para o trabalho diário

Alterne entre uma visão analítica em tabela e o acompanhamento visual do fluxo dos projetos.

![Portfólio do PMO Tool na visualização kanban, com projetos distribuídos por estágio](docs/images/readme/portfolio-kanban.png)

### Roadmap integrado

Enxergue o plano no tempo e identifique relações que atravessam projetos e programas.

![Roadmap do PMO Tool com projetos, marcos, gates, baseline e dependências](docs/images/readme/roadmap.png)

### Riscos e issues consolidados

Priorize exposição, pendências e responsáveis a partir de uma visão comum do portfólio.

![Riscos e issues do PMO Tool com matriz de risco 5 por 5 e registro consolidado](docs/images/readme/riscos-e-issues.png)

### Financeiro e valor agregado

Acompanhe tendências de prazo e custo com indicadores de EVM e curvas consolidadas.

![Financeiro e EVM do PMO Tool com curva S, CAPEX, OPEX e indicadores de valor agregado](docs/images/readme/financeiro-e-evm.png)

### Importação sob controle

Revise cada alteração proposta antes de incorporar dados externos ao portfólio.

![Importação e exportação no PMO Tool com área para arquivos e exemplos compatíveis](docs/images/readme/importar-e-exportar.png)

## Principais benefícios e funcionalidades

| Necessidade do PMO | Como a ferramenta ajuda |
|---|---|
| **Visão executiva** | Consolida KPIs, farol calculado, curva S e alertas de governança. |
| **Gestão do portfólio** | Organiza projetos em tabela configurável e kanban por estágio. |
| **Planejamento integrado** | Exibe roadmap, baseline, marcos, gates e dependências entre projetos. |
| **Governança stage-gate** | Acompanha o funil de gates, aprovações, pendências e atrasos. |
| **Exceções e decisões** | Mantém riscos, issues, decisões e mudanças em registros consolidados e editáveis. |
| **Prazo e custo** | Calcula indicadores de EVM, como SPI, CPI, EAC e VAC, além de CAPEX e OPEX. |
| **Capacidade e valor** | Apoia análise de recursos, capacidade, benefícios e priorização por valor e esforço. |
| **Comunicação** | Gera pacote de comitê e status reports adequados a públicos interno, executivo, auditoria e externo. |
| **Evidências** | Mantém anexos vinculados e uma trilha de auditoria das alterações. |
| **Dados confiáveis** | Importa com reconciliação e aprovação campo a campo, sem sobrescrita direta. |
| **Uso no ecossistema existente** | Exporta arquivos para uso com Excel, Outlook, MS Project, Teams e Word, sem exigir integração autenticada. |

## Instalação

### Requisitos

- Windows com PowerShell 5.1 ou superior.
- Uma pasta local e gravável, preferencialmente em volume NTFS.
- Porta `8090` disponível; a aplicação usa sempre `http://localhost:8090`.
- Um usuário local e uma única instância por instalação.
- Nenhuma dependência de runtime, como Node.js, npm, Python ou .NET SDK.

OneDrive, SharePoint, pastas de rede e mídias removíveis estão fora do suporte inicial. Use uma
pasta local: a origem fixa e os diretórios persistentes fazem parte do contrato de segurança dos
dados.

### Instalar

Baixe **apenas** o arquivo `pmo-instalar.ps1` da
[release estável](https://github.com/pdgusta/pmo-tool/releases/latest) e execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pmo-instalar.ps1 -Repositorio "pdgusta/pmo-tool"
```

Sem indicar o destino, a instalação vai para `%LOCALAPPDATA%\PMO-Tool`. **Prefira esse destino.**
Duas instalações do mesmo usuário compartilham o armazenamento do navegador em
`http://localhost:8090`; a segunda detecta a divergência e abre em somente leitura. Para instalar
em outro lugar, use `-InstallDir "D:\PMO-Tool"`; para fixar uma versão em vez da última estável,
use `-Versao 1.5.0`.

O instalador baixa a release, confere o SHA-256 de cada arquivo contra o valor publicado pelo
GitHub, instala em uma área temporária e só move para o destino final quando tudo passa. Ao final,
ele executa um diagnóstico da instalação. Se qualquer etapa falhar antes desse ponto, nada é
gravado no destino.

Se o Windows recusar executar o arquivo baixado, libere-o explicitamente com
`Unblock-File -LiteralPath .\pmo-instalar.ps1`. Se a política de execução for imposta por GPO como
`AllSigned`, o instalador não roda e é preciso falar com quem administra a política — o projeto não
assina código. O procedimento completo, com os pré-requisitos a verificar antes, está em
[Instalar em uma máquina nova](docs/context/runbooks/instalar-maquina-nova.md).

### Iniciar

Abra o PowerShell na raiz da instalação e execute:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pmo.ps1
```

O launcher abre a interface local em `http://localhost:8090`. Em usos futuros, continue iniciando
por `pmo.ps1`; não execute diretamente o `serve.ps1` que existe dentro de uma versão.

### Instalação sem acesso ao GitHub

Quando a máquina de destino não alcança o GitHub, a instalação pode ser preparada em outra máquina,
a partir do código-fonte, e copiada inteira:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\New-PortableInstall.ps1 `
  -Destination "C:\PMO-Tool" `
  -Repository "pdgusta/pmo-tool"
```

O destino precisa ser uma pasta nova ou vazia, e o resultado é idêntico ao do instalador — mesmo
layout, mesmo inventário. Por padrão, ele **não copia dados da máquina de origem**; use
`-IncludeCurrentData` apenas com intenção explícita e autorização para transportar portfólio,
anexos e templates. Copie a pasta **inteira** para a máquina de destino.

## Primeiros passos

1. Inicie a aplicação pelo `pmo.ps1`.
2. Na experiência inicial, escolha explorar os dados de demonstração, importar seus projetos ou começar do zero.
3. Configure a organização, a data de status, as pessoas e os programas.
4. Importe os arquivos necessários e revise o diff de reconciliação campo a campo antes de confirmar.
5. Confira o Painel executivo, o farol do portfólio e os alertas de governança.
6. Gere relatórios e exportações de acordo com o público que receberá a informação.
7. Para remover a demonstração e iniciar um portfólio vazio, use **Configurações → Limpar portfólio**.

## Atualizações sem perda de dados

Para verificar a instalação antes de atualizar e, depois, abrir o fluxo assistido:

```powershell
.\pmo.ps1 -Diagnostico
.\pmo.ps1 -Atualizar
```

A atualização requer consentimento. Antes de ativar a nova versão, o PMO Tool conclui a gravação
pendente, materializa e verifica os anexos, cria um snapshot completo e valida seu inventário. Em
seguida, baixa o runtime, instala a versão lado a lado e executa os health checks. Somente depois
dessas verificações o ponteiro da versão ativa é alterado.

Se alguma etapa falhar, o processo é interrompido sem ativar a nova versão — comportamento
conhecido como *fail closed*. A versão anterior e os dados persistentes permanecem separados do
novo runtime.

> **Observação:** atualizar o aplicativo não sincroniza portfólios. Cada máquina mantém dados
> independentes.

Para o procedimento operacional completo, consulte [Atualizar a máquina B](docs/context/runbooks/atualizar-maquina-b.md).

## Importação, exportação e compatibilidade

A compatibilidade atual é baseada em arquivos e em links informados pelo usuário. Não existe login
em tenant nem integração autenticada com Microsoft 365, SharePoint, Planner ou Teams.

### Formatos de importação

| Formato | Conteúdo tratado |
|---|---|
| **MSPDI/XML** | Cronograma do MS Project, incluindo WBS, tarefas, baseline, marcos, custos, progresso, predecessores e recursos disponíveis no arquivo. |
| **Primavera XER** | Projetos, WBS, atividades, relacionamentos e recursos presentes no arquivo. |
| **Primavera PMXML** | Projetos, WBS, atividades e relacionamentos presentes no XML. |
| **CSV** | Projetos e campos reconhecidos por mapeamento de colunas em português ou inglês. |
| **XLSX** | Dados de projetos e curva financeira mensal nas abas reconhecidas. |
| **Bundle JSON** | Backup nativo completo, com opção de mesclar ou substituir. |
| **`.mpp`** | **Somente metadados do documento**, como título, autor, empresa, comentários e datas. O arquivo pode ser guardado como anexo. |

Para trazer o cronograma completo de um projeto do MS Project, salve-o como **MSPDI/XML**. O PMO
Tool não lê nem gera o conteúdo de cronograma do formato binário `.mpp`.

Toda importação passa por correspondência e reconciliação. O aplicativo apresenta as mudanças
propostas campo a campo e permite escolher o que será aplicado; uma importação não sobrescreve o
portfólio diretamente.

### Exportações e uso em outras ferramentas

- CSV para análise no Excel, incluindo dados de projetos, EVM, governança, recursos e auditoria.
- Calendários `.ics` de gates e comitês, importáveis no Outlook.
- MSPDI/XML para uso no MS Project.
- Pacote de comitê e status report em HTML, prontos para impressão ou geração de PDF.
- Markdown para colar no Teams ou no Word.
- CSV de esquema para auxiliar a criação de listas no SharePoint.
- Bundle JSON para backup controlado e transporte manual.

Links para SharePoint, Planner, Teams e outras referências são colados pelo usuário e abertos no
navegador; não representam uma conexão autenticada com esses serviços.

## Privacidade, persistência e funcionamento offline

Os dados do portfólio permanecem na máquina. O PMO Tool usa persistência híbrida:

- **IndexedDB:** mantém o portfólio e os blobs dos anexos no armazenamento do navegador para a origem local fixa.
- **Disco:** replica o portfólio em `data/portfolio.json`, materializa anexos em `data/attachments/` e mantém backups rotativos em `data/backups/`.
- **Templates do usuário:** ficam em `data/user-templates/`.
- **Configuração e estado operacional:** ficam, respectivamente, em `config/` e `state/`.

Os diretórios `data/`, `config/`, `state/` e os templates do usuário não pertencem ao runtime de
uma release e não são substituídos em uma atualização. Anexos são materializados e verificados
antes das operações sensíveis.

A aplicação trabalha offline. O acesso ao GitHub é usado somente para consultar e baixar releases;
o portfólio e os anexos do usuário não são enviados ao GitHub. Máquinas diferentes não trocam nem
sincronizam dados entre si.

## Limitações conhecidas

- Não há colaboração multiusuário simultânea, autenticação de usuários ou servidor compartilhado.
- A instalação presume um usuário local e uma instância por vez. Mais de uma instalação por usuário
  e perfil de navegador está fora do suporte: elas dividem o mesmo armazenamento da origem fixa.
- O instalador e os scripts não são assinados digitalmente. A confiança vem do HTTPS do GitHub, da
  imutabilidade da release e da conferência de SHA-256 de cada arquivo baixado.
- Não há sincronização de dados entre máquinas.
- OneDrive, SharePoint, pastas de rede e mídias removíveis não são locais de instalação suportados inicialmente.
- A porta `8090` é fixa; se estiver ocupada, a aplicação interrompe a inicialização em vez de mudar a origem.
- Não há integração autenticada com Microsoft 365; a interoperabilidade ocorre por arquivos e links fornecidos pelo usuário.
- Arquivos `.mpp` fornecem apenas metadados do documento. Use MSPDI/XML para importar o cronograma completo.

## Diagnóstico, rollback e restauração

Execute os comandos abaixo sempre na raiz da instalação portátil:

```powershell
.\pmo.ps1 -SemAtualizacao
.\pmo.ps1 -Diagnostico
.\pmo.ps1 -Rollback
.\pmo.ps1 -RestaurarSnapshot <id>
```

| Comando | Quando usar |
|---|---|
| `-SemAtualizacao` | Para iniciar sem consultar releases, inclusive em uma sessão deliberadamente offline. |
| `-Diagnostico` | Para conferir versão ativa, integridade do runtime, diretórios persistentes, estado da atualização e snapshots. |
| `-Rollback` | Para voltar ao runtime anterior quando ele é compatível com o schema atual, preservando os dados existentes. |
| `-RestaurarSnapshot <id>` | Para recuperar o snapshot pareado a uma atualização quando também é necessário restaurar dados. |

Rollback de código e restauração de dados são decisões diferentes. Não escolha um snapshot apenas
pela data e não apague manualmente locks, staging, logs ou journals de recuperação. Antes de um
procedimento sensível, siga os runbooks:

- [Instalar em uma máquina nova](docs/context/runbooks/instalar-maquina-nova.md)
- [Atualizar a máquina B](docs/context/runbooks/atualizar-maquina-b.md)
- [Rollback e restauração](docs/context/runbooks/rollback-restauracao.md)
- [Tratar incidente na máquina B](docs/context/runbooks/incidente-maquina-b.md)

## Suporte e feedback

- [Baixe a versão estável e consulte o histórico no GitHub Releases](https://github.com/pdgusta/pmo-tool/releases).
- [Registre bugs, dúvidas e sugestões nas Issues do GitHub](https://github.com/pdgusta/pmo-tool/issues).
- Ao relatar um incidente, não publique o portfólio, anexos ou outros dados confidenciais.

## Documentação técnica e manutenção autorizada

Esta página prioriza o uso da aplicação. Para arquitetura, persistência, importação, releases e
recuperação, consulte o [índice de contexto técnico](docs/context/README.md) e o
[mapa de documentação](docs/context/index.json).

Para executar o código em um ambiente de desenvolvimento autorizado:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

O script compila a interface e inicia o servidor local. Para apenas gerar o HTML autocontido:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

O runtime distribuído não requer ferramentas adicionais. Os gates automatizados de teste e release
possuem requisitos próprios, documentados no repositório e no workflow de validação.

## Direitos e licença

Copyright © 2026. Todos os direitos reservados.

O código é publicamente visível para inspeção e distribuição de releases autorizadas, mas isso não
concede uma licença de código aberto nem permissão para usar, copiar, modificar ou redistribuir o
software fora dos termos autorizados. Consulte [LICENSE](LICENSE) e [NOTICE](NOTICE) para os termos
completos. O software é fornecido “no estado em que se encontra”, sem garantias.
