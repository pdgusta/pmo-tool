/* =============================================================================
   20-store.js — persistencia hibrida: IndexedDB (primaria) + disco (replica)
   Depende de: 00-util.js, 10-model.js

   Modelo de persistencia:
     - IndexedDB guarda o bundle e os blobs dos anexos. Funciona offline e em file://
     - O servidor local (serve.ps1) recebe uma replica do bundle e dos anexos em
       data/portfolio.json e data/attachments/. Isso da backup real, versionavel
       em git e sincronizavel via OneDrive.
     - Falha de disco NUNCA e silenciosa (G8): degrada e avisa na UI.
   ============================================================================= */
(function (PMO) {
  'use strict';

  const U = PMO.util;
  const M = PMO.model;

  const DB_NOME = 'pmo-tool';
  const DB_VERSAO = 1;
  const CHAVE_BUNDLE = 'portfolio';
  const LIMITE_UNDO = 25;
  const DEBOUNCE_DISCO = 1200;

  const emissor = U.emissor();

  const store = {
    state: M.portfolioVazio(),
    pronto: false,
    somenteLeitura: false,
    motivoSomenteLeitura: null,
    manutencao: false,
    restauracaoAplicada: null,
    ultimaMigracao: null,
    statusAtualizacao: { fase: 'ocioso', erro: null },
    statusProtecao: { operacao: null, fase: 'ocioso', erro: null, snapshotId: null },
    statusDisco: { online: false, ultimoSalvo: null, erro: null, salvando: false, pendente: false },
    statusIdb: { online: false, erro: null },
    on: emissor.on,
    off: emissor.off
  };

  let _db = null;
  let _undo = [];
  let _redo = [];
  let _timerDisco = null;
  let _atorAtual = 'PMO Lead';
  let _bundleOrigemBruto = null;

  function motivoBloqueio() {
    if (store.somenteLeitura) {
      return store.motivoSomenteLeitura || 'O portfólio está aberto em modo somente leitura.';
    }
    if (store.manutencao) {
      return 'Atualização em preparação: alterações estão temporariamente bloqueadas.';
    }
    return null;
  }

  function exigirEscrita() {
    const motivo = motivoBloqueio();
    if (motivo) {
      const e = new Error(motivo);
      e.code = store.somenteLeitura ? 'SOMENTE_LEITURA' : 'MANUTENCAO';
      throw e;
    }
  }

  /* ======================================================== IndexedDB */

  function abrirDb() {
    return new Promise(function (res) {
      if (!window.indexedDB) {
        store.statusIdb = { online: false, erro: 'IndexedDB indisponível neste navegador.' };
        return res(null);
      }
      let req;
      try { req = indexedDB.open(DB_NOME, DB_VERSAO); }
      catch (e) {
        store.statusIdb = { online: false, erro: String(e.message || e) };
        return res(null);
      }
      req.onupgradeneeded = function (ev) {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains('kv')) { db.createObjectStore('kv', { keyPath: 'k' }); }
        if (!db.objectStoreNames.contains('anexos')) { db.createObjectStore('anexos', { keyPath: 'id' }); }
      };
      req.onsuccess = function () {
        store.statusIdb = { online: true, erro: null };
        res(req.result);
      };
      req.onerror = function () {
        store.statusIdb = { online: false, erro: (req.error && req.error.message) || 'falha ao abrir IndexedDB' };
        res(null);
      };
      req.onblocked = function () {
        store.statusIdb = { online: false, erro: 'IndexedDB bloqueado por outra aba aberta.' };
        res(null);
      };
    });
  }

  function idbOp(nomeStore, modo, fn) {
    return new Promise(function (res, rej) {
      if (!_db) { return rej(new Error('IndexedDB indisponível')); }
      let tx;
      try { tx = _db.transaction(nomeStore, modo); }
      catch (e) { return rej(e); }
      const os = tx.objectStore(nomeStore);
      let resultado;
      try { resultado = fn(os); } catch (e) { return rej(e); }
      tx.oncomplete = function () {
        res(resultado && resultado.result !== undefined ? resultado.result : resultado);
      };
      tx.onerror = function () { rej(tx.error || new Error('transação IndexedDB falhou')); };
      tx.onabort = function () { rej(tx.error || new Error('transação IndexedDB abortada')); };
    });
  }

  function idbGet(nomeStore, chave) {
    return new Promise(function (res, rej) {
      if (!_db) { return rej(new Error('IndexedDB indisponível')); }
      let tx;
      try { tx = _db.transaction(nomeStore, 'readonly'); } catch (e) { return rej(e); }
      const req = tx.objectStore(nomeStore).get(chave);
      req.onsuccess = function () { res(req.result || null); };
      req.onerror = function () { rej(req.error); };
    });
  }

  /* ============================================================ servidor */

  function temServidor() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function tokenAdministrativo() {
    const meta = document.querySelector('meta[name="pmo-admin-token"]');
    return meta ? String(meta.getAttribute('content') || '') : '';
  }

  function activationId() {
    const meta = document.querySelector('meta[name="pmo-activation-id"]');
    return meta ? String(meta.getAttribute('content') || '') : '';
  }

  function rotaProtegida(rota, metodo) {
    const m = String(metodo || 'GET').toUpperCase();
    if (m !== 'GET' && m !== 'HEAD') { return true; }
    return rota === '/api/app-ready' || rota === '/api/restore-pending' || rota === '/api/restore-ack' ||
      rota === '/api/copia-verificavel/sugestoes';
  }

  async function apiFetch(rota, opts) {
    if (!temServidor()) { throw new Error('sem servidor (aberto via file://)'); }
    const o = opts || {};
    const ctrl = new AbortController();
    const timeout = setTimeout(function () { ctrl.abort(); }, o.timeout || 20000);
    try {
      const headers = Object.assign({}, o.headers || {});
      const token = tokenAdministrativo();
      const metodo = String(o.method || 'GET').toUpperCase();
      if (rotaProtegida(String(rota), metodo) && !token) {
        throw new Error('servidor seguro exige token de sessao para esta operacao');
      }
      if (token && rotaProtegida(String(rota), metodo)) {
        headers['X-PMO-Admin-Token'] = token;
      }
      const r = await fetch(rota, {
        method: metodo,
        headers: headers,
        body: o.body,
        cache: 'no-store',
        signal: ctrl.signal
      });
      return r;
    } finally { clearTimeout(timeout); }
  }

  async function sha256Bytes(bytes) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('SHA-256 seguro indisponivel neste navegador.');
    }
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', view));
    return Array.prototype.map.call(digest, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }

  function decodificarUtf8(bytes) {
    if (!window.TextDecoder) { throw new Error('Decodificador UTF-8 indisponivel neste navegador.'); }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }

  async function checarServidor() {
    if (!temServidor()) {
      store.statusDisco.online = false;
      store.statusDisco.erro = 'Aberto sem servidor (file://). Dados ficam apenas neste navegador.';
      return false;
    }
    try {
      const r = await apiFetch('/api/health', { timeout: 5000 });
      store.statusDisco.online = r.ok;
      store.statusDisco.erro = r.ok ? null : 'Servidor respondeu ' + r.status + '.';
      return r.ok;
    } catch (e) {
      store.statusDisco.online = false;
      store.statusDisco.erro = 'Servidor local não respondeu. Gravação em disco desativada.';
      return false;
    }
  }

  function normalizarEntradaRestore(raw) {
    const r = raw || {};
    let id = String(r.id || '');
    if (!id && r.path) {
      const p = String(r.path).replace(/\\/g, '/');
      if (p.toLowerCase().indexOf('attachments/') === 0) { id = p.slice(12); }
    }
    const tamanho = Number(r.size !== undefined ? r.size : r.tamanho);
    const sha256 = String(r.sha256 || '').toLowerCase();
    if (!/^[A-Za-z0-9._-]{1,180}$/.test(id) || id.indexOf('..') >= 0 ||
        !Number.isFinite(tamanho) || tamanho < 0 || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error('Inventario de restauracao invalido para o anexo ' + (id || '?') + '.');
    }
    return { id: id, size: tamanho, sha256: sha256 };
  }

  function substituirIndexedDbRestaurado(bundle, anexos) {
    return new Promise(function (res, rej) {
      if (!_db) { return rej(new Error('IndexedDB indisponivel para concluir a restauracao.')); }
      let tx;
      try { tx = _db.transaction(['kv', 'anexos'], 'readwrite'); }
      catch (e) { return rej(e); }
      tx.oncomplete = function () { res(true); };
      tx.onerror = function () { rej(tx.error || new Error('Falha ao restaurar o IndexedDB.')); };
      tx.onabort = function () { rej(tx.error || new Error('Restauracao do IndexedDB abortada.')); };
      try {
        const kv = tx.objectStore('kv');
        const blobs = tx.objectStore('anexos');
        blobs.clear();
        anexos.forEach(function (x) {
          blobs.put({ id: x.id, nomeArquivo: x.nomeArquivo, mime: x.mime, blob: x.blob });
        });
        kv.put({ k: CHAVE_BUNDLE, v: bundle });
      } catch (e) {
        try { tx.abort(); } catch (ignorar) { /* ja abortada */ }
        rej(e);
      }
    });
  }

  function verificarIndexedDbRestaurado() {
    return new Promise(function (res, rej) {
      if (!_db) { return rej(new Error('IndexedDB indisponivel.')); }
      let tx;
      try { tx = _db.transaction(['kv', 'anexos'], 'readonly'); }
      catch (e) { return rej(e); }
      const bundleReq = tx.objectStore('kv').get(CHAVE_BUNDLE);
      const countReq = tx.objectStore('anexos').count();
      tx.oncomplete = function () {
        res({ bundle: bundleReq.result && bundleReq.result.v, attachmentCount: Number(countReq.result || 0) });
      };
      tx.onerror = function () { rej(tx.error || new Error('Falha ao verificar o IndexedDB restaurado.')); };
      tx.onabort = function () { rej(tx.error || new Error('Verificacao do IndexedDB abortada.')); };
    });
  }

  async function sincronizarRestorePendente() {
    store.restauracaoAplicada = null;
    if (!temServidor() || !tokenAdministrativo() || !store.statusDisco.online) { return false; }
    const r = await apiFetch('/api/restore-pending', { timeout: 30000 });
    if (!r.ok) { throw new Error('Servidor recusou a consulta de restauracao pendente (' + r.status + ').'); }
    const resposta = await r.json();
    if (!resposta.pending) { return false; }
    if (!_db) { throw new Error('Ha uma restauracao pendente, mas o IndexedDB nao esta disponivel.'); }
    const pending = resposta.restore || {};
    const inventarioBruto = Array.isArray(pending.attachments) ? pending.attachments :
      (Array.isArray(pending.attachmentInventory) ? pending.attachmentInventory : []);
    const inventario = inventarioBruto.map(normalizarEntradaRestore);
    const ids = Object.create(null);
    inventario.forEach(function (x) {
      if (ids[x.id]) { throw new Error('Inventario de restauracao repete o anexo ' + x.id + '.'); }
      ids[x.id] = true;
    });

    const portfolioResp = await apiFetch('/api/portfolio', { timeout: 60000 });
    if (!portfolioResp.ok) { throw new Error('Portfolio restaurado nao esta disponivel no servidor.'); }
    const portfolioBytes = new Uint8Array(await portfolioResp.arrayBuffer());
    const portfolioSha = await sha256Bytes(portfolioBytes);
    if (portfolioSha !== String(pending.portfolioSha256 || '').toLowerCase()) {
      throw new Error('SHA-256 do portfolio restaurado diverge do journal.');
    }
    const bundle = JSON.parse(decodificarUtf8(portfolioBytes));
    if (Number((bundle.meta || {}).schemaVersion) !== Number(pending.sourceSchemaVersion) ||
        String((bundle.meta || {}).appVersion || '') !== String(pending.sourceAppVersion || '')) {
      throw new Error('Portfolio restaurado diverge da versao/schema registrados.');
    }
    const metas = Object.create(null);
    (bundle.anexos || []).forEach(function (a) {
      if (!a || !a.id || metas[a.id]) { throw new Error('Metadados de anexos restaurados invalidos.'); }
      metas[a.id] = a;
    });
    if (Object.keys(metas).length !== inventario.length) {
      throw new Error('Inventario restaurado nao corresponde aos metadados do portfolio.');
    }

    const blobs = [];
    for (let i = 0; i < inventario.length; i++) {
      const entrada = inventario[i];
      const meta = metas[entrada.id];
      if (!meta || Number(meta.tamanho) !== entrada.size) {
        throw new Error('Metadados divergem para o anexo restaurado ' + entrada.id + '.');
      }
      const ar = await apiFetch('/api/attachments/' + encodeURIComponent(entrada.id), { timeout: 120000 });
      if (!ar.ok) { throw new Error('Anexo restaurado ausente: ' + entrada.id + '.'); }
      const blob = await ar.blob();
      if (blob.size !== entrada.size) { throw new Error('Tamanho divergente no anexo restaurado ' + entrada.id + '.'); }
      const sha = await sha256Bytes(new Uint8Array(await blob.arrayBuffer()));
      if (sha !== entrada.sha256) { throw new Error('SHA-256 divergente no anexo restaurado ' + entrada.id + '.'); }
      blobs.push({ id: entrada.id, nomeArquivo: meta.nomeArquivo || entrada.id,
        mime: meta.mime || blob.type || 'application/octet-stream', blob: blob });
    }

    await substituirIndexedDbRestaurado(bundle, blobs);
    const comprovacao = await verificarIndexedDbRestaurado();
    if (!comprovacao.bundle || comprovacao.attachmentCount !== inventario.length) {
      throw new Error('IndexedDB nao confirmou todos os registros restaurados.');
    }
    const ackBody = {
      snapshotId: String(pending.snapshotId || ''), activationId: activationId() || null,
      portfolioSha256: portfolioSha, sourceSchemaVersion: Number(pending.sourceSchemaVersion),
      sourceAppVersion: String(pending.sourceAppVersion || ''), indexedDbReady: true,
      attachments: inventario
    };
    const ack = await apiFetch('/api/restore-ack', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(ackBody), timeout: 60000
    });
    if (!ack.ok) { throw new Error('Servidor recusou a confirmacao da restauracao (' + ack.status + ').'); }
    store.restauracaoAplicada = { snapshotId: ackBody.snapshotId, portfolioSha256: portfolioSha,
      attachmentCount: inventario.length };
    return true;
  }

  /* ================================================================= init */

  /**
   * Carrega o bundle. Precedencia: o mais recente entre disco e IndexedDB.
   * Se ambos vazios, devolve portfolio vazio (o app decide semear).
   */
  store.init = async function (opts) {
    const o = opts || {};
    store.somenteLeitura = false;
    store.motivoSomenteLeitura = null;
    store.manutencao = false;
    store.ultimaMigracao = null;
    store.statusAtualizacao = { fase: 'ocioso', erro: null };
    _db = await abrirDb();
    await checarServidor();
    await sincronizarRestorePendente();

    let doIdb = null;
    let doDisco = null;

    if (_db) {
      try {
        const reg = await idbGet('kv', CHAVE_BUNDLE);
        if (reg && reg.v) { doIdb = reg.v; }
      } catch (e) {
        store.statusIdb = { online: false, erro: String(e.message || e) };
      }
    }

    if (store.statusDisco.online) {
      try {
        const r = await apiFetch('/api/portfolio');
        if (r.status === 200) {
          const txt = await r.text();
          if (txt && txt.trim()) { doDisco = JSON.parse(txt); }
        }
      } catch (e) {
        store.statusDisco.erro = 'Não consegui ler data/portfolio.json: ' + (e.message || e);
      }
    }

    const tIdb = doIdb ? String((doIdb.meta || {}).salvoEm || '') : '';
    const tDisco = doDisco ? String((doDisco.meta || {}).salvoEm || '') : '';
    const msIdb = tIdb ? Date.parse(tIdb) : NaN;
    const msDisco = tDisco ? Date.parse(tDisco) : NaN;
    const dataIdbValida = Number.isFinite(msIdb);
    const dataDiscoValida = Number.isFinite(msDisco);
    const idbFuturo = doIdb && M.versaoSchema(doIdb) > M.SCHEMA_VERSION;
    const discoFuturo = doDisco && M.versaoSchema(doDisco) > M.SCHEMA_VERSION;

    let escolhido = null;
    let origem = 'vazio';
    let conflitoTemporal = false;

    function escolherEntreReplicas() {
      const iguais = JSON.stringify(doIdb) === JSON.stringify(doDisco);
      if (iguais) { escolhido = doIdb; origem = 'navegador'; return; }
      if (dataIdbValida && dataDiscoValida && msIdb !== msDisco) {
        if (msDisco > msIdb) { escolhido = doDisco; origem = 'disco'; }
        else { escolhido = doIdb; origem = 'navegador'; }
        return;
      }

      // Sem dois instantes validos e distintos nao existe base segura para
      // decidir qual replica e a mais nova. Carregamos a copia do disco apenas
      // para inspecao, mas bloqueamos qualquer gravacao ate reconciliacao
      // explicita; assim nenhuma replica e sobrescrita por uma suposicao.
      escolhido = doDisco;
      origem = 'disco';
      conflitoTemporal = true;
    }

    // A presença de qualquer cópia futura vence a comparação temporal. Uma
    // versão antiga jamais pode escolher a réplica conhecida e depois
    // sobrescrever silenciosamente a cópia de schema superior.
    if (idbFuturo || discoFuturo) {
      if (idbFuturo && discoFuturo) {
        escolherEntreReplicas();
      } else if (discoFuturo) { escolhido = doDisco; origem = 'disco'; }
      else { escolhido = doIdb; origem = 'navegador'; }
    } else if (doIdb && doDisco) {
      escolherEntreReplicas();
      if (conflitoTemporal) {
        emissor.emitir('conflito', {
          origem: origem,
          msgIdb: dataIdbValida ? U.fmtDataHora(tIdb) : 'data ausente ou inválida',
          msgDisco: dataDiscoValida ? U.fmtDataHora(tDisco) : 'data ausente ou inválida',
          texto: 'As cópias do disco e do navegador divergem, mas não possuem datas comparáveis. O aplicativo foi aberto somente para leitura.'
        });
      } else if (msIdb !== msDisco) {
        const maisNovo = origem === 'disco' ? 'do disco' : 'do navegador';
        emissor.emitir('conflito', {
          origem: origem,
          msgIdb: U.fmtDataHora(tIdb),
          msgDisco: U.fmtDataHora(tDisco),
          texto: 'Havia duas versões salvas. Carreguei a mais recente (' + maisNovo + ').'
        });
      }
    } else if (doDisco) { escolhido = doDisco; origem = 'disco'; }
    else if (doIdb) { escolhido = doIdb; origem = 'navegador'; }

    if (escolhido) {
      _bundleOrigemBruto = U.clonar(escolhido);
      const versao = M.versaoSchema(escolhido);
      if (versao > M.SCHEMA_VERSION) {
        store.somenteLeitura = true;
        store.motivoSomenteLeitura = 'O portfólio usa o schema v' + versao +
          ', superior ao v' + M.SCHEMA_VERSION + ' suportado por este app.';
        store.state = M.prepararSomenteLeitura(escolhido);
      } else {
        const migracao = M.migrarComRelatorio(escolhido);
        store.state = migracao.bundle;
        store.ultimaMigracao = migracao.relatorio;
        if (_db && migracao.relatorio.passos.length) {
          const salvo = String(((escolhido.meta || {}).salvoEm) || 'sem-data')
            .replace(/[^0-9A-Za-z_-]/g, '-').slice(0, 80);
          const chavePreMigracao = 'pre-migration-v' + migracao.relatorio.de + '-' + salvo;
          try {
            await idbOp('kv', 'readwrite', function (os) {
              os.put({ k: chavePreMigracao, v: U.clonar(escolhido),
                criadoEm: U.agoraIso(), destinoSchema: M.SCHEMA_VERSION });
            });
            store.ultimaMigracao.backupIdb = chavePreMigracao;
          } catch (e) {
            store.ultimaMigracao.avisoBackup = 'Não foi possível guardar a cópia pré-migração no IndexedDB: ' +
              (e.message || e);
          }
        }
      }
      if (conflitoTemporal && !store.somenteLeitura) {
        store.somenteLeitura = true;
        store.motivoSomenteLeitura = 'As cópias persistidas divergem e suas datas não permitem determinar com segurança qual é a mais recente.';
      }
    } else if (o.semear && typeof o.semear === 'function') {
      const semente = o.semear();
      _bundleOrigemBruto = U.clonar(semente);
      const migracao = M.migrarComRelatorio(semente);
      store.state = migracao.bundle;
      store.ultimaMigracao = migracao.relatorio;
      origem = 'semente';
    } else {
      store.state = M.portfolioVazio();
      _bundleOrigemBruto = U.clonar(store.state);
    }

    store.origemCarga = origem;
    store.pronto = true;
    emissor.emitir('status', store.statusDisco);
    emissor.emitir('change', { acao: 'carregar', origem: origem });
    if (store.somenteLeitura) {
      emissor.emitir('somente-leitura', { motivo: store.motivoSomenteLeitura });
    } else if (origem === 'semente') { agendarDisco(); persistirIdb(); }
    return { origem: origem, somenteLeitura: store.somenteLeitura, migracao: store.ultimaMigracao };
  };

  /* ========================================================== persistencia */

  async function persistirIdb() {
    if (store.somenteLeitura || store.manutencao) { return false; }
    if (!_db) { return false; }
    try {
      await idbOp('kv', 'readwrite', function (os) {
        os.put({ k: CHAVE_BUNDLE, v: store.state });
      });
      store.statusIdb.online = true;
      store.statusIdb.erro = null;
      return true;
    } catch (e) {
      store.statusIdb.online = false;
      store.statusIdb.erro = String(e.message || e);
      emissor.emitir('erro', { onde: 'indexeddb', erro: store.statusIdb.erro });
      return false;
    }
  }

  async function persistirDisco(forcar) {
    if (store.somenteLeitura || store.manutencao) { return false; }
    if (!forcar && !store.state.settings.salvarEmDisco) { return false; }
    if (!temServidor()) { return false; }
    store.statusDisco.salvando = true;
    emissor.emitir('status', store.statusDisco);
    try {
      const corpo = JSON.stringify(store.state);
      const r = await apiFetch('/api/portfolio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: corpo,
        timeout: 30000
      });
      if (!r.ok) { throw new Error('servidor respondeu ' + r.status); }
      store.statusDisco.online = true;
      store.statusDisco.ultimoSalvo = U.agoraIso();
      store.statusDisco.erro = null;
      store.statusDisco.pendente = false;
      return true;
    } catch (e) {
      store.statusDisco.online = false;
      store.statusDisco.erro = 'Falha ao gravar em disco: ' + (e.message || e);
      store.statusDisco.pendente = true;
      emissor.emitir('erro', { onde: 'disco', erro: store.statusDisco.erro });
      return false;
    } finally {
      store.statusDisco.salvando = false;
      emissor.emitir('status', store.statusDisco);
    }
  }

  function agendarDisco() {
    if (store.somenteLeitura || store.manutencao) { return; }
    store.statusDisco.pendente = true;
    if (_timerDisco) { clearTimeout(_timerDisco); }
    _timerDisco = setTimeout(function () {
      _timerDisco = null;
      persistirDisco();
    }, DEBOUNCE_DISCO);
  }

  store.salvarAgora = async function (opts) {
    const o = opts || {};
    if (motivoBloqueio()) { return { indexeddb: false, disco: false, erro: motivoBloqueio() }; }
    if (_timerDisco) { clearTimeout(_timerDisco); _timerDisco = null; }
    const a = await persistirIdb();
    const b = await persistirDisco(!!o.forcarDisco);
    return { indexeddb: a, disco: b };
  };

  /* =============================================================== mutate */

  store.definirAtor = function (nome) { _atorAtual = nome || 'PMO Lead'; };

  function registrarAudit(acao, meta) {
    const m = meta || {};
    const entrada = {
      id: U.uid('aud'),
      em: U.agoraIso(),
      ator: _atorAtual,
      acao: acao,
      entidade: m.entidade || null,
      entidadeId: m.entidadeId || null,
      resumo: m.resumo || '',
      campos: m.campos || null
    };
    // Campos opcionais (20-01, 20-05, 20-06): só gravados quando presentes em
    // meta, para entradas antigas e novas sem esses campos manterem o formato
    // atual byte a byte.
    if (m.snapshotId !== undefined) { entrada.snapshotId = m.snapshotId; }
    if (m.payload !== undefined) { entrada.payload = U.clonar(m.payload); }
    if (m.restauraDe !== undefined) { entrada.restauraDe = m.restauraDe; }
    if (m.copia !== undefined) { entrada.copia = U.clonar(m.copia); }
    store.state.auditLog.push(entrada);
  }

  /**
   * Unica porta de entrada para mutacao (G8).
   *   await Store.mutate('Atualizar projeto', draft => { ... }, {entidade,entidadeId,resumo,campos})
   * fn recebe um rascunho clonado; se lancar, nada e commitado.
   */
  store.mutate = async function (acao, fn, meta) {
    const bloqueio = motivoBloqueio();
    if (bloqueio) {
      emissor.emitir('erro', { onde: 'mutate', erro: bloqueio, acao: acao });
      U.toast(bloqueio, 'warn');
      return { ok: false, erro: bloqueio, bloqueado: true };
    }
    const anterior = U.clonar(store.state);
    let draft;
    try {
      draft = U.clonar(store.state);
      fn(draft);
    } catch (e) {
      emissor.emitir('erro', { onde: 'mutate', erro: String(e.message || e), acao: acao });
      U.toast('Alteração não aplicada: ' + (e.message || e), 'erro');
      return { ok: false, erro: String(e.message || e) };
    }

    draft.meta.salvoEm = U.agoraIso();
    draft.meta.schemaVersion = M.SCHEMA_VERSION;
    draft.meta.appVersion = M.APP_VERSION;

    _undo.push(anterior);
    if (_undo.length > LIMITE_UNDO) { _undo.shift(); }
    _redo = [];

    store.state = draft;
    registrarAudit(acao, meta);

    await persistirIdb();
    agendarDisco();
    emissor.emitir('change', { acao: acao, meta: meta || null });
    return { ok: true };
  };

  /** Mutacao sincrona sem await, para interacoes de alta frequencia (arrastar). */
  store.mutateRapido = function (acao, fn, meta) {
    return store.mutate(acao, fn, meta);
  };

  store.podeDesfazer = function () { return _undo.length > 0; };
  store.podeRefazer = function () { return _redo.length > 0; };

  store.desfazer = async function () {
    if (motivoBloqueio()) { U.toast(motivoBloqueio(), 'warn'); return false; }
    if (!_undo.length) { U.toast('Nada para desfazer.', 'info'); return false; }
    _redo.push(U.clonar(store.state));
    store.state = _undo.pop();
    store.state.meta.salvoEm = U.agoraIso();
    await persistirIdb();
    agendarDisco();
    emissor.emitir('change', { acao: 'desfazer' });
    return true;
  };

  store.refazer = async function () {
    if (motivoBloqueio()) { U.toast(motivoBloqueio(), 'warn'); return false; }
    if (!_redo.length) { U.toast('Nada para refazer.', 'info'); return false; }
    _undo.push(U.clonar(store.state));
    store.state = _redo.pop();
    store.state.meta.salvoEm = U.agoraIso();
    await persistirIdb();
    agendarDisco();
    emissor.emitir('change', { acao: 'refazer' });
    return true;
  };

  /* ============================================================== bundle */

  store.exportarBundle = function () {
    const b = store.somenteLeitura && _bundleOrigemBruto
      ? U.clonar(_bundleOrigemBruto)
      : U.clonar(store.state);
    b.meta.geradoEm = U.agoraIso();
    if (!store.somenteLeitura) { b.meta.appVersion = M.APP_VERSION; }
    return b;
  };

  /** Bundle exato selecionado no boot, antes de qualquer migração em memória. */
  store.exportarBundleOrigem = function () {
    return U.clonar(_bundleOrigemBruto || store.state);
  };

  /** Estado canônico atual sem alterar metadados para fins de snapshot. */
  store.exportarBundleBruto = function () {
    return U.clonar(store.somenteLeitura && _bundleOrigemBruto ? _bundleOrigemBruto : store.state);
  };

  /**
   * modo 'substituir' troca todo o portfolio; 'mesclar' adiciona/atualiza por codigo.
   */
  store.importarBundle = async function (bundle, modo) {
    exigirEscrita();
    const novo = M.migrar(bundle);
    if (modo === 'mesclar') {
      return store.mutate('Mesclar bundle importado', function (d) {
        const porCodigo = {};
        d.projetos.forEach(function (p) { if (p.codigo) { porCodigo[U.normalizar(p.codigo)] = p; } });
        const idsPessoas = {};
        d.pessoas.forEach(function (p) { idsPessoas[p.id] = true; });
        novo.pessoas.forEach(function (p) { if (!idsPessoas[p.id]) { d.pessoas.push(p); } });
        const idsProg = {};
        d.programas.forEach(function (p) { idsProg[p.id] = true; });
        novo.programas.forEach(function (p) { if (!idsProg[p.id]) { d.programas.push(p); } });

        let novos = 0, atualizados = 0;
        novo.projetos.forEach(function (p) {
          const ex = p.codigo ? porCodigo[U.normalizar(p.codigo)] : null;
          if (ex) {
            const id = ex.id;
            U.mesclar(ex, p);
            ex.id = id;
            ex.atualizadoEm = U.agoraIso();
            atualizados += 1;
          } else {
            d.projetos.push(p);
            novos += 1;
          }
        });
        d.imports.push({ id: U.uid('imp'), em: U.agoraIso(), kind: 'bundle',
          fileName: (bundle && bundle.__fileName) || 'bundle.json',
          resumo: novos + ' novos, ' + atualizados + ' atualizados' });
      }, { entidade: 'bundle', resumo: 'mesclagem de bundle' });
    }
    // modo 'substituir' (PROT-02, D-32 item 2): so roda depois de um snapshot
    // de protecao verificado; a trilha local (auditLog/imports) e mesclada
    // com a do arquivo por id, nunca sobrescrita (achado A-3).
    try {
      const snap = await snapshotProtecao('substituir');
      const meta = { entidade: 'bundle', resumo: '' };
      if (snap.snapshotId) { meta.snapshotId = snap.snapshotId; }
      const r = await store.mutate('Substituir portfólio por bundle importado', function (d) {
        const resAud = M.mesclarTrilha(d.auditLog, novo.auditLog);
        const resImp = M.mesclarTrilha(d.imports, novo.imports);
        Object.keys(novo).forEach(function (k) {
          if (k === 'auditLog' || k === 'imports') { return; }
          d[k] = novo[k];
        });
        d.auditLog = resAud.lista;
        d.imports = resImp.lista.concat([{ id: U.uid('imp'), em: U.agoraIso(),
          kind: 'bundle', fileName: (bundle && bundle.__fileName) || 'bundle.json',
          resumo: novo.projetos.length + ' projetos substituíram o portfólio' }]);
        meta.resumo = 'substituição total' +
          (snap.dispensado ? '; sem servidor e sem dado a proteger' : '; snapshot verificado ' + snap.snapshotId) +
          '; +' + resAud.adicionadas + ' eventos e +' + resImp.adicionadas +
          ' importações do arquivo; ' + (resAud.ignoradasPorIdRepetido + resImp.ignoradasPorIdRepetido) +
          ' ignorados por id repetido';
      }, meta);
      if (!r.ok) {
        const erro = new Error(r.erro || 'Não foi possível substituir o portfólio.');
        erro.jaNotificado = true;
        throw erro;
      }
      emitirProtecao('substituir', 'concluido', { snapshotId: snap.snapshotId });
      return { ok: true, snapshotId: snap.snapshotId, dispensado: snap.dispensado };
    } catch (e) {
      emitirProtecao('substituir', 'falhou', { erro: String(e.message || e) });
      emissor.emitir('erro', { onde: 'protecao', erro: String(e.message || e) });
      if (!e.jaNotificado) {
        U.toast('Substituição cancelada: ' + (e.message || e), 'erro');
      }
      throw e;
    }
  };

  /* ===================================================== proteção (PROT-01) */

  function emitirProtecao(operacao, fase, extra) {
    const e = extra || {};
    store.statusProtecao = {
      operacao: operacao,
      fase: fase,
      erro: e.erro || null,
      snapshotId: e.snapshotId || null
    };
    emissor.emitir('protecao-status', store.statusProtecao);
  }

  /**
   * Força a gravação em disco e a materialização dos anexos, confirmando que
   * o selo `meta.salvoEm` não mudou no meio do caminho. Espelha a sequência
   * de `prepararAtualizacao`, mas não mexe em `store.manutencao` nem no
   * fluxo do updater.
   */
  async function materializarEstadoVerificado() {
    const selo = String((store.state.meta || {}).salvoEm || '');
    const salvo = await store.salvarAgora({ forcarDisco: true });
    if (!salvo.disco || (_db && !salvo.indexeddb)) {
      throw new Error('Não foi possível confirmar o portfólio no navegador e no disco; nada foi alterado.');
    }
    const inventario = await store.inventariarAnexos({ materializar: true });
    if (!inventario.ok) {
      throw new Error('Inventário de anexos inválido: ' + inventario.erros.join(' '));
    }
    if (String((store.state.meta || {}).salvoEm || '') !== selo) {
      throw new Error('Os dados foram alterados durante a proteção; tente de novo com o aplicativo ocioso.');
    }
    return { selo: selo, inventario: inventario };
  }

  /**
   * Cria (ou dispensa) o snapshot de proteção pré-Limpar/Substituir no
   * servidor local. Sem servidor: dispensa quando não há dado a proteger
   * (P-05), senão recusa a operação inteira.
   */
  async function snapshotProtecao(operacao) {
    exigirEscrita();
    if (!temServidor()) {
      if (!M.temDadoAProteger(store.state)) {
        emitirProtecao(operacao, 'dispensado');
        return { dispensado: true, snapshotId: null };
      }
      throw new Error('Esta operação exige o servidor local (abra pelo pmo.ps1) para criar antes um snapshot verificado; nada foi alterado.');
    }
    emitirProtecao(operacao, 'salvando');
    const estado = await materializarEstadoVerificado();
    emitirProtecao(operacao, 'materializando-anexos');
    emitirProtecao(operacao, 'selando-snapshot');
    const pedido = {
      operation: operacao,
      appVersion: M.APP_VERSION,
      schemaVersion: M.SCHEMA_VERSION,
      salvoEm: estado.selo || null,
      anexos: estado.inventario.itens.map(function (x) {
        return { id: x.id, tamanho: x.tamanho, sha256: String(x.sha256 || '').toLowerCase() };
      })
    };
    const r = await apiFetch('/api/protecao/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(pedido),
      timeout: 120000
    });
    if (!r.ok) {
      let mensagemServidor = '';
      try {
        const corpo = await r.json();
        mensagemServidor = corpo && corpo.erro ? String(corpo.erro) : '';
      } catch (e) { /* corpo sem JSON legível */ }
      throw new Error('O servidor recusou o snapshot de proteção (' + r.status + '): ' +
        mensagemServidor + '. Nada foi alterado.');
    }
    const resposta = await r.json();
    if (!resposta || resposta.ok === false ||
        !/^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$/.test(String(resposta.snapshotId || ''))) {
      throw new Error('O servidor recusou o snapshot de proteção: resposta inválida. Nada foi alterado.');
    }
    if (String((store.state.meta || {}).salvoEm || '') !== estado.selo) {
      throw new Error('Os dados mudaram enquanto o snapshot era selado; nada foi alterado.');
    }
    emitirProtecao(operacao, 'verificado', { snapshotId: resposta.snapshotId });
    return { dispensado: false, snapshotId: resposta.snapshotId, manifest: resposta.manifest };
  }

  store.limparTudo = async function () {
    exigirEscrita();
    try {
      const snap = await snapshotProtecao('limpar');
      const meta = { entidade: 'bundle', resumo: snap.dispensado
        ? 'portfólio zerado; sem servidor e sem dado a proteger'
        : 'portfólio zerado; snapshot verificado ' + snap.snapshotId };
      if (snap.snapshotId) { meta.snapshotId = snap.snapshotId; }
      const r = await store.mutate('Limpar portfólio', function (d) {
        const vazio = M.bundleAposLimpeza(d);
        Object.keys(vazio).forEach(function (k) { d[k] = vazio[k]; });
      }, meta);
      if (!r.ok) {
        const erro = new Error(r.erro || 'Não foi possível limpar o portfólio.');
        erro.jaNotificado = true;
        throw erro;
      }
      if (_db) {
        try { await idbOp('anexos', 'readwrite', function (os) { os.clear(); }); } catch (e) { /* segue */ }
      }
      emitirProtecao('limpar', 'concluido', { snapshotId: snap.snapshotId });
      return { ok: true, snapshotId: snap.snapshotId, dispensado: snap.dispensado };
    } catch (e) {
      emitirProtecao('limpar', 'falhou', { erro: String(e.message || e) });
      emissor.emitir('erro', { onde: 'protecao', erro: String(e.message || e) });
      if (!e.jaNotificado) {
        U.toast('Limpeza cancelada: ' + (e.message || e), 'erro');
      }
      throw e;
    }
  };

  store.estaVazio = function () {
    return !store.state.projetos.length && !store.state.programas.length;
  };

  /* ============================================== cópia verificável (PROT-05) */

  /**
   * Exporta uma cópia verificável (manifesto SHA-256) para uma pasta que a PMO
   * escolhe, fora da instalação (D-32 item 4, G11). Exige servidor e modo de
   * escrita (P-21); o token administrativo nunca vai junto (D-30).
   */
  store.exportarCopiaVerificavel = async function (destino) {
    exigirEscrita();
    if (!temServidor()) {
      throw new Error('A cópia verificável exige o servidor local (abra pelo pmo.ps1).');
    }
    if (typeof destino !== 'string' || !destino.trim()) {
      throw new Error('Escolha uma pasta de destino para a cópia verificável.');
    }
    try {
      emitirProtecao('copia', 'salvando');
      const estado = await materializarEstadoVerificado();
      emitirProtecao('copia', 'materializando-anexos');
      emitirProtecao('copia', 'selando-snapshot');
      const pedido = {
        destino: destino,
        appVersion: M.APP_VERSION,
        schemaVersion: M.SCHEMA_VERSION,
        salvoEm: estado.selo || null,
        anexos: estado.inventario.itens.map(function (x) {
          return { id: x.id, tamanho: x.tamanho, sha256: String(x.sha256 || '').toLowerCase() };
        })
      };
      const r = await apiFetch('/api/copia-verificavel/exportar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(pedido),
        timeout: 300000
      });
      if (!r.ok) {
        let mensagemServidor = '';
        try {
          const corpo = await r.json();
          mensagemServidor = corpo && corpo.erro ? String(corpo.erro) : '';
        } catch (e) { /* corpo sem JSON legível */ }
        throw new Error('A cópia não foi criada (' + r.status + '): ' + mensagemServidor);
      }
      const resposta = await r.json();
      emitirProtecao('copia', 'verificado', { snapshotId: resposta.copyId });
      await store.mutate('Exportar cópia verificável', function () { /* sem mudança de dado (P-20) */ }, {
        entidade: 'copia', entidadeId: resposta.copyId,
        resumo: resposta.arquivos + ' arquivos em ' + resposta.pasta,
        copia: {
          copyId: resposta.copyId, destino: destino, pasta: resposta.pasta,
          manifestSha256: resposta.manifestSha256, arquivos: resposta.arquivos, bytes: resposta.bytes
        }
      });
      emitirProtecao('copia', 'concluido', { snapshotId: resposta.copyId });
      return {
        ok: true, copyId: resposta.copyId, pasta: resposta.pasta,
        arquivos: resposta.arquivos, bytes: resposta.bytes, manifestSha256: resposta.manifestSha256
      };
    } catch (e) {
      emitirProtecao('copia', 'falhou', { erro: String(e.message || e) });
      emissor.emitir('erro', { onde: 'protecao', erro: String(e.message || e) });
      U.toast('Cópia verificável não criada: ' + (e.message || e), 'erro');
      throw e;
    }
  };

  /**
   * Confere uma cópia verificável já exportada, apontando arquivo alterado,
   * faltando, a mais ou manifesto trocado. Somente leitura — nunca grava audit
   * (P-20).
   */
  store.conferirCopiaVerificavel = async function (pasta) {
    if (!temServidor()) {
      throw new Error('A conferência da cópia verificável exige o servidor local (abra pelo pmo.ps1).');
    }
    const r = await apiFetch('/api/copia-verificavel/conferir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ pasta: pasta }),
      timeout: 300000
    });
    if (!r.ok) {
      let mensagemServidor = '';
      try {
        const corpo = await r.json();
        mensagemServidor = corpo && corpo.erro ? String(corpo.erro) : '';
      } catch (e) { /* corpo sem JSON legível */ }
      throw new Error('Não foi possível conferir a cópia (' + r.status + '): ' + mensagemServidor);
    }
    const resposta = await r.json();
    const erros = (resposta.erros || []).slice();
    const avisos = [];
    let ok = !!resposta.ok;
    const entradaTrilha = (store.state.auditLog || []).slice().reverse()
      .find(function (a) { return a.copia && a.copia.copyId === resposta.copyId; });
    if (entradaTrilha) {
      if (entradaTrilha.copia.manifestSha256 && resposta.manifestSha256 &&
          entradaTrilha.copia.manifestSha256 !== resposta.manifestSha256) {
        erros.push('manifesto diferente do registrado na exportação de ' + U.fmtDataHora(entradaTrilha.em));
        ok = false;
      }
    } else {
      avisos.push('cópia sem registro nesta trilha');
    }
    return {
      ok: ok, copyId: resposta.copyId, pasta: resposta.pasta, conferidoEm: resposta.conferidoEm,
      arquivos: resposta.arquivos, erros: erros, avisos: avisos
    };
  };

  /** Entradas da trilha com `copia`, mais recentes primeiro (G9: sem entradas → []). */
  store.listarCopiasVerificaveis = function () {
    return (store.state.auditLog || [])
      .filter(function (a) { return !!a.copia; })
      .map(function (a) {
        return {
          copyId: a.copia.copyId, pasta: a.copia.pasta, em: a.em, ator: a.ator,
          arquivos: a.copia.arquivos, bytes: a.copia.bytes, manifestSha256: a.copia.manifestSha256
        };
      })
      .reverse();
  };

  /** Backups rotativos e a retenção efetiva (P-15), para a tela do 20-10. */
  store.consultarBackups = async function () {
    if (!temServidor()) { return { itens: [], retencao: null }; }
    try {
      const r = await apiFetch('/api/backups');
      if (!r.ok) { return { itens: [], retencao: null }; }
      const j = await r.json();
      return { itens: j.itens || [], retencao: j.retencao || null };
    } catch (e) { return { itens: [], retencao: null }; }
  };

  /**
   * Destinos sugeridos (Documentos e OneDrive do usuário) e o último destino
   * usado, para a PMO escolher com um clique em vez de digitar (P-17).
   */
  store.sugerirDestinosCopia = async function () {
    if (!temServidor()) { return { destinos: [], ultimoDestino: null }; }
    try {
      const r = await apiFetch('/api/copia-verificavel/sugestoes');
      if (!r.ok) { return { destinos: [], ultimoDestino: null }; }
      const j = await r.json();
      return { destinos: j.destinos || [], ultimoDestino: j.ultimoDestino || null };
    } catch (e) { return { destinos: [], ultimoDestino: null }; }
  };

  /* ============================================================== anexos */

  async function enviarAnexoDisco(id, meta, bytes) {
    const r = await apiFetch('/api/attachments/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': meta.mime || 'application/octet-stream',
        'X-File-Name': U.nomeArquivoSeguro(meta.nomeArquivo || id) },
      body: bytes,
      timeout: 60000
    });
    let resposta = null;
    try { resposta = await r.json(); } catch (e) { /* resposta antiga/sem JSON */ }
    if (!r.ok) { throw new Error('servidor respondeu ' + r.status); }
    if (resposta && resposta.id && resposta.id !== id) {
      throw new Error('servidor confirmou outro ID (' + resposta.id + ')');
    }
    if (resposta && U.ehNum(resposta.tamanho) && resposta.tamanho !== bytes.byteLength) {
      throw new Error('servidor confirmou tamanho divergente para ' + id);
    }
    return true;
  }

  async function indiceAnexosDisco() {
    if (!temServidor()) { throw new Error('sem servidor local'); }
    const r = await apiFetch('/api/attachments', { timeout: 30000 });
    if (!r.ok) { throw new Error('não consegui consultar os anexos em disco (' + r.status + ')'); }
    const json = await r.json();
    const itens = Array.isArray(json.itens) ? json.itens : [];
    const porId = Object.create(null);
    itens.forEach(function (x) {
      if (x && x.id) { porId[String(x.id)] = x; }
    });
    return { itens: itens, porId: porId };
  }

  /**
   * Grava o blob no IndexedDB e replica em disco quando o servidor estiver ativo.
   * meta: { projetoId, entidadeRef, categoria, descricao, metaExtra }
   */
  store.anexoAdicionar = async function (file, meta) {
    exigirEscrita();
    const m = meta || {};
    if (!file) { throw new Error('nenhum arquivo informado'); }
    const bytes = await U.lerBytes(file);
    const hash = U.hashBytes(bytes);

    const jaExiste = store.state.anexos.find(function (a) {
      return a.hash === hash && a.projetoId === (m.projetoId || null);
    });
    if (jaExiste) {
      U.toast('Este arquivo já está anexado como "' + jaExiste.nomeArquivo + '".', 'warn');
      return jaExiste;
    }

    const ext = U.extensao(file.name);
    const id = U.uid('anx') + (ext ? '.' + ext : '');
    const registro = {
      id: id,
      projetoId: m.projetoId || null,
      entidadeRef: m.entidadeRef || null,
      nomeArquivo: file.name,
      mime: file.type || 'application/octet-stream',
      tamanho: file.size,
      hash: hash,
      categoria: m.categoria || 'outro',
      descricao: m.descricao || '',
      enviadoEm: U.agoraIso(),
      enviadoPor: _atorAtual,
      emDisco: false,
      emNavegador: false,
      versao: 1,
      substitui: m.substitui || null,
      metaExtra: m.metaExtra || null
    };

    if (_db) {
      try {
        await idbOp('anexos', 'readwrite', function (os) {
          os.put({ id: id, nomeArquivo: file.name, mime: registro.mime, blob: new Blob([bytes], { type: registro.mime }) });
        });
        registro.emNavegador = true;
      } catch (e) {
        emissor.emitir('erro', { onde: 'anexo-idb', erro: String(e.message || e) });
      }
    }

    if (temServidor() && store.state.settings.salvarEmDisco) {
      try {
        await enviarAnexoDisco(id, registro, bytes);
        registro.emDisco = true;
      } catch (e) {
        registro.emDisco = false;
        U.toast('Anexo salvo no navegador, mas não em disco: ' + (e.message || e), 'warn');
      }
    }

    if (!registro.emNavegador && !registro.emDisco) {
      throw new Error('não foi possível armazenar o anexo em nenhum destino');
    }

    const resultadoMutacao = await store.mutate('Anexar arquivo', function (d) {
      d.anexos.push(registro);
      if (registro.projetoId) {
        const p = d.projetos.find(function (x) { return x.id === registro.projetoId; });
        if (p && p.anexos.indexOf(id) < 0) { p.anexos.push(id); }
      }
    }, { entidade: 'anexo', entidadeId: id, resumo: file.name });

    // Importação + preservação do original constituem uma única intenção do
    // usuário. Agrupar mantém Ctrl+Z restaurando o estado exato pré-importação.
    if (resultadoMutacao.ok && m.agruparComAnterior && _undo.length > 1) { _undo.pop(); }

    return registro;
  };

  store.anexoMeta = function (id) {
    return store.state.anexos.find(function (a) { return a.id === id; }) || null;
  };

  store.anexoObter = async function (id) {
    const meta = store.anexoMeta(id);
    if (_db) {
      try {
        const reg = await idbGet('anexos', id);
        if (reg && reg.blob) { return { meta: meta, blob: reg.blob }; }
      } catch (e) { /* tenta o disco */ }
    }
    if (temServidor()) {
      try {
        const r = await apiFetch('/api/attachments/' + encodeURIComponent(id), { timeout: 60000 });
        if (r.ok) { return { meta: meta, blob: await r.blob() }; }
      } catch (e) { /* cai no erro abaixo */ }
    }
    throw new Error('conteúdo do anexo não encontrado (nem no navegador, nem em disco)');
  };

  store.anexoUrl = async function (id) {
    const r = await store.anexoObter(id);
    return { url: URL.createObjectURL(r.blob), revogar: function () { URL.revokeObjectURL(this.url); }, meta: r.meta };
  };

  store.anexoBaixar = async function (id) {
    const r = await store.anexoObter(id);
    const nome = (r.meta && r.meta.nomeArquivo) || id;
    return U.download(nome, r.blob);
  };

  store.anexoRemover = async function (id) {
    exigirEscrita();
    const meta = store.anexoMeta(id);
    const mutacao = await store.mutate('Remover anexo', function (d) {
      d.anexos = d.anexos.filter(function (a) { return a.id !== id; });
      d.projetos.forEach(function (p) {
        p.anexos = (p.anexos || []).filter(function (x) { return x !== id; });
      });
    }, { entidade: 'anexo', entidadeId: id, resumo: (meta && meta.nomeArquivo) || id });
    if (!mutacao.ok) { return mutacao; }

    // Primeiro confirma o bundle sem os metadados. Cada blob so pode ser
    // apagado da replica cuja propria persistencia confirmou esse bundle.
    // Em falha, sobra um orfao recuperavel em vez de um metadado sem conteudo.
    const salvo = await store.salvarAgora({ forcarDisco: true });
    const limpeza = { indexeddb: false, disco: false };
    if (salvo.indexeddb && _db) {
      try {
        await idbOp('anexos', 'readwrite', function (os) { os.delete(id); });
        limpeza.indexeddb = true;
      } catch (e) {
        emissor.emitir('erro', { onde: 'anexo-remover-idb', erro: String(e.message || e), anexoId: id });
      }
    }
    if (salvo.disco && temServidor()) {
      try {
        const r = await apiFetch('/api/attachments/' + encodeURIComponent(id), { method: 'DELETE' });
        if (!r.ok) { throw new Error('servidor respondeu ' + r.status); }
        limpeza.disco = true;
      } catch (e) {
        emissor.emitir('erro', { onde: 'anexo-remover-disco', erro: String(e.message || e), anexoId: id });
      }
    }
    return { ok: true, persistencia: salvo, limpeza: limpeza,
      orfaoRecuperavel: (!!_db && !limpeza.indexeddb) || (temServidor() && !limpeza.disco) };
  };

  store.anexosDoProjeto = function (projetoId) {
    return store.state.anexos.filter(function (a) { return a.projetoId === projetoId; });
  };

  /**
   * Confere a realidade física, não o flag `emDisco`. Se `materializar` estiver
   * ativo, copia do IndexedDB apenas os IDs ausentes/divergentes e consulta o
   * índice novamente antes de declarar sucesso.
   */
  store.inventariarAnexos = async function (opts) {
    const o = opts || {};
    if (!temServidor()) {
      return { ok: false, itens: [], erros: ['Sem servidor local para inventariar anexos.'], orfaos: [] };
    }
    const metas = (store.state.anexos || []).slice();
    const erros = [];
    let indice;
    try { indice = await indiceAnexosDisco(); }
    catch (e) { return { ok: false, itens: [], erros: [e.message || String(e)], orfaos: [] }; }

    if (o.materializar) {
      for (let i = 0; i < metas.length; i++) {
        const a = metas[i];
        const esperado = Number(a.tamanho);
        const fisico = indice.porId[a.id];
        let reg = null;
        try { reg = await idbGet('anexos', a.id); } catch (e) { /* relatado abaixo */ }
        if (reg && reg.blob) {
          if (reg.blob.size !== esperado) {
            erros.push(a.id + ': blob do IndexedDB tem ' + reg.blob.size + ' bytes; esperado ' + esperado + '.');
            continue;
          }
          try {
            const bytes = new Uint8Array(await reg.blob.arrayBuffer());
            if (a.hash && U.hashBytes(bytes) !== a.hash) {
              erros.push(a.id + ': conteúdo do IndexedDB diverge do hash registrado.');
              continue;
            }
            const shaIdb = await sha256Bytes(bytes);
            if (!fisico || Number(fisico.tamanho) !== esperado ||
                String(fisico.sha256 || '').toLowerCase() !== shaIdb) {
              await enviarAnexoDisco(a.id, a, bytes);
            }
          } catch (e) {
            erros.push(a.id + ': falha ao materializar — ' + (e.message || e));
          }
        } else if (!fisico || Number(fisico.tamanho) !== esperado) {
          erros.push(a.id + ': ausente/divergente em disco e sem blob no IndexedDB.');
        } else if (a.hash) {
          try {
            const rFisico = await apiFetch('/api/attachments/' + encodeURIComponent(a.id), { timeout: 120000 });
            if (!rFisico.ok) { throw new Error('servidor respondeu ' + rFisico.status); }
            const bytesFisicos = new Uint8Array(await rFisico.arrayBuffer());
            if (bytesFisicos.byteLength !== esperado || U.hashBytes(bytesFisicos) !== a.hash) {
              throw new Error('conteúdo físico diverge do hash registrado');
            }
          } catch (e) {
            erros.push(a.id + ': falha ao validar o arquivo físico — ' + (e.message || e));
          }
        }
      }
      try { indice = await indiceAnexosDisco(); }
      catch (e) { erros.push(e.message || String(e)); }
    }

    const itens = [];
    const idsMetadados = Object.create(null);
    metas.forEach(function (a) {
      if (idsMetadados[a.id]) {
        erros.push(a.id + ': ID duplicado nos metadados do bundle.');
        return;
      }
      idsMetadados[a.id] = true;
      const x = indice.porId[a.id];
      if (!x) {
        erros.push(a.id + ': não encontrado no índice físico após a verificação.');
        return;
      }
      if (Number(x.tamanho) !== Number(a.tamanho)) {
        erros.push(a.id + ': tamanho físico ' + x.tamanho + ' difere de ' + a.tamanho + '.');
        return;
      }
      if (!/^[0-9a-f]{64}$/.test(String(x.sha256 || '').toLowerCase())) {
        erros.push(a.id + ': servidor não forneceu SHA-256 físico válido.');
        return;
      }
      itens.push({
        id: a.id,
        nomeArquivo: a.nomeArquivo,
        tamanho: Number(x.tamanho),
        hash: a.hash || null,
        sha256: x.sha256 || null,
        modificadoEm: x.modificadoEm || null
      });
    });
    const idsBundle = Object.create(null);
    metas.forEach(function (a) { idsBundle[a.id] = true; });
    const orfaos = indice.itens.filter(function (x) { return !idsBundle[x.id]; });
    return { ok: erros.length === 0 && itens.length === metas.length,
      itens: itens, erros: erros, orfaos: orfaos };
  };

  /** Revalida todos os IDs e só atualiza o flag daqueles confirmados no índice. */
  store.ressincronizarAnexos = async function () {
    if (!temServidor()) {
      U.toast('Sem servidor local: não há disco para sincronizar.', 'warn');
      return { ok: 0, falhas: 0, idsOk: [], idsFalha: [] };
    }
    exigirEscrita();
    const inventario = await store.inventariarAnexos({ materializar: true });
    const idsOk = inventario.itens.map(function (x) { return x.id; });
    const confirmados = Object.create(null);
    idsOk.forEach(function (id) { confirmados[id] = true; });
    const idsFalha = (store.state.anexos || []).filter(function (a) { return !confirmados[a.id]; })
      .map(function (a) { return a.id; });
    if ((store.state.anexos || []).length) {
      await store.mutate('Ressincronizar anexos', function (d) {
        d.anexos.forEach(function (a) { a.emDisco = !!confirmados[a.id]; });
      }, { entidade: 'anexo', resumo: idsOk.length + ' anexos verificados em disco; ' +
        idsFalha.length + ' falha(s)' });
    }
    return { ok: idsOk.length, falhas: idsFalha.length,
      idsOk: idsOk, idsFalha: idsFalha, erros: inventario.erros };
  };

  /**
   * Preflight transacional consumido pelo updater. A preferência
   * `salvarEmDisco` não é alterada: apenas esta gravação e a materialização dos
   * blobs são forçadas para que o servidor possa selar um snapshot completo.
   */
  store.prepararAtualizacao = async function (opts) {
    const opcoes = opts || {};
    const operation = String(opcoes.operation || 'update').toLowerCase();
    if (['update', 'rollback', 'restore'].indexOf(operation) < 0) {
      throw new Error('Operacao de preflight invalida.');
    }
    if (operation === 'restore' && !/^[A-Za-z0-9_-]{1,100}$/.test(String(opcoes.targetSnapshotId || ''))) {
      throw new Error('Snapshot alvo invalido para restauracao.');
    }
    exigirEscrita();
    if (!temServidor()) { throw new Error('Atualização exige o servidor local.'); }
    store.statusAtualizacao = { fase: 'salvando', erro: null };
    emissor.emitir('update-status', store.statusAtualizacao);
    const seloInicial = String((store.state.meta || {}).salvoEm || '');
    let servidorSelou = false;
    try {
      const salvo = await store.salvarAgora({ forcarDisco: true });
      if (!salvo.disco || (_db && !salvo.indexeddb)) {
        throw new Error('Não foi possível confirmar o bundle no navegador e no disco.');
      }
      store.statusAtualizacao = { fase: 'materializando-anexos', erro: null };
      emissor.emitir('update-status', store.statusAtualizacao);
      const inventario = await store.inventariarAnexos({ materializar: true });
      if (!inventario.ok) {
        throw new Error('Inventário de anexos inválido: ' + inventario.erros.join(' '));
      }
      if (String((store.state.meta || {}).salvoEm || '') !== seloInicial) {
        throw new Error('Os dados foram alterados durante o preflight. Tente novamente com o aplicativo ocioso.');
      }

      store.statusAtualizacao = { fase: 'selando-snapshot', erro: null };
      emissor.emitir('update-status', store.statusAtualizacao);
      const pedido = {
        operation: operation,
        targetSnapshotId: operation === 'restore' ? String(opcoes.targetSnapshotId) : null,
        appVersion: M.APP_VERSION,
        schemaVersion: M.SCHEMA_VERSION,
        salvoEm: seloInicial || null,
        anexos: inventario.itens.map(function (x) {
          return { id: x.id, tamanho: x.tamanho, sha256: String(x.sha256 || '').toLowerCase() };
        })
      };
      const r = await apiFetch('/api/update/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(pedido),
        timeout: 120000
      });
      if (!r.ok) { throw new Error('Snapshot recusado pelo servidor (' + r.status + ').'); }
      servidorSelou = true;
      const snapshot = await r.json();
      if (snapshot && snapshot.ok === false) {
        throw new Error(snapshot.erro || 'O servidor não conseguiu selar o snapshot.');
      }
      if (String((store.state.meta || {}).salvoEm || '') !== seloInicial) {
        throw new Error('Os dados mudaram enquanto o snapshot era selado; ele não será usado para ativação.');
      }
      store.manutencao = true;
      store.statusAtualizacao = { fase: 'pronto', erro: null,
        operation: operation, targetSnapshotId: opcoes.targetSnapshotId || null,
        snapshotId: snapshot.snapshotId || snapshot.id || null };
      emissor.emitir('update-status', store.statusAtualizacao);
      return { ok: true, bundle: store.exportarBundle(),
        bundleBruto: store.exportarBundleBruto(), inventario: inventario, snapshot: snapshot };
    } catch (e) {
      if (servidorSelou) {
        try { await apiFetch('/api/update/cancel', { method: 'POST', timeout: 30000 }); }
        catch (cancelErro) { /* o launcher recupera o lock na próxima inicialização */ }
      }
      store.manutencao = false;
      store.statusAtualizacao = { fase: 'falhou', erro: String(e.message || e) };
      emissor.emitir('update-status', store.statusAtualizacao);
      throw e;
    }
  };

  store.sairModoManutencao = async function () {
    try {
      if (temServidor() && tokenAdministrativo()) {
        const r = await apiFetch('/api/update/cancel', { method: 'POST', timeout: 30000 });
        if (!r.ok) { throw new Error('servidor respondeu ' + r.status); }
      }
    } finally {
      store.manutencao = false;
      store.statusAtualizacao = { fase: 'ocioso', erro: null };
      emissor.emitir('update-status', store.statusAtualizacao);
    }
  };

  store.consultarAtualizacao = async function () {
    if (!temServidor()) { return { ok: false, configured: false }; }
    const r = await apiFetch('/api/update/check', { timeout: 30000 });
    if (!r.ok) { throw new Error('Não foi possível consultar atualizações (' + r.status + ').'); }
    return r.json();
  };

  store.aplicarAtualizacao = async function () {
    if (!store.manutencao || !store.statusAtualizacao.snapshotId || store.statusAtualizacao.operation !== 'update') {
      throw new Error('A atualização não possui snapshot preparado.');
    }
    const r = await apiFetch('/api/update/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ snapshotId: store.statusAtualizacao.snapshotId }), timeout: 30000
    });
    if (!r.ok) { throw new Error('O updater recusou a ativação (' + r.status + ').'); }
    store.statusAtualizacao = { fase: 'handoff', erro: null,
      snapshotId: store.statusAtualizacao.snapshotId };
    emissor.emitir('update-status', store.statusAtualizacao);
    return r.json();
  };

  store.prepararRollback = function () {
    return store.prepararAtualizacao({ operation: 'rollback' });
  };

  store.aplicarRollback = async function () {
    if (!store.manutencao || !store.statusAtualizacao.snapshotId || store.statusAtualizacao.operation !== 'rollback') {
      throw new Error('O rollback nao possui snapshot hibrido preparado.');
    }
    const r = await apiFetch('/api/rollback/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ snapshotId: store.statusAtualizacao.snapshotId }), timeout: 30000
    });
    if (!r.ok) { throw new Error('O updater recusou o rollback (' + r.status + ').'); }
    store.statusAtualizacao.fase = 'rollback-handoff';
    emissor.emitir('update-status', store.statusAtualizacao);
    return r.json();
  };

  store.prepararRestauracao = function (snapshotId) {
    return store.prepararAtualizacao({ operation: 'restore', targetSnapshotId: snapshotId });
  };

  store.aplicarRestauracao = async function () {
    if (!store.manutencao || !store.statusAtualizacao.snapshotId || store.statusAtualizacao.operation !== 'restore' ||
        !store.statusAtualizacao.targetSnapshotId) {
      throw new Error('A restauracao nao possui snapshot hibrido preparado.');
    }
    const r = await apiFetch('/api/restore/apply', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ snapshotId: store.statusAtualizacao.snapshotId,
        targetSnapshotId: store.statusAtualizacao.targetSnapshotId }), timeout: 30000
    });
    if (!r.ok) { throw new Error('O updater recusou a restauracao (' + r.status + ').'); }
    store.statusAtualizacao.fase = 'restore-handoff';
    emissor.emitir('update-status', store.statusAtualizacao);
    return r.json();
  };

  store.confirmarAppReady = async function () {
    const ativacao = activationId();
    if (!temServidor() || !tokenAdministrativo() || !ativacao) { return false; }
    if (store.somenteLeitura) { throw new Error('Ativacao recusada: portfolio aberto em modo somente leitura.'); }
    const validacao = M.validar(store.state);
    if (!validacao.ok) {
      throw new Error('Ativacao recusada: validacao semantica falhou. ' +
        validacao.erros.map(function (x) { return x.msg || String(x); }).join(' '));
    }
    const salvo = await store.salvarAgora({ forcarDisco: true });
    if (!salvo.disco || !salvo.indexeddb) {
      throw new Error('Ativacao recusada: disco e IndexedDB nao confirmaram o bundle.');
    }
    const inventario = await store.inventariarAnexos({ materializar: true });
    if (!inventario.ok) {
      throw new Error('Ativacao recusada: inventario de anexos invalido. ' + inventario.erros.join(' '));
    }
    const portfolio = await apiFetch('/api/portfolio', { timeout: 60000 });
    if (!portfolio.ok) { throw new Error('Ativacao recusada: portfolio persistido indisponivel.'); }
    const portfolioSha256 = await sha256Bytes(new Uint8Array(await portfolio.arrayBuffer()));
    const r = await apiFetch('/api/app-ready', {
      method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        activationId: ativacao, appVersion: M.APP_VERSION, schemaVersion: M.SCHEMA_VERSION,
        salvoEm: (store.state.meta || {}).salvoEm || null,
        somenteLeitura: !!store.somenteLeitura,
        origemCarga: store.origemCarga || null,
        indexedDbReady: !!salvo.indexeddb, diskReady: !!salvo.disco,
        portfolioSha256: portfolioSha256,
        attachments: inventario.itens.map(function (x) {
          return { id: x.id, size: Number(x.tamanho), sha256: String(x.sha256 || '').toLowerCase() };
        }),
        migrationSteps: store.ultimaMigracao && Array.isArray(store.ultimaMigracao.passos) ?
          store.ultimaMigracao.passos.length : 0
      }), timeout: 15000
    });
    if (!r.ok) { throw new Error('Servidor recusou app-ready (' + r.status + ').'); }
    const ready = await r.json();
    if (!ready.ok || ready.activationId !== ativacao || ready.appVersion !== M.APP_VERSION ||
        Number(ready.schemaVersion) !== Number(M.SCHEMA_VERSION) || ready.activeVersion !== M.APP_VERSION ||
        !ready.diskConfirmed || !ready.indexedDbConfirmed || !ready.attachmentInventoryConfirmed || ready.readOnly !== false) {
      throw new Error('Servidor nao confirmou integralmente a ativacao.');
    }
    return true;
  };

  store.temAtivacaoPendente = function () { return !!activationId(); };

  /* ========================================================= utilitarios */

  store.recarregarDoDisco = async function () {
    exigirEscrita();
    if (!temServidor()) { throw new Error('sem servidor local'); }
    const r = await apiFetch('/api/portfolio');
    if (r.status === 204) { throw new Error('não há portfolio.json em disco'); }
    if (!r.ok) { throw new Error('servidor respondeu ' + r.status); }
    const b = JSON.parse(await r.text());
    const migracao = M.migrarComRelatorio(b);
    _bundleOrigemBruto = U.clonar(b);
    store.state = migracao.bundle;
    store.ultimaMigracao = migracao.relatorio;
    await persistirIdb();
    emissor.emitir('change', { acao: 'recarregar-disco' });
    return true;
  };

  store.listarBackups = async function () {
    if (!temServidor()) { return []; }
    try {
      const r = await apiFetch('/api/backups');
      if (!r.ok) { return []; }
      const j = await r.json();
      return j.itens || [];
    } catch (e) { return []; }
  };

  store.listarSamples = async function () {
    if (!temServidor()) { return []; }
    try {
      const r = await apiFetch('/api/samples');
      if (!r.ok) { return []; }
      const j = await r.json();
      return j.itens || [];
    } catch (e) { return []; }
  };

  /** Baixa um arquivo de samples/ como File, para alimentar a engine de import. */
  store.obterSample = async function (nome) {
    const r = await apiFetch('/samples/' + encodeURIComponent(nome), { timeout: 30000 });
    if (!r.ok) { throw new Error('não consegui ler o exemplo ' + nome); }
    const blob = await r.blob();
    return new File([blob], nome, { type: blob.type || 'application/octet-stream' });
  };

  /** Cronogramas-modelo em templates/ (MSPDI). Mesma mecânica dos samples. */
  store.listarTemplates = async function () {
    if (!temServidor()) { return []; }
    try {
      const r = await apiFetch('/api/templates');
      if (!r.ok) { return []; }
      const j = await r.json();
      return j.itens || [];
    } catch (e) { return []; }
  };

  store.obterTemplate = async function (nome) {
    const r = await apiFetch('/templates/' + encodeURIComponent(nome), { timeout: 30000 });
    if (!r.ok) { throw new Error('não consegui ler o template ' + nome); }
    const blob = await r.blob();
    return new File([blob], nome, { type: blob.type || 'application/xml' });
  };

  store.checarServidor = checarServidor;
  store.temTokenAdministrativo = function () { return !!tokenAdministrativo(); };

  /* ------------------------------------------------- flush antes de sair */

  window.addEventListener('beforeunload', function (e) {
    if (!store.somenteLeitura && !store.manutencao && store.statusDisco.pendente && store.statusDisco.online) {
      try {
        const corpo = JSON.stringify(store.state);
        const token = tokenAdministrativo();
        // Fetch keepalive aceita cabecalho de autenticacao, ao contrario de
        // sendBeacon. Navegadores limitam o corpo pendente a cerca de 64 KiB.
        if (!token || new Blob([corpo]).size > 60 * 1024) { return; }
        fetch('/api/portfolio', {
          method: 'PUT', keepalive: true, cache: 'no-store',
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-PMO-Admin-Token': token },
          body: corpo
        }).then(function (r) {
          if (r.ok) { store.statusDisco.pendente = false; }
        }).catch(function () { /* permanece pendente para a proxima inicializacao */ });
      } catch (err) { /* nada a fazer no unload */ }
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!store.somenteLeitura && !store.manutencao &&
        document.visibilityState === 'hidden' && store.statusDisco.pendente) {
      if (_timerDisco) { clearTimeout(_timerDisco); _timerDisco = null; }
      persistirDisco();
    }
  });

  PMO.store = store;
})(window.PMO = window.PMO || {});
