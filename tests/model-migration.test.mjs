import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
global.window = { PMO: {} };

const moduleKey = encodeURIComponent(import.meta.url);
await import(pathToFileURL(path.join(root, 'src', 'js', '00-util.js')).href + '?migration-tests=' + moduleKey);
await import(pathToFileURL(path.join(root, 'src', 'js', '10-model.js')).href + '?migration-tests=' + moduleKey);

const M = window.PMO.model;
const fixtureRoot = path.join(__dirname, 'fixtures', 'migrations');

function fixture(version) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'schema-v' + version + '.json'), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertBlocked(value, pattern, message) {
  assert.throws(function () { M.migrar(value); }, function (error) {
    return error && error.code === 'MIGRACAO_INVALIDA' && pattern.test(error.message);
  }, message);
}

function criticalCounts(bundle) {
  const out = {};
  ['pessoas', 'programas', 'projetos', 'anexos', 'auditLog', 'imports', 'visoesSalvas']
    .forEach(function (key) { out[key] = (bundle[key] || []).length; });
  out.itensProjeto = (bundle.projetos || []).reduce(function (total, project) {
    return total + ['beneficios', 'tarefas', 'marcos', 'gates', 'riscos', 'issues', 'decisoes',
      'mudancas', 'dependencias', 'alocacoes', 'statusReports', 'anexos']
      .reduce(function (subtotal, key) { return subtotal + (project[key] || []).length; }, 0);
  }, 0);
  return out;
}

function assertCountsNotLower(before, after, message) {
  Object.keys(before).forEach(function (key) {
    assert.ok(after[key] >= before[key], message + ': ' + key + ' diminuiu');
  });
}

for (let version = 1; version <= 4; version += 1) {
  const source = fixture(version);
  const sourceSnapshot = clone(source);
  const before = criticalCounts(source);
  const result = M.migrarComRelatorio(source);

  assert.deepStrictEqual(source, sourceSnapshot, 'migracao v' + version + ' mutou a fixture de origem');
  assert.strictEqual(result.bundle.meta.schemaVersion, 4, 'schema final da fixture v' + version);
  assert.strictEqual(result.relatorio.de, version, 'schema inicial no relatorio v' + version);
  assert.strictEqual(result.relatorio.passos.length, 4 - version, 'quantidade de saltos da fixture v' + version);
  result.relatorio.passos.forEach(function (step, index) {
    assert.deepStrictEqual({ de: step.de, para: step.para },
      { de: version + index, para: version + index + 1 }, 'salto explicito da fixture v' + version);
    assert.ok(step.contagens && step.contagens.antes && step.contagens.depois,
      'relatorio deve registrar contagens do salto v' + version);
    assert.deepStrictEqual(step.invariantes, { integridade: true, contagensNaoDiminuiram: true },
      'relatorio deve confirmar invariantes do salto v' + version);
    assert.ok(Array.isArray(step.avisos), 'relatorio deve registrar avisos do salto v' + version);
  });
  assert.ok(result.relatorio.normalizacao && result.relatorio.normalizacao.antes &&
    result.relatorio.normalizacao.depois, 'relatorio deve registrar contagens da normalizacao v' + version);
  assert.deepStrictEqual(result.relatorio.validacoes,
    { integridadeFinal: true, configuracaoFinal: true, modelValidar: true, idempotente: true },
    'relatorio deve registrar validacoes finais v' + version);
  assert.ok(Array.isArray(result.relatorio.avisos), 'relatorio deve registrar avisos finais v' + version);
  assertCountsNotLower(before, criticalCounts(result.bundle), 'contagens da fixture v' + version);
  assert.strictEqual(M.validar(result.bundle).ok, true, 'model.validar final da fixture v' + version);
  assert.strictEqual(JSON.stringify(M.migrar(result.bundle)), JSON.stringify(result.bundle),
    'idempotencia da fixture v' + version);

  assert.strictEqual(JSON.stringify(result.bundle.xTopo), JSON.stringify({ origem: version }),
    'campo desconhecido no topo v' + version);
  assert.strictEqual(result.bundle.meta.xMeta, 'preservar-v' + version, 'campo desconhecido em meta v' + version);
  assert.strictEqual(JSON.stringify(result.bundle.settings.xSettings), JSON.stringify({ origem: version }),
    'campo desconhecido em settings v' + version);
  assert.strictEqual(JSON.stringify(result.bundle.projetos[0].xProjeto), JSON.stringify({ origem: version }),
    'campo desconhecido no projeto v' + version);
}

const curveResult = M.migrar(fixture(1));
assert.strictEqual(curveResult.projetos[0].finance.curvaPlanejada[0].xCurva, 'preservar',
  'campo desconhecido na curva financeira');
assert.strictEqual(curveResult.projetos[0].riscos[0].xRisco, true,
  'campo desconhecido na entidade aninhada');
assert.strictEqual(M.migrar(fixture(3)).anexos[0].xAnexo, 'preservar',
  'campo desconhecido no anexo');

for (let version = 1; version <= 3; version += 1) {
  const source = fixture(version);
  const snapshot = clone(source);
  const step = M.MIGRADORES[version](source);
  assert.notStrictEqual(step.bundle, source, 'migrador v' + version + ' deve devolver nova copia');
  assert.deepStrictEqual(source, snapshot, 'migrador v' + version + ' mutou sua entrada');
  assert.strictEqual(step.bundle.meta.schemaVersion, version + 1, 'schema produzido pelo migrador v' + version);
}

const missingId = fixture(3);
delete missingId.projetos[0].riscos[0].id;
assertBlocked(missingId, /sem id valido/, 'id ausente deve bloquear');

const duplicateId = fixture(4);
duplicateId.projetos.push(clone(duplicateId.projetos[0]));
assertBlocked(duplicateId, /id duplicado/, 'id duplicado deve bloquear');

const invalidProjectReference = fixture(3);
invalidProjectReference.anexos[0].projetoId = 'prj-inexistente';
assertBlocked(invalidProjectReference, /projeto inexistente/, 'projetoId de anexo invalido deve bloquear');

const invalidAttachmentReference = fixture(3);
invalidAttachmentReference.projetos[0].anexos[0] = 'anx-inexistente.txt';
assertBlocked(invalidAttachmentReference, /anexo inexistente/, 'referencia de anexo invalida deve bloquear');

const invalidEntityReference = fixture(3);
invalidEntityReference.anexos[0].entidadeRef.id = 'rsk-inexistente';
assertBlocked(invalidEntityReference, /registro inexistente/, 'entidadeRef invalida deve bloquear');

const invalidDependency = fixture(4);
invalidDependency.projetos[0].dependencias = [
  { id: 'dep-invalida', projetoDestinoId: 'prj-inexistente' }
];
assertBlocked(invalidDependency, /projeto inexistente/, 'dependencia de projeto invalida deve bloquear');

const invalidFinalConfiguration = fixture(4);
invalidFinalConfiguration.settings.gates.push(clone(invalidFinalConfiguration.settings.gates[0]));
assertBlocked(invalidFinalConfiguration, /settings\.gates.*duplicado/, 'configuracao final invalida deve bloquear');

const invalidThreshold = fixture(4);
invalidThreshold.settings.limiares = { spi: { vermelho: 'baixo' } };
assertBlocked(invalidThreshold, /deve ser numero finito/, 'limiar final invalido deve bloquear');

const numericTaxonomy = fixture(4);
numericTaxonomy.settings.taxonomias.severidades = [
  { id: 1, rotulo: 'Baixa' }, { id: 2, rotulo: 'Alta' }
];
assert.strictEqual(M.migrar(numericTaxonomy).settings.taxonomias.severidades.length, 2,
  'ids numericos validos de taxonomia devem ser preservados');

const invalidFinalModel = fixture(4);
invalidFinalModel.projetos[0].nome = '';
assertBlocked(invalidFinalModel, /sem nome/, 'model.validar final deve ser obrigatorio');

const invalidSchema = fixture(4);
invalidSchema.meta.schemaVersion = 'quatro';
assertBlocked(invalidSchema, /schemaVersion de origem invalido/, 'schema de origem invalido deve bloquear');

const originalMigrator = M.MIGRADORES[1];
try {
  M.MIGRADORES[1] = function (source) {
    const output = clone(source);
    output.projetos.pop();
    output.meta.schemaVersion = 2;
    return { bundle: output, alteracoes: ['simulacao destrutiva'] };
  };
  assertBlocked(fixture(1), /diminuiu/, 'queda de contagem critica deve bloquear');
} finally {
  M.MIGRADORES[1] = originalMigrator;
}

console.log('Contrato de migracao: fixtures v1-v4 e casos negativos passaram.');
