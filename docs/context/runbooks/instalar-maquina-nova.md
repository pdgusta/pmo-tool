# Runbook — instalar em uma máquina nova

Instalação do zero, a partir de uma release estável do GitHub. Este procedimento **não** atualiza
nem repara uma instalação existente; para isso, veja
[Atualizar a máquina B](atualizar-maquina-b.md).

## 1. Pré-requisitos que o script não consegue diagnosticar

Verifique **antes**, no PowerShell da máquina de destino:

```powershell
$PSVersionTable.PSVersion
Get-ExecutionPolicy -List
```

A política de execução precisa permitir rodar o instalador. Se a política efetiva for `AllSigned`
e ela vier de GPO (`MachinePolicy` ou `UserPolicy`), **não há saída pelo script**: `-ExecutionPolicy
Bypass` não vence política de domínio, e o projeto não assina código. Nesse caso, procure quem
administra a política. Esta verificação tem de ser feita antes porque `Get-ExecutionPolicy` só
responde depois que algum script já conseguiu executar.

Confirme também:

- Windows com PowerShell 5.1 ou superior;
- volume local, fixo e NTFS — o instalador recusa unidade de rede, mídia removível e pasta do
  OneDrive;
- porta 8090 livre;
- espaço em disco para o download e para a instalação.

## 2. Baixar o instalador

Baixe **apenas** `pmo-instalar.ps1` da página da release estável. É o único arquivo necessário e o
nome não muda entre versões.

O arquivo virá com Mark-of-the-Web. Se o Windows recusar executá-lo, libere explicitamente:

```powershell
Unblock-File -LiteralPath .\pmo-instalar.ps1
```

Leia o arquivo antes de executá-lo. Ele é curto de propósito: o código que decide em que confiar se
resume a TLS 1.2, uma requisição HTTPS, `Get-FileHash` e comparação. Tudo o mais vem da release,
com hash conferido.

## 3. Instalar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pmo-instalar.ps1 -Repositorio OWNER/REPOSITORY
```

Sem `-InstallDir`, o destino é `%LOCALAPPDATA%\PMO-Tool`. **Use o destino padrão.** Duas
instalações do mesmo usuário compartilham o armazenamento do navegador em `http://localhost:8090`;
a segunda detecta a divergência entre IndexedDB e disco e trava em somente leitura. O instalador
avisa quando o destino sai do canônico, mas não impede.

Para fixar uma versão específica em vez da última estável:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pmo-instalar.ps1 `
  -Repositorio OWNER/REPOSITORY -Versao 1.5.0
```

O instalador recusa release em draft, prerelease ou ainda não imutável.

## 4. O que esperar

Em ordem: preflight, descoberta da release, download e verificação do manifesto e do helper,
download e verificação dos dois pacotes, instalação em staging irmão do destino, commit por rename
e **diagnóstico obrigatório** da instalação já comitada.

Ao final, a instalação tem o mesmo layout, o mesmo inventário e o mesmo pin de uma instalação
criada por `tools/New-PortableInstall.ps1`. O log da execução fica em `logs/`.

Abrir e atualizar depois:

```powershell
.\pmo.ps1
.\pmo.ps1 -Atualizar
```

## 5. Quando algo falha

| Mensagem | O que significa | O que fazer |
|---|---|---|
| `GitHub recusou a consulta (403)` | Limite de taxa por IP, sem autenticação | Esperar alguns minutos e repetir |
| `Nao encontrado (404)` | `-Repositorio` ou `-Versao` errados | Conferir o nome `OWNER/REPOSITORY` e a tag |
| `A conexao expirou` | Rede ou proxy | Verificar conectividade e proxy corporativo |
| `A release precisa estar imutavel` | Release publicada mas ainda mutável | Aguardar; não contornar |
| `Integridade ... reprovada` | Conteúdo recebido não bate com o digest | Repetir o download; se persistir, suspeitar do canal |
| `nao esta vazio e nao parece uma instalacao` | Destino ocupado por outra coisa | Escolher outro destino; nada foi alterado |
| `Ja existe uma instalacao` | Reexecução sobre instalação válida | Usar `pmo.ps1 -Atualizar` |

Falha antes do commit não grava nada no destino e não deixa staging. Se a falha for **no
diagnóstico final**, a instalação é preservada de propósito: não há dado de usuário nela, mas
apagar evidência automaticamente contraria o contrato de recuperação. Inspecione, e remova a pasta
antes de tentar de novo.

## 6. Fora do suporte

- Mais de uma instalação por usuário e perfil de navegador.
- Instalar em OneDrive, SharePoint, pasta de rede ou mídia removível.
- Montar a instalação extraindo o ZIP de runtime à mão: ele é o insumo do atualizador, não uma
  instalação.
- `-PacoteLocal`: existe para CI e desenvolvimento e **não oferece autenticidade de canal**.
