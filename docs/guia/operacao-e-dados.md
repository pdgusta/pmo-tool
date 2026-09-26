# Operação e dados

Onde as coisas ficam gravadas, o que sobrevive a uma atualização e os comandos de diagnóstico,
rollback e restauração.

## Onde os dados ficam

O PMO Tool usa persistência híbrida. Nada sai da máquina.

- **IndexedDB** — portfólio e blobs dos anexos, no armazenamento do navegador para a origem fixa
  `http://localhost:8090`.
- **Disco** — réplica do portfólio em `data/portfolio.json`, anexos materializados em
  `data/attachments/` e backups rotativos em `data/backups/`.
- **`data/user-templates/`** — seus templates. Os de fábrica vivem dentro da versão instalada.
- **`config/`** — configuração da instalação. **`state/`** — estado operacional do bootstrap.
- **`logs/`** — registros de operação, sem dados funcionais nem segredos.

`data/`, `config/`, `state/` e os templates do usuário **não pertencem ao runtime** de uma release
e não são substituídos em uma atualização. Anexos são materializados e verificados por tamanho e
SHA-256 antes de qualquer operação sensível.

Se a gravação em disco falhar, o aplicativo avisa na interface. Ele nunca degrada em silêncio.

## Origem fixa e instância única

A origem é sempre `http://localhost:8090`. Se a porta estiver ocupada, o launcher falha com
diagnóstico em vez de escolher outra — host ou porta diferentes criariam **outro** armazenamento de
navegador, e os dados pareceriam ter sumido.

Pelo mesmo motivo, **uma instalação por usuário e perfil de navegador**. Duas instalações do mesmo
usuário dividem o mesmo IndexedDB; a segunda detecta a divergência entre navegador e disco e abre
em somente leitura.

## Funcionamento offline

A aplicação funciona sem rede. O acesso ao GitHub serve apenas para consultar e baixar releases.
Máquinas diferentes não trocam nem sincronizam dados entre si: atualizar o aplicativo **não**
sincroniza portfólios.

Para iniciar sem sequer consultar releases:

```powershell
.\pmo.ps1 -SemAtualizacao
```

## Comandos

Execute sempre na raiz da instalação.

| Comando | Quando usar |
|---|---|
| `.\pmo.ps1` | Abrir a aplicação. |
| `.\pmo.ps1 -Diagnostico` | Conferir versão ativa, integridade do runtime, diretórios persistentes, estado da atualização e snapshots. |
| `.\pmo.ps1 -Atualizar` | Abrir o fluxo assistido de atualização. |
| `.\pmo.ps1 -SemAtualizacao` | Iniciar sem consultar releases. |
| `.\pmo.ps1 -Rollback` | Voltar ao runtime anterior quando ele é compatível com o schema atual, preservando os dados. |
| `.\pmo.ps1 -RestaurarSnapshot <id>` | Recuperar o snapshot pareado a uma atualização, quando também for preciso restaurar dados. |

Não execute diretamente o `serve.ps1` que existe dentro de uma versão. Ele é o servidor daquele
runtime e espera receber os diretórios persistentes do launcher.

## Rollback não é o mesmo que restauração

São decisões diferentes, e confundi-las causa perda de trabalho.

- **Rollback** troca apenas o ponteiro da versão ativa. Os dados continuam onde estão. Serve quando
  o problema é o código e o schema não mudou.
- **Restauração de snapshot** devolve os **dados** ao estado de antes de uma atualização. Só faz
  sentido quando o schema mudou ou os dados foram afetados.

Nunca escolha um snapshot apenas pela data. Se houve trabalho depois da atualização, preserve o
estado atual **antes** de qualquer reversão. Não apague manualmente locks, staging, logs ou
journals de recuperação: eles são o que permite retomar uma operação interrompida.

## Runbooks

Antes de um procedimento sensível, siga o roteiro correspondente:

- [Instalar em uma máquina nova](../context/runbooks/instalar-maquina-nova.md)
- [Atualizar a máquina B](../context/runbooks/atualizar-maquina-b.md)
- [Rollback e restauração](../context/runbooks/rollback-restauracao.md)
- [Tratar incidente na máquina B](../context/runbooks/incidente-maquina-b.md)
