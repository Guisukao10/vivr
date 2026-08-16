// sync.js — único caminho de entrada de dados: lê a planilha publicada (Google Sheets),
// casa com os cadastros existentes por nome e importa só o que ainda não foi lançado.
// Fica embutido na própria Análise (sem página separada).
(function () {
'use strict';

var PLANILHA_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSHxO0A4QTL9fxCK5OglA3Jcat2gfH4nUP1zoYbMqCdBS-F3fHpZTQ4mL2VYww9CMMBzbXz24zGhmEc/pub?output=csv';

function parseValor(s) {
  var c = String(s).replace(/R\$/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  var v = parseFloat(c);
  return isNaN(v) ? null : v;
}

function parseData(s) {
  var partes = String(s).split('/');
  var d = parseInt(partes[0], 10), m = parseInt(partes[1], 10);
  var ano = partes[2] ? (partes[2].length === 2 ? '20' + partes[2] : partes[2]) : String(new Date().getFullYear());
  if (!d || !m) return null;
  return ano + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

function parseCSV(texto) {
  var linhas = [], linha = [], campo = '', aspas = false;
  for (var i = 0; i < texto.length; i++) {
    var c = texto[i];
    if (aspas) {
      if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\r') { /* ignora */ }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function normalizarNome(s) { return String(s || '').trim().toLowerCase(); }
function acharPorNome(lista, nome) {
  var alvo = normalizarNome(nome);
  if (!alvo) return null;
  var achado = lista.find(function (x) { return normalizarNome(x.nome) === alvo; });
  return achado ? achado.id : null;
}

function buscarLinhasPlanilha() {
  return fetch(PLANILHA_CSV_URL).then(function (r) {
    if (!r.ok) throw new Error('não consegui abrir a planilha (HTTP ' + r.status + ')');
    return r.text();
  }).then(function (texto) {
    var linhas = parseCSV(texto).filter(function (r) { return r.some(function (c) { return c.trim(); }); });
    if (linhas.length < 2) throw new Error('a planilha voltou vazia');
    var header = linhas[0].map(function (h) { return h.trim(); });
    var idx = {
      data: header.indexOf('Data'), resp: header.indexOf('Responsavel'), cat: header.indexOf('Categoria'),
      pag: header.indexOf('Tipo'), desc: header.indexOf('Descrição'), valor: header.indexOf('Valor (R$)'),
      obs: header.indexOf('Observação')
    };
    if (idx.data === -1 || idx.valor === -1) throw new Error('não reconheci as colunas da planilha');

    var categorias = StorageService.getCategorias().filter(function (c) { return c.tipo === 'despesa'; });
    var outros = categorias.find(function (c) { return c.nome.toLowerCase() === 'outros'; });
    var responsaveis = StorageService.getResponsaveis();
    var pagamentos = StorageService.getTiposPagamento().filter(function (p) { return p.tipo === 'pagamento'; });

    var candidatos = [];
    linhas.slice(1).forEach(function (cols) {
      var data = parseData(cols[idx.data]);
      var valor = parseValor(cols[idx.valor]);
      if (!data || valor === null || valor === 0) return;
      var descCurta = (idx.desc !== -1 ? cols[idx.desc] : '' || '').trim();
      var obsCurta = (idx.obs !== -1 ? cols[idx.obs] : '' || '').trim();
      var descricao = obsCurta || descCurta || 'Sem descrição';
      var obs = (obsCurta && descCurta && normalizarNome(obsCurta) !== normalizarNome(descCurta)) ? descCurta : '';
      candidatos.push({
        data: data, descricao: descricao, obs: obs, valor: valor, tipo: 'despesa',
        categoriaId: acharPorNome(categorias, idx.cat !== -1 ? cols[idx.cat] : '') || (outros ? outros.id : null),
        responsavelId: acharPorNome(responsaveis, idx.resp !== -1 ? cols[idx.resp] : ''),
        pagamentoId: acharPorNome(pagamentos, idx.pag !== -1 ? cols[idx.pag] : ''),
        selecionado: true
      });
    });
    return candidatos;
  });
}

function marcarDuplicados(rows) {
  var existentes = StorageService.getLancamentos();
  rows.forEach(function (l) {
    var r = Utils.checarDuplicata(l, existentes);
    if (!r) return;
    if (r.nivel === 'exata') { l.jaExiste = true; l.selecionado = false; }
    else { l.possivelDup = true; l.selecionado = false; l.dupInfo = Utils.formatDate(r.match.data) + ' · ' + r.match.descricao + ' · ' + Utils.formatCurrency(r.match.valor); }
  });
  return rows;
}

var linhas = [];

function renderRevisao() {
  var categorias = StorageService.getCategorias();
  var responsaveis = StorageService.getResponsaveis();
  var pagamentos = StorageService.getTiposPagamento().filter(function (p) { return p.tipo === 'pagamento'; });
  var corpo = document.getElementById('syncCorpo');
  corpo.innerHTML = linhas.map(function (l, i) {
    var catOpts = categorias.filter(function (c) { return c.tipo === l.tipo; }).map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === l.categoriaId ? ' selected' : '') + '>' + c.nome + '</option>';
    }).join('');
    var respOpts = '<option value="">—</option>' + responsaveis.map(function (r) {
      return '<option value="' + r.id + '"' + (r.id === l.responsavelId ? ' selected' : '') + '>' + r.nome + '</option>';
    }).join('');
    var pagOpts = pagamentos.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === l.pagamentoId ? ' selected' : '') + '>' + p.nome + '</option>';
    }).join('');
    if (l.jaExiste || l.possivelDup) return ''; // duplicado (exato ou parecido) — não mostra, só o que falta sincronizar
    return '<tr>' +
      '<td><input type="checkbox" ' + (l.selecionado ? 'checked' : '') + ' onchange="VivrSync.toggle(' + i + ',this.checked)"/></td>' +
      '<td>' + Utils.formatDate(l.data) + '</td>' +
      '<td><input type="text" value="' + l.descricao.replace(/"/g, '&quot;') + '" onchange="VivrSync.setCampo(' + i + ',\'descricao\',this.value)"/></td>' +
      '<td><select onchange="VivrSync.setCampo(' + i + ',\'categoriaId\',this.value)">' + catOpts + '</select></td>' +
      '<td><select onchange="VivrSync.setCampo(' + i + ',\'responsavelId\',this.value)">' + respOpts + '</select></td>' +
      '<td><select onchange="VivrSync.setCampo(' + i + ',\'pagamentoId\',this.value)">' + pagOpts + '</select></td>' +
      '<td><input type="number" step="0.01" value="' + l.valor + '" onchange="VivrSync.setCampo(' + i + ',\'valor\',this.value)"/></td>' +
    '</tr>';
  }).join('');

  var selecionadas = linhas.filter(function (l) { return l.selecionado; });
  var duplicadas = linhas.filter(function (l) { return l.jaExiste || l.possivelDup; });
  var total = selecionadas.reduce(function (s, l) { return s + l.valor; }, 0);
  document.getElementById('syncSummary').innerHTML =
    '<div>Novas selecionadas<strong>' + selecionadas.length + '</strong></div>' +
    '<div>Total<strong>' + Utils.formatCurrency(total) + '</strong></div>' +
    '<div>Duplicadas (não mostradas)<strong>' + duplicadas.length + '</strong></div>';
}

function toggle(i, checked) { linhas[i].selecionado = checked; renderRevisao(); }
function setCampo(i, campo, valor) { linhas[i][campo] = campo === 'valor' ? (parseFloat(valor) || 0) : valor; }

function status(msg, isErro) {
  var el = document.getElementById('syncStatus');
  el.style.display = msg ? 'block' : 'none';
  el.className = 'sync-status' + (isErro ? ' err' : '');
  el.textContent = msg || '';
}

function sincronizar() {
  status('📊 Buscando a planilha...');
  document.getElementById('syncRevisao').style.display = 'none';
  buscarLinhasPlanilha().then(function (rows) {
    if (!rows.length) { status('Não encontrei nenhuma linha válida na planilha.', true); return; }
    linhas = marcarDuplicados(rows);
    var novas = linhas.filter(function (l) { return l.selecionado; }).length;
    if (!novas) { status('✓ Tudo certo — nenhum lançamento novo na planilha (' + rows.length + ' linhas conferidas).'); return; }
    status('✓ ' + novas + ' lançamentos novos encontrados. Confira e importe abaixo.');
    renderRevisao();
    document.getElementById('syncRevisao').style.display = '';
  }).catch(function (e) {
    status('Não consegui sincronizar: ' + e.message, true);
  });
}

function importar() {
  var selecionadas = linhas.filter(function (l) { return l.selecionado; });
  if (!selecionadas.length) { alert('Nenhuma linha selecionada.'); return; }
  var btn = document.getElementById('syncBtnImportar');
  btn.disabled = true;
  status('Importando ' + selecionadas.length + ' lançamentos...');
  Promise.all(selecionadas.map(function (l) {
    return StorageService.addLancamento({
      tipo: l.tipo, categoriaId: l.categoriaId, responsavelId: l.responsavelId || null,
      pagamentoId: l.pagamentoId || null, descricao: l.descricao, valor: l.valor, data: l.data,
      observacao: l.obs || null
    });
  })).then(function () {
    status('✓ ' + selecionadas.length + ' lançamentos importados com sucesso.');
    document.getElementById('syncRevisao').style.display = 'none';
    btn.disabled = false;
    if (window.AnalisePage) AnalisePage.init();
  }).catch(function (e) {
    status('Erro ao importar: ' + e.message, true);
    btn.disabled = false;
  });
}

window.VivrSync = { sincronizar: sincronizar, importar: importar, toggle: toggle, setCampo: setCampo };
}());
