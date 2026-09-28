import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
global.window = { PMO: {} };

const moduleKey = encodeURIComponent(import.meta.url);
await import(pathToFileURL(path.join(root, 'src', 'js', '00-util.js')).href + '?protecao-captura-tests=' + moduleKey);
await import(pathToFileURL(path.join(root, 'src', 'js', '10-model.js')).href + '?protecao-captura-tests=' + moduleKey);

const M = window.PMO.model;
const fixtureRoot = path.join(__dirname, 'fixtures', 'migrations');

function fixture(version) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'schema-v' + version + '.json'), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

let n = 0;
function verificar(mensagem, fn) {
  fn();
  n += 1;
}

/* ===================================================== bundleAposLimpeza */

// Fixture v4 migrada + entradas fictícias extras de auditLog/imports, para
// provar que a preservação mantém ids, ordem e conteúdo mesmo com múltiplas
// entradas (não só a única que já vem na fixture).
const base = M.migrar(fixture(4));
base.auditLog.push(
  { id: 'aud-extra-1', em: '2026-01-01T00:00:00.000Z', ator: 'PMO Lead', acao: 'fixture extra 1',
    entidade: null, entidadeId: null, resumo: 'evento fictício 1', campos: null },
  { id: 'aud-extra-2', em: '2026-01-02T00:00:00.000Z', ator: 'PMO Lead', acao: 'fixture extra 2',
    entidade: null, entidadeId: null, resumo: 'evento fictício 2', campos: null }
);
base.imports.push(
  { id: 'imp-extra-1', em: '2026-01-01T00:00:00.000Z', kind: 'fixture', fileName: 'fixture-extra.json',
    resumo: 'import fictício extra' }
);

const bundleOrigem = clone(base);
const resultado = M.bundleAposLimpeza(base);

verificar('bundleAposLimpeza preserva auditLog byte a byte (ids, ordem, conteúdo)', function () {
  assert.deepStrictEqual(resultado.auditLog, bundleOrigem.auditLog, 'auditLog divergiu após a limpeza');
});

verificar('bundleAposLimpeza preserva imports byte a byte (ids, ordem, conteúdo)', function () {
  assert.deepStrictEqual(resultado.imports, bundleOrigem.imports, 'imports divergiu após a limpeza');
});

verificar('bundleAposLimpeza zera projetos, programas, pessoas, anexos e visoesSalvas', function () {
  assert.deepStrictEqual(resultado.projetos, [], 'projetos deveria estar vazio');
  assert.deepStrictEqual(resultado.programas, [], 'programas deveria estar vazio');
  assert.deepStrictEqual(resultado.pessoas, [], 'pessoas deveria estar vazio');
  assert.deepStrictEqual(resultado.anexos, [], 'anexos deveria estar vazio');
  assert.deepStrictEqual(resultado.visoesSalvas, [], 'visoesSalvas deveria estar vazio');
});

verificar('bundleAposLimpeza nunca muta o argumento recebido', function () {
  assert.deepStrictEqual(base, bundleOrigem, 'o bundle de origem foi mutado por bundleAposLimpeza');
});

verificar('M.migrar do resultado de bundleAposLimpeza não lança exceção', function () {
  assert.doesNotThrow(function () { M.migrar(resultado); });
});

verificar('bundleAposLimpeza de bundle sem auditLog/imports devolve arrays vazios sem exceção', function () {
  const semColecoes = clone(fixture(4));
  delete semColecoes.auditLog;
  delete semColecoes.imports;
  let vazio;
  assert.doesNotThrow(function () { vazio = M.bundleAposLimpeza(semColecoes); });
  assert.deepStrictEqual(vazio.auditLog, [], 'auditLog deveria virar array vazio quando ausente na origem');
  assert.deepStrictEqual(vazio.imports, [], 'imports deveria virar array vazio quando ausente na origem');
});

verificar('bundle vazio (portfolioVazio) passa em M.migrar depois da limpeza', function () {
  const vazio = M.bundleAposLimpeza(M.portfolioVazio());
  assert.doesNotThrow(function () { M.migrar(vazio); });
});

/* ======================================================== temDadoAProteger */

verificar('temDadoAProteger: bundle vazio -> falso', function () {
  assert.strictEqual(M.temDadoAProteger(M.portfolioVazio()), false);
});

verificar('temDadoAProteger: só auditLog/imports -> falso (não contam como dado a proteger)', function () {
  const b = M.portfolioVazio();
  b.auditLog = [{ id: 'aud-1', acao: 'fixture' }];
  b.imports = [{ id: 'imp-1', kind: 'fixture' }];
  assert.strictEqual(M.temDadoAProteger(b), false);
});

verificar('temDadoAProteger: um projeto -> verdadeiro', function () {
  const b = M.portfolioVazio();
  b.projetos = [{ id: 'prj-1', codigo: 'PRJ-1', nome: 'Projeto fictício' }];
  assert.strictEqual(M.temDadoAProteger(b), true);
});

verificar('temDadoAProteger: só um anexo -> verdadeiro', function () {
  const b = M.portfolioVazio();
  b.anexos = [{ id: 'anx-1', nomeArquivo: 'fixture.txt' }];
  assert.strictEqual(M.temDadoAProteger(b), true);
});

/* ============================================================ mesclarTrilha
   PROT-02 (D-32 item 2, P-08): funcao pura de uniao por id de duas trilhas
   (auditLog ou imports), usada por "Substituir portfolio por bundle
   importado". Fixtures ficticias com ids no formato aud-teste-N / imp-teste-N. */

function entradaAud(id, em, extra) {
  const base = { id: id, ator: 'PMO Lead', acao: 'fixture', entidade: null,
    entidadeId: null, resumo: 'evento fictício ' + id, campos: null };
  if (em !== undefined) { base.em = em; }
  return Object.assign(base, extra || {});
}

function entradaImp(id, em, extra) {
  const base = { id: id, kind: 'fixture', fileName: 'fixture-' + id + '.json',
    resumo: 'import fictício ' + id };
  if (em !== undefined) { base.em = em; }
  return Object.assign(base, extra || {});
}

verificar('mesclarTrilha: dois lados vazios -> lista vazia, contadores zero', function () {
  const r = M.mesclarTrilha([], []);
  assert.deepStrictEqual(r, { lista: [], adicionadas: 0, ignoradasPorIdRepetido: 0 });
});

verificar('mesclarTrilha: dois lados nao-array -> lista vazia, contadores zero', function () {
  const r = M.mesclarTrilha(null, undefined);
  assert.deepStrictEqual(r, { lista: [], adicionadas: 0, ignoradasPorIdRepetido: 0 });
});

verificar('mesclarTrilha: so local -> resultado igual ao local', function () {
  const local = [
    entradaAud('aud-teste-1', '2026-01-01T00:00:00.000Z'),
    entradaAud('aud-teste-2', '2026-01-02T00:00:00.000Z')
  ];
  const r = M.mesclarTrilha(local, []);
  assert.deepStrictEqual(r.lista, local);
  assert.strictEqual(r.adicionadas, 0);
  assert.strictEqual(r.ignoradasPorIdRepetido, 0);
});

verificar('mesclarTrilha: so arquivo -> resultado igual ao arquivo, ordenado por em', function () {
  const doArquivo = [
    entradaImp('imp-teste-2', '2026-02-02T00:00:00.000Z'),
    entradaImp('imp-teste-1', '2026-02-01T00:00:00.000Z')
  ];
  const r = M.mesclarTrilha([], doArquivo);
  assert.deepStrictEqual(r.lista, [doArquivo[1], doArquivo[0]]);
  assert.strictEqual(r.adicionadas, 2);
  assert.strictEqual(r.ignoradasPorIdRepetido, 0);
});

verificar('mesclarTrilha: ids disjuntos -> tamanho = soma, entrada local identica', function () {
  const local = [entradaAud('aud-teste-3', '2026-01-03T00:00:00.000Z')];
  const doArquivo = [entradaAud('aud-teste-4', '2026-01-04T00:00:00.000Z')];
  const r = M.mesclarTrilha(local, doArquivo);
  assert.strictEqual(r.lista.length, 2);
  const localNoResultado = r.lista.find(function (x) { return x.id === 'aud-teste-3'; });
  assert.deepStrictEqual(localNoResultado, local[0]);
  assert.strictEqual(r.adicionadas, 1);
  assert.strictEqual(r.ignoradasPorIdRepetido, 0);
});

verificar('mesclarTrilha: mesmo id nos dois lados -> vale a local, ignorada contada', function () {
  const local = [entradaAud('aud-teste-5', '2026-01-05T00:00:00.000Z', { resumo: 'versao local' })];
  const doArquivo = [entradaAud('aud-teste-5', '2026-01-05T00:00:00.000Z', { resumo: 'versao do arquivo' })];
  const r = M.mesclarTrilha(local, doArquivo);
  assert.strictEqual(r.lista.length, 1);
  assert.strictEqual(r.lista[0].resumo, 'versao local');
  assert.strictEqual(r.adicionadas, 0);
  assert.strictEqual(r.ignoradasPorIdRepetido, 1);
});

verificar('mesclarTrilha: ordena por em crescente; empate mantem local antes do arquivo e a ordem original; em ausente vai para o inicio', function () {
  const local = [
    entradaAud('aud-teste-6', '2026-03-01T00:00:00.000Z'),
    entradaAud('aud-teste-7', '2026-03-01T00:00:00.000Z')
  ];
  const doArquivo = [
    entradaAud('aud-teste-8', '2026-03-01T00:00:00.000Z'),
    entradaAud('aud-teste-9', '2026-01-01T00:00:00.000Z'),
    entradaAud('aud-teste-10')
  ];
  const r = M.mesclarTrilha(local, doArquivo);
  assert.deepStrictEqual(r.lista.map(function (x) { return x.id; }),
    ['aud-teste-10', 'aud-teste-9', 'aud-teste-6', 'aud-teste-7', 'aud-teste-8']);
});

verificar('mesclarTrilha: nao muta as entradas de entrada; o resultado e feito de clones', function () {
  const local = [entradaAud('aud-teste-11', '2026-04-01T00:00:00.000Z')];
  const doArquivo = [entradaAud('aud-teste-12', '2026-04-02T00:00:00.000Z')];
  const localAntes = clone(local);
  const arquivoAntes = clone(doArquivo);
  const r = M.mesclarTrilha(local, doArquivo);
  assert.deepStrictEqual(local, localAntes, 'local foi mutado por mesclarTrilha');
  assert.deepStrictEqual(doArquivo, arquivoAntes, 'doArquivo foi mutado por mesclarTrilha');
  assert.strictEqual(r.lista[0].id, 'aud-teste-11');
  r.lista[0].resumo = 'mudou depois da mescla';
  assert.notStrictEqual(local[0].resumo, 'mudou depois da mescla');
  assert.strictEqual(r.lista[1].id, 'aud-teste-12');
  r.lista[1].resumo = 'mudou depois da mescla';
  assert.notStrictEqual(doArquivo[0].resumo, 'mudou depois da mescla');
});

verificar('mesclarTrilha: mesclar o resultado com o mesmo arquivo de novo nao muda nada (idempotencia por id)', function () {
  const local = [entradaAud('aud-teste-13', '2026-05-01T00:00:00.000Z')];
  const doArquivo = [entradaAud('aud-teste-14', '2026-05-02T00:00:00.000Z')];
  const primeira = M.mesclarTrilha(local, doArquivo);
  const segunda = M.mesclarTrilha(primeira.lista, doArquivo);
  assert.deepStrictEqual(segunda.lista, primeira.lista);
  assert.strictEqual(segunda.adicionadas, 0);
  assert.strictEqual(segunda.ignoradasPorIdRepetido, doArquivo.length);
});

verificar('mesclarTrilha: bundle com auditLog e imports mesclados passa em M.migrar', function () {
  const bundleLocal = M.migrar(fixture(4));
  const auditDoArquivo = [entradaAud('aud-teste-15', '2026-06-01T00:00:00.000Z')];
  const importsDoArquivo = [entradaImp('imp-teste-15', '2026-06-01T00:00:00.000Z')];
  const resAud = M.mesclarTrilha(bundleLocal.auditLog, auditDoArquivo);
  const resImp = M.mesclarTrilha(bundleLocal.imports, importsDoArquivo);
  const mesclado = clone(bundleLocal);
  mesclado.auditLog = resAud.lista;
  mesclado.imports = resImp.lista;
  assert.doesNotThrow(function () { M.migrar(mesclado); });
});

/* ================================================================ PROT-03
   Exclusao logica (lixeira) de projeto e dos dez tipos de registro, e
   restauracao com o mesmo conteudo (D-32 item 1, P-01, P-09, P-10, P-12,
   P-13, P-24). Fixtures ficticias: base v4 (prj-v4/anx-v4.txt, ja migrada)
   mais projetos e itens criados no proprio teste pelas fabricas de
   CAMPOS_EDICAO. As entradas de auditLog sao montadas no proprio teste,
   como o Store vai gravar (20-06): id, em, ator, acao, entidade, entidadeId,
   resumo, payload e restauraDe nas restauracoes. */

function auditEntrada(id, em, payload, extra) {
  const base = {
    id: id, em: em, ator: 'PMO Lead', acao: 'fixture-exclusao',
    entidade: null, entidadeId: null, resumo: 'fixture', payload: payload || null
  };
  return Object.assign(base, extra || {});
}

/* ---------------------------------------------- Task 1: projeto (A-1) */

verificar('[A-1] vermelho: filtrar o projeto sem desvincular os anexos quebra M.migrar (regressao)', function () {
  const draft = M.migrar(fixture(4));
  draft.projetos = draft.projetos.filter(function (p) { return p.id !== 'prj-v4'; });
  // anx-v4.txt continua com projetoId: 'prj-v4' -> referencia orfa
  assert.throws(function () { M.migrar(draft); }, function (err) {
    return err && err.code === 'MIGRACAO_INVALIDA';
  });
});

verificar('excluirProjeto: projeto some, anexo fica com projetoId/entidadeRef nulos, payload completo, M.migrar passa', function () {
  const draft = M.migrar(fixture(4));
  const projetoOriginal = clone(M.projetoPorId(draft, 'prj-v4'));

  const payload = M.excluirProjeto(draft, 'prj-v4');

  assert.strictEqual(M.projetoPorId(draft, 'prj-v4'), null, 'projeto deveria ter sido removido');
  const anexo = draft.anexos.find(function (a) { return a.id === 'anx-v4.txt'; });
  assert.strictEqual(anexo.projetoId, null, 'anexo deveria ficar sem projetoId');
  assert.strictEqual(anexo.entidadeRef, null, 'anexo deveria ficar sem entidadeRef');

  assert.strictEqual(payload.versao, 1);
  assert.strictEqual(payload.tipo, 'projeto');
  assert.strictEqual(payload.projetoId, 'prj-v4');
  assert.strictEqual(payload.indice, 0);
  assert.deepStrictEqual(payload.projeto, projetoOriginal, 'payload.projeto deveria ser identico ao original');
  assert.deepStrictEqual(payload.anexosDesvinculados,
    [{ anexoId: 'anx-v4.txt', projetoId: 'prj-v4', entidadeRef: null }]);
  assert.deepStrictEqual(payload.dependenciasRemovidas, []);

  assert.doesNotThrow(function () { M.migrar(draft); });
});

verificar('excluirProjeto: id inexistente lanca "projeto não encontrado" e nao muta o rascunho', function () {
  const draft = M.migrar(fixture(4));
  const antes = clone(draft);
  assert.throws(function () { M.excluirProjeto(draft, 'prj-nao-existe'); }, /projeto não encontrado/);
  assert.deepStrictEqual(draft, antes, 'o rascunho nao deveria ter sido mutado');
});

verificar('excluirProjeto: remove dependencias de outros projetos que apontavam para o excluido (payload guarda cada uma)', function () {
  const draft = M.migrar(fixture(4));
  const a = M.projetoVazio({ id: 'prj-a-teste', codigo: 'PRJ-A', nome: 'Projeto A' });
  const b = M.projetoVazio({ id: 'prj-b-teste', codigo: 'PRJ-B', nome: 'Projeto B' });
  const dep = M.dependenciaVazia({ id: 'dep-teste-1', projetoDestinoId: 'prj-a-teste', descricao: 'depende de A' });
  b.dependencias.push(dep);
  draft.projetos.push(a, b);

  const payload = M.excluirProjeto(draft, 'prj-a-teste');

  assert.deepStrictEqual(M.projetoPorId(draft, 'prj-b-teste').dependencias, [],
    'a dependencia de B para A deveria ter sido removida');
  assert.deepStrictEqual(payload.dependenciasRemovidas,
    [{ projetoId: 'prj-b-teste', indice: 0, dependencia: dep }]);
  assert.doesNotThrow(function () { M.migrar(draft); });
});

verificar('restaurarDaLixeira (projeto): volta na mesma posicao, deepStrictEqual ao original, refaz dependencia; sem avisos', function () {
  const draft = M.migrar(fixture(4));
  const a = M.projetoVazio({ id: 'prj-a2-teste', codigo: 'PRJ-A2', nome: 'Projeto A2' });
  const b = M.projetoVazio({ id: 'prj-b2-teste', codigo: 'PRJ-B2', nome: 'Projeto B2' });
  const dep = M.dependenciaVazia({ id: 'dep-teste-2', projetoDestinoId: 'prj-a2-teste', descricao: 'depende de A2' });
  b.dependencias.push(dep);
  draft.projetos.push(a, b);
  const aOriginal = clone(a);

  const payload = M.excluirProjeto(draft, 'prj-a2-teste');
  draft.auditLog.push(auditEntrada('aud-teste-excl-a2', '2026-07-01T00:00:00.000Z', payload));

  const resultado = M.restaurarDaLixeira(draft, 'aud-teste-excl-a2');

  assert.strictEqual(resultado.tipo, 'projeto');
  assert.strictEqual(resultado.entidade, 'projeto');
  assert.strictEqual(resultado.entidadeId, 'prj-a2-teste');
  assert.strictEqual(resultado.acao, 'Restaurar projeto');
  assert.deepStrictEqual(resultado.avisos, []);
  assert.deepStrictEqual(M.projetoPorId(draft, 'prj-a2-teste'), aOriginal);
  assert.deepStrictEqual(M.projetoPorId(draft, 'prj-b2-teste').dependencias, [dep]);
  assert.doesNotThrow(function () { M.migrar(draft); });
});

verificar('restaurarDaLixeira: entrada de exclusao nao encontrada lanca', function () {
  const draft = M.migrar(fixture(4));
  assert.throws(function () { M.restaurarDaLixeira(draft, 'aud-nao-existe'); },
    /entrada de exclusão não encontrada/);
});

verificar('restaurarDaLixeira: payload com versao desconhecida lanca "formato de exclusão desconhecido"', function () {
  const draft = M.migrar(fixture(4));
  draft.auditLog.push(auditEntrada('aud-teste-versao2', '2026-07-02T00:00:00.000Z',
    { versao: 2, tipo: 'projeto', projetoId: 'x' }));
  assert.throws(function () { M.restaurarDaLixeira(draft, 'aud-teste-versao2'); },
    /formato de exclusão desconhecido/);
});

verificar('restaurarDaLixeira: exclusao ja restaurada (entrada com restauraDe) lanca "esta exclusão já foi restaurada"', function () {
  const draft = M.migrar(fixture(4));
  const payload = M.excluirProjeto(draft, 'prj-v4');
  draft.auditLog.push(auditEntrada('aud-teste-excl-v4b', '2026-07-03T00:00:00.000Z', payload));
  draft.auditLog.push(auditEntrada('aud-teste-rest-v4b', '2026-07-04T00:00:00.000Z', null,
    { restauraDe: 'aud-teste-excl-v4b' }));
  assert.throws(function () { M.restaurarDaLixeira(draft, 'aud-teste-excl-v4b'); },
    /esta exclusão já foi restaurada/);
});

verificar('restaurarDaLixeira: id de projeto ja existente no rascunho lanca', function () {
  const draft = M.migrar(fixture(4));
  const payload = M.excluirProjeto(draft, 'prj-v4');
  draft.auditLog.push(auditEntrada('aud-teste-excl-dup', '2026-07-05T00:00:00.000Z', payload));
  // simula outro projeto criado com o mesmo id enquanto o original estava na lixeira
  draft.projetos.push(M.projetoVazio({ id: 'prj-v4', codigo: 'PRJ-DUP' }));
  assert.throws(function () { M.restaurarDaLixeira(draft, 'aud-teste-excl-dup'); });
});

verificar('restaurarDaLixeira: programa removido depois da exclusao volta com programaId null e um aviso', function () {
  const draft = M.migrar(fixture(4));
  draft.programas.push({
    id: 'prg-teste-1', codigo: 'PRG-1', nome: 'Programa fictício', objetivo: '',
    sponsorId: null, donoId: null, driverIds: [], status: 'ativo'
  });
  const p = M.projetoVazio({ id: 'prj-c-teste', codigo: 'PRJ-C', nome: 'Projeto C', programaId: 'prg-teste-1' });
  draft.projetos.push(p);

  const payload = M.excluirProjeto(draft, 'prj-c-teste');
  // programa removido enquanto o projeto estava na lixeira
  draft.programas = draft.programas.filter(function (x) { return x.id !== 'prg-teste-1'; });
  draft.auditLog.push(auditEntrada('aud-teste-excl-c', '2026-07-06T00:00:00.000Z', payload));

  const resultado = M.restaurarDaLixeira(draft, 'aud-teste-excl-c');
  assert.strictEqual(M.projetoPorId(draft, 'prj-c-teste').programaId, null);
  assert.strictEqual(resultado.avisos.length, 1);
  assert.doesNotThrow(function () { M.migrar(draft); });
});

/* ------------------------------- Task 2: os dez tipos de registro e a lixeira */

const TIPOS_REGISTRO_PROT03 = [
  'risco', 'issue', 'marco', 'gate', 'mudanca',
  'decisao', 'beneficio', 'dependencia', 'alocacao', 'statusReport'
];

TIPOS_REGISTRO_PROT03.forEach(function (tipo) {
  verificar('excluirRegistro/restaurarDaLixeira round-trip para o tipo "' + tipo + '"', function () {
    const draft = M.migrar(fixture(4));
    const def = M.CAMPOS_EDICAO[tipo];
    const destino = M.projetoVazio({ id: 'prj-destino-' + tipo, codigo: 'PRJ-DEST-' + tipo });
    const projeto = M.projetoVazio({ id: 'prj-host-' + tipo, codigo: 'PRJ-HOST-' + tipo });
    draft.projetos.push(destino, projeto);

    const overItem = { id: 'item-' + tipo };
    if (tipo === 'dependencia') { overItem.projetoDestinoId = 'prj-destino-' + tipo; }
    const item = M[def.fabrica](overItem);
    projeto[def.colecao].push(item);

    const anexo = {
      id: 'anx-' + tipo, projetoId: projeto.id,
      entidadeRef: { tipo: tipo, id: item.id }, nomeArquivo: 'evidencia-' + tipo + '.txt'
    };
    draft.anexos.push(anexo);
    projeto.anexos.push(anexo.id);

    const itemOriginal = clone(item);
    const anexoOriginal = clone(anexo);

    const payload = M.excluirRegistro(draft, tipo, projeto.id, item.id);

    assert.strictEqual(payload.versao, 1);
    assert.strictEqual(payload.tipo, tipo);
    assert.strictEqual(payload.colecao, def.colecao);
    assert.strictEqual(payload.projetoId, projeto.id);
    assert.strictEqual(payload.itemId, item.id);
    assert.deepStrictEqual(payload.item, itemOriginal);
    assert.deepStrictEqual(payload.anexosDesvinculados,
      [{ anexoId: anexo.id, entidadeRef: anexoOriginal.entidadeRef }]);

    assert.strictEqual(
      M.projetoPorId(draft, projeto.id)[def.colecao].some(function (x) { return x.id === item.id; }),
      false);
    const anexoDepois = draft.anexos.find(function (a) { return a.id === anexo.id; });
    assert.strictEqual(anexoDepois.entidadeRef, null);
    assert.strictEqual(anexoDepois.projetoId, projeto.id,
      'o anexo continua no mesmo projeto, so perde o vinculo com o item');

    assert.doesNotThrow(function () { M.migrar(draft); });

    draft.auditLog.push(auditEntrada('aud-teste-excl-' + tipo, '2026-08-01T00:00:00.000Z', payload));
    const resultado = M.restaurarDaLixeira(draft, 'aud-teste-excl-' + tipo);

    assert.strictEqual(resultado.tipo, tipo);
    assert.strictEqual(resultado.entidade, tipo);
    assert.strictEqual(resultado.entidadeId, projeto.id);
    assert.deepStrictEqual(resultado.avisos, []);

    assert.deepStrictEqual(
      M.projetoPorId(draft, projeto.id)[def.colecao].find(function (x) { return x.id === item.id; }),
      itemOriginal);
    const anexoRestaurado = draft.anexos.find(function (a) { return a.id === anexo.id; });
    assert.deepStrictEqual(anexoRestaurado.entidadeRef, anexoOriginal.entidadeRef);

    assert.doesNotThrow(function () { M.migrar(draft); });
  });
});

verificar('excluirRegistro: tipo desconhecido lanca e nao muta', function () {
  const draft = M.migrar(fixture(4));
  const antes = clone(draft);
  assert.throws(function () { M.excluirRegistro(draft, 'tipo-invalido', 'prj-v4', 'x'); });
  assert.deepStrictEqual(draft, antes);
});

verificar('excluirRegistro: projeto inexistente lanca e nao muta', function () {
  const draft = M.migrar(fixture(4));
  const antes = clone(draft);
  assert.throws(function () { M.excluirRegistro(draft, 'risco', 'prj-nao-existe', 'x'); });
  assert.deepStrictEqual(draft, antes);
});

verificar('excluirRegistro: item inexistente lanca e nao muta', function () {
  const draft = M.migrar(fixture(4));
  const antes = clone(draft);
  assert.throws(function () { M.excluirRegistro(draft, 'risco', 'prj-v4', 'rsk-nao-existe'); });
  assert.deepStrictEqual(draft, antes);
});

verificar('restaurarDaLixeira (registro): dependencia cujo projeto destino sumiu volta com projetoDestinoId null e aviso', function () {
  const draft = M.migrar(fixture(4));
  const destino = M.projetoVazio({ id: 'prj-destino-sumiu', codigo: 'PRJ-SUMIU' });
  const projeto = M.projetoVazio({ id: 'prj-host-dep-sumiu', codigo: 'PRJ-HOST-SUMIU' });
  draft.projetos.push(destino, projeto);
  const dep = M.dependenciaVazia({ id: 'dep-sumiu', projetoDestinoId: 'prj-destino-sumiu' });
  projeto.dependencias.push(dep);

  const payload = M.excluirRegistro(draft, 'dependencia', projeto.id, dep.id);
  draft.projetos = draft.projetos.filter(function (p) { return p.id !== 'prj-destino-sumiu'; });
  draft.auditLog.push(auditEntrada('aud-teste-dep-sumiu', '2026-08-02T00:00:00.000Z', payload));

  const resultado = M.restaurarDaLixeira(draft, 'aud-teste-dep-sumiu');
  const depRestaurada = M.projetoPorId(draft, projeto.id).dependencias
    .find(function (d) { return d.id === 'dep-sumiu'; });
  assert.strictEqual(depRestaurada.projetoDestinoId, null);
  assert.strictEqual(resultado.avisos.length, 1);
  assert.doesNotThrow(function () { M.migrar(draft); });
});

verificar('restaurarDaLixeira (registro): id ja existente na colecao lanca', function () {
  const draft = M.migrar(fixture(4));
  const p = M.projetoVazio({ id: 'prj-dup-reg', codigo: 'PRJ-DUP-REG' });
  draft.projetos.push(p);
  const issue = M.issueVazia({ id: 'iss-dup', titulo: 'Issue fictícia' });
  p.issues.push(issue);

  const payload = M.excluirRegistro(draft, 'issue', p.id, issue.id);
  draft.auditLog.push(auditEntrada('aud-dup-reg', '2026-09-09T00:00:00.000Z', payload));
  p.issues.push(M.issueVazia({ id: 'iss-dup', titulo: 'Outra issue com o mesmo id' }));

  assert.throws(function () { M.restaurarDaLixeira(draft, 'aud-dup-reg'); }, /já existe/);
});

/* ------------------------------------------------ lixeira: bordas do edge probe */

verificar('lixeira: portfolioVazio() -> []', function () {
  assert.deepStrictEqual(M.lixeira(M.portfolioVazio()), []);
});

verificar('lixeira: bundle sem auditLog -> [] (edge probe PROT-03 empty)', function () {
  const b = M.migrar(fixture(4));
  delete b.auditLog;
  assert.deepStrictEqual(M.lixeira(b), []);
});

verificar('lixeira: auditLog so com entradas sem payload -> [] (P-24, edge probe PROT-03 empty)', function () {
  const b = M.migrar(fixture(4));
  b.auditLog = [{ id: 'aud-sem-payload', em: '2026-01-01T00:00:00.000Z', acao: 'algo antigo' }];
  assert.deepStrictEqual(M.lixeira(b), []);
});

verificar('lixeira: ordenacao decrescente por em; empate resolvido pela posicao maior na trilha primeiro (edge probe PROT-03 ordering)', function () {
  const b = M.portfolioVazio();
  function payloadProjetoFicticio(id) {
    return {
      versao: 1, tipo: 'projeto', projetoId: id, indice: 0,
      projeto: { id: id, codigo: id.toUpperCase() },
      dependenciasRemovidas: [], anexosDesvinculados: []
    };
  }
  b.auditLog = [
    auditEntrada('aud-ord-1', '2026-01-01T00:00:00.000Z', payloadProjetoFicticio('x1')),
    auditEntrada('aud-ord-2', '2026-01-03T00:00:00.000Z', payloadProjetoFicticio('x2')),
    auditEntrada('aud-ord-3', '2026-01-02T00:00:00.000Z', payloadProjetoFicticio('x3')),
    auditEntrada('aud-ord-4', '2026-01-02T00:00:00.000Z', payloadProjetoFicticio('x4'))
  ];
  const ids = M.lixeira(b).map(function (x) { return x.auditId; });
  assert.deepStrictEqual(ids, ['aud-ord-2', 'aud-ord-4', 'aud-ord-3', 'aud-ord-1']);
});

verificar('lixeira/restaurarDaLixeira: excluir, restaurar e excluir de novo -> lixeira mostra so a segunda exclusao (edge probe PROT-03 adjacency)', function () {
  const draft = M.migrar(fixture(4));
  const p = M.projetoVazio({ id: 'prj-adj-teste', codigo: 'PRJ-ADJ' });
  draft.projetos.push(p);

  const payload1 = M.excluirProjeto(draft, 'prj-adj-teste');
  draft.auditLog.push(auditEntrada('aud-adj-excl-1', '2026-09-01T00:00:00.000Z', payload1));
  M.restaurarDaLixeira(draft, 'aud-adj-excl-1');
  draft.auditLog.push(auditEntrada('aud-adj-rest-1', '2026-09-02T00:00:00.000Z', null,
    { restauraDe: 'aud-adj-excl-1' }));

  const payload2 = M.excluirProjeto(draft, 'prj-adj-teste');
  draft.auditLog.push(auditEntrada('aud-adj-excl-2', '2026-09-03T00:00:00.000Z', payload2));

  const ids = M.lixeira(draft).map(function (x) { return x.auditId; });
  assert.deepStrictEqual(ids, ['aud-adj-excl-2']);

  assert.throws(function () { M.restaurarDaLixeira(draft, 'aud-adj-excl-1'); },
    /esta exclusão já foi restaurada/);
});

verificar('lixeira/restaurarDaLixeira (registro): payload com versao desconhecida -> restauravel false e restaurar lanca', function () {
  const b = M.migrar(fixture(4));
  b.auditLog.push(auditEntrada('aud-reg-versao2', '2026-09-04T00:00:00.000Z',
    { versao: 2, tipo: 'risco', projetoId: 'prj-v4', itemId: 'rsk-x' }));
  const item = M.lixeira(b).find(function (x) { return x.auditId === 'aud-reg-versao2'; });
  assert.strictEqual(item.restauravel, false);
  assert.strictEqual(item.motivo, 'formato de exclusão desconhecido');
  assert.throws(function () { M.restaurarDaLixeira(b, 'aud-reg-versao2'); },
    /formato de exclusão desconhecido/);
});

verificar('lixeira: projeto-pai excluido depois do registro -> restauravel false ate o projeto voltar (P-13)', function () {
  const draft = M.migrar(fixture(4));
  const pai = M.projetoVazio({ id: 'prj-pai-teste', codigo: 'PRJ-PAI' });
  draft.projetos.push(pai);
  const risco = M.riscoVazio({ id: 'rsk-pai-teste', titulo: 'Risco fictício' });
  pai.riscos.push(risco);

  const payloadRegistro = M.excluirRegistro(draft, 'risco', pai.id, risco.id);
  draft.auditLog.push(auditEntrada('aud-pai-excl-risco', '2026-09-05T00:00:00.000Z', payloadRegistro));

  const payloadProjeto = M.excluirProjeto(draft, 'prj-pai-teste');
  draft.auditLog.push(auditEntrada('aud-pai-excl-projeto', '2026-09-06T00:00:00.000Z', payloadProjeto));

  let item = M.lixeira(draft).find(function (x) { return x.auditId === 'aud-pai-excl-risco'; });
  assert.strictEqual(item.restauravel, false);
  assert.strictEqual(item.motivo, 'restaure o projeto primeiro');
  assert.throws(function () { M.restaurarDaLixeira(draft, 'aud-pai-excl-risco'); },
    /restaure o projeto primeiro/);

  M.restaurarDaLixeira(draft, 'aud-pai-excl-projeto');
  item = M.lixeira(draft).find(function (x) { return x.auditId === 'aud-pai-excl-risco'; });
  assert.strictEqual(item.restauravel, true);

  const resultado = M.restaurarDaLixeira(draft, 'aud-pai-excl-risco');
  assert.deepStrictEqual(resultado.avisos, []);
  assert.doesNotThrow(function () { M.migrar(draft); });
});

verificar('lixeira: apos M.mesclarTrilha, exclusoes dos dois lados aparecem juntas (P-12)', function () {
  const local = [auditEntrada('aud-mesc-local-1', '2026-09-07T00:00:00.000Z', {
    versao: 1, tipo: 'projeto', projetoId: 'prj-mesc-local', indice: 0,
    projeto: { id: 'prj-mesc-local' }, dependenciasRemovidas: [], anexosDesvinculados: []
  })];
  const doArquivo = [auditEntrada('aud-mesc-arquivo-1', '2026-09-08T00:00:00.000Z', {
    versao: 1, tipo: 'projeto', projetoId: 'prj-mesc-arquivo', indice: 0,
    projeto: { id: 'prj-mesc-arquivo' }, dependenciasRemovidas: [], anexosDesvinculados: []
  })];
  const r = M.mesclarTrilha(local, doArquivo);
  const b = M.portfolioVazio();
  b.auditLog = r.lista;
  const ids = M.lixeira(b).map(function (x) { return x.auditId; }).sort();
  assert.deepStrictEqual(ids, ['aud-mesc-arquivo-1', 'aud-mesc-local-1']);
});

console.log('protecao-captura: OK (' + n + ' verificacoes)');
