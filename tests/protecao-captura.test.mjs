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

console.log('protecao-captura: OK (' + n + ' verificacoes)');
