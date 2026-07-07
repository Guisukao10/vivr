// storage.js - persistência via Supabase (mesma interface do storage.js do Site_Controle,
// mas com dados em cache local carregados de forma assíncrona; leituras são síncronas
// a partir do cache, escritas retornam Promise e atualizam o cache).
// Observação: PostgREST devolve colunas em snake_case (categoria_id, criado_em...);
// as camadas acima (ui.js, cadastros.js, lancamentos.js, analise.js, planejador.js)
// foram portadas esperando camelCase — por isso os mapeamentos abaixo.
(function(){
'use strict';

var _cache = {
  categorias: [],
  subcategorias: [],
  responsaveis: [],
  status: [],
  tiposPagamento: [],
  lancamentos: [],
  budgetPlan: [],
  budgetIncome: null // {id, value} ou null
};

var TABLES = {
  categorias: 'categorias',
  subcategorias: 'subcategorias',
  responsaveis: 'responsaveis',
  status: 'status_lancamento',
  tiposPagamento: 'tipos_pagamento',
  lancamentos: 'lancamentos'
};

/* ── Carga inicial (assíncrona) ── */
function initFinanceiro(){
  return Promise.all([
    db.from(TABLES.categorias).select('*'),
    db.from(TABLES.subcategorias).select('*'),
    db.from(TABLES.responsaveis).select('*'),
    db.from(TABLES.status).select('*'),
    db.from(TABLES.tiposPagamento).select('*'),
    db.from(TABLES.lancamentos).order('data',{ascending:false}).select('*'),
    db.from('budget_plan').select('*'),
    db.from('budget_income').select('*')
  ]).then(function(res){
    _cache.categorias = res[0]||[];
    _cache.subcategorias = (res[1]||[]).map(decorateSubcategoria);
    _cache.responsaveis = res[2]||[];
    _cache.status = res[3]||[];
    _cache.tiposPagamento = res[4]||[];
    _cache.lancamentos = (res[5]||[]).map(normalizeEntryLocal);
    _cache.budgetPlan = res[6]||[];
    _cache.budgetIncome = (res[7]||[])[0]||null;
  });
}

// subcategorias: expõe alias camelCase categoriaId em cima da coluna categoria_id
function decorateSubcategoria(row){
  if (!row) return row;
  row.categoriaId = row.categoria_id;
  return row;
}

// lancamentos: remapeia snake_case -> camelCase antes de passar para Utils.normalizeEntry
function normalizeEntryLocal(item){
  if (!item) return item;
  var mapped = {
    id: item.id,
    tipo: item.tipo,
    categoriaId: item.categoria_id,
    subcategoriaId: item.subcategoria_id,
    responsavelId: item.responsavel_id,
    pagamentoId: item.pagamento_id,
    statusId: item.status_id,
    descricao: item.descricao,
    valor: item.valor,
    data: item.data,
    recurring: item.recorrente,
    fixoVariavel: item.fixo_variavel,
    observacao: item.observacao,
    criadoEm: item.criado_em
  };
  return (window.Utils && Utils.normalizeEntry) ? Utils.normalizeEntry(mapped) : mapped;
}

/* ── Genérico CRUD por entidade simples (categorias, responsaveis, status, tiposPagamento) ── */
function getEntities(entityType){ return _cache[entityType] || []; }

function addEntity(entityType, entity){
  var table = TABLES[entityType];
  return db.from(table).insert(entity).then(function(rows){
    var created = (rows||[])[0];
    _cache[entityType].push(created);
    return created;
  });
}

function updateEntity(entityType, id, data){
  var table = TABLES[entityType];
  return db.from(table).eq('id', id).update(data).then(function(rows){
    var updated = (rows||[])[0];
    var list = _cache[entityType];
    var idx = list.findIndex(function(item){ return item.id === id; });
    if (idx !== -1) list[idx] = updated || Object.assign({}, list[idx], data);
    return updated;
  });
}

function removeEntity(entityType, id){
  var table = TABLES[entityType];
  return db.from(table).eq('id', id).delete().then(function(){
    _cache[entityType] = _cache[entityType].filter(function(item){ return item.id !== id; });
    return _cache[entityType];
  });
}

function getCategorias(){ return getEntities('categorias'); }
function addCategoria(c){ return addEntity('categorias', c); }
function updateCategoria(id, data){ return updateEntity('categorias', id, data); }
function removeCategoria(id){ return removeEntity('categorias', id); }

/* Subcategorias: mapeia categoriaId (camelCase, usado pelas telas) <-> categoria_id (coluna) */
function getSubcategorias(){ return getEntities('subcategorias'); }
function addSubcategoria(s){
  var row = { nome: s.nome, categoria_id: s.categoriaId || s.categoria_id || null };
  return db.from(TABLES.subcategorias).insert(row).then(function(rows){
    var created = decorateSubcategoria((rows||[])[0]);
    _cache.subcategorias.push(created);
    return created;
  });
}
function updateSubcategoria(id, data){
  var row = {};
  if (data.nome !== undefined) row.nome = data.nome;
  if (data.categoriaId !== undefined) row.categoria_id = data.categoriaId;
  return db.from(TABLES.subcategorias).eq('id', id).update(row).then(function(rows){
    var updated = decorateSubcategoria((rows||[])[0]);
    var idx = _cache.subcategorias.findIndex(function(item){ return item.id === id; });
    if (idx !== -1) _cache.subcategorias[idx] = updated || _cache.subcategorias[idx];
    return updated;
  });
}
function removeSubcategoria(id){ return removeEntity('subcategorias', id); }

function getResponsaveis(){ return getEntities('responsaveis'); }
function addResponsavel(r){ return addEntity('responsaveis', r); }
function updateResponsavel(id, data){ return updateEntity('responsaveis', id, data); }
function removeResponsavel(id){ return removeEntity('responsaveis', id); }

function getStatus(){ return getEntities('status'); }
function addStatus(s){ return addEntity('status', s); }
function updateStatus(id, data){ return updateEntity('status', id, data); }
function removeStatus(id){ return removeEntity('status', id); }

function getTiposPagamento(){ return getEntities('tiposPagamento'); }
function addTipoPagamento(t){ return addEntity('tiposPagamento', t); }
function updateTipoPagamento(id, data){ return updateEntity('tiposPagamento', id, data); }
function removeTipoPagamento(id){ return removeEntity('tiposPagamento', id); }

/* ── Lançamentos ── */
function getLancamentos(){ return _cache.lancamentos; }

function addLancamento(lancamento){
  if (!lancamento) return Promise.resolve(null);
  var normalized = (window.Utils && Utils.normalizeEntry) ? Utils.normalizeEntry(lancamento) : lancamento;
  var row = {
    tipo: normalized.tipo,
    categoria_id: normalized.categoriaId || null,
    subcategoria_id: normalized.subcategoriaId || null,
    responsavel_id: normalized.responsavelId || null,
    pagamento_id: normalized.pagamentoId || null,
    status_id: normalized.statusId || null,
    descricao: normalized.descricao,
    valor: normalized.valor,
    data: normalized.data,
    recorrente: !!normalized.recurring,
    fixo_variavel: normalized.fixoVariavel || 'variavel',
    observacao: normalized.observacao || normalized.obs || null
  };
  return db.from(TABLES.lancamentos).insert(row).then(function(rows){
    var created = normalizeEntryLocal((rows||[])[0]);
    _cache.lancamentos.unshift(created);
    return created;
  });
}

function updateLancamento(id, data){
  var row = {};
  if (data.tipo !== undefined) row.tipo = data.tipo;
  if (data.categoriaId !== undefined) row.categoria_id = data.categoriaId;
  if (data.subcategoriaId !== undefined) row.subcategoria_id = data.subcategoriaId;
  if (data.responsavelId !== undefined) row.responsavel_id = data.responsavelId;
  if (data.pagamentoId !== undefined) row.pagamento_id = data.pagamentoId;
  if (data.statusId !== undefined) row.status_id = data.statusId;
  if (data.descricao !== undefined) row.descricao = data.descricao;
  if (data.valor !== undefined) row.valor = data.valor;
  if (data.data !== undefined) row.data = data.data;
  if (data.recurring !== undefined) row.recorrente = !!data.recurring;
  if (data.fixoVariavel !== undefined) row.fixo_variavel = data.fixoVariavel;
  if (data.observacao !== undefined || data.obs !== undefined) row.observacao = data.observacao || data.obs;
  return db.from(TABLES.lancamentos).eq('id', id).update(row).then(function(rows){
    var updated = normalizeEntryLocal((rows||[])[0]);
    var idx = _cache.lancamentos.findIndex(function(item){ return item.id === id; });
    if (idx !== -1) _cache.lancamentos[idx] = updated || _cache.lancamentos[idx];
    return updated;
  });
}

function removeLancamento(id){
  return db.from(TABLES.lancamentos).eq('id', id).delete().then(function(){
    _cache.lancamentos = _cache.lancamentos.filter(function(item){ return item.id !== id; });
    return _cache.lancamentos;
  });
}

/* ── Planejador 50/20/30 (budget_plan) ── */
function getBudgetPlan(){ return _cache.budgetPlan; }
function getBudgetPlanValue(cat, month){
  var row = _cache.budgetPlan.find(function(r){ return r.cat === cat && r.month === month; });
  return row ? Number(row.value) : null;
}
function setBudgetPlanValue(cat, month, val){
  var existing = _cache.budgetPlan.find(function(r){ return r.cat === cat && r.month === month; });
  if (val === null || val === undefined || isNaN(val)) {
    if (!existing) return Promise.resolve(null);
    return db.from('budget_plan').eq('id', existing.id).delete().then(function(){
      _cache.budgetPlan = _cache.budgetPlan.filter(function(r){ return r.id !== existing.id; });
    });
  }
  if (existing) {
    return db.from('budget_plan').eq('id', existing.id).update({value: val}).then(function(rows){
      var updated = (rows||[])[0];
      existing.value = updated ? updated.value : val;
    });
  }
  return db.from('budget_plan').insert({cat: cat, month: month, value: val}).then(function(rows){
    var created = (rows||[])[0];
    _cache.budgetPlan.push(created);
  });
}

/* ── Renda planejada (budget_income) ── */
function getBudgetIncome(){ return _cache.budgetIncome ? Number(_cache.budgetIncome.value) : null; }
function setBudgetIncome(val){
  if (val === null || val === undefined || isNaN(val)) {
    if (!_cache.budgetIncome) return Promise.resolve(null);
    var toDelete = _cache.budgetIncome.id;
    _cache.budgetIncome = null;
    return db.from('budget_income').eq('id', toDelete).delete();
  }
  if (_cache.budgetIncome) {
    return db.from('budget_income').eq('id', _cache.budgetIncome.id).update({value: val}).then(function(rows){
      _cache.budgetIncome = (rows||[])[0] || _cache.budgetIncome;
    });
  }
  return db.from('budget_income').insert({value: val}).then(function(rows){
    _cache.budgetIncome = (rows||[])[0];
  });
}

window.StorageService = {
  initFinanceiro,
  getCategorias, addCategoria, updateCategoria, removeCategoria,
  getSubcategorias, addSubcategoria, updateSubcategoria, removeSubcategoria,
  getResponsaveis, addResponsavel, updateResponsavel, removeResponsavel,
  getStatus, addStatus, updateStatus, removeStatus,
  getTiposPagamento, addTipoPagamento, updateTipoPagamento, removeTipoPagamento,
  getLancamentos, addLancamento, updateLancamento, removeLancamento,
  getBudgetPlan, getBudgetPlanValue, setBudgetPlanValue,
  getBudgetIncome, setBudgetIncome
};

}());
