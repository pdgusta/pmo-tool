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

console.log('protecao-captura: OK (' + n + ' verificacoes)');
