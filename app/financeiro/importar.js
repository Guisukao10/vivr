(function(){
'use strict';

// Reconhecimento por padrão (regex + palavras-chave) — não é um modelo de IA real.
// Cobre o caso comum de extrato colado como texto: uma linha por lançamento com
// data + descrição + valor. PDFs precisam ser abertos e o texto copiado antes de colar aqui.

var LINE_RE = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\s?R?\$?\s?-?[\d.]{1,12},\d{2})\s*$/;

// Palavra-chave -> nome de categoria (comparado sem acento/maiúscula contra as
// categorias que o usuário já tem cadastradas; se não achar, cai em "Outros").
var KEYWORDS = {
  'alimenta': ['ifood','rappi','restaurante','lanchonete','padaria','mercado','supermercado','feira','acougue'],
  'transporte': ['uber','99','taxi','combustivel','posto','gasolina','estacionamento','pedagio','onibus','metro'],
  'compras': ['shopee','amazon','magalu','mercadolivre','shein','loja','magazine'],
  'saude': ['farmacia','drogaria','academia','wellhub','gympass','consulta','exame'],
  'assinatura': ['netflix','spotify','disney','hbo','amazon prime','icloud','youtube premium'],
  'casa': ['condominio','aluguel','luz','agua','energia','internet','gas'],
  'lazer': ['cinema','bar','balada','ingresso','show'],
  'educa': ['curso','faculdade','escola','livro'],
  'doa': ['dizimo','doacao','igreja'],
};

function stripAccents(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,''); }
function lo(s){ return stripAccents(s).toLowerCase(); }

function parseValor(s){
  var c = String(s).replace(/R\$/gi,'').replace(/\s/g,'').replace(/\./g,'').replace(',', '.');
  var v = parseFloat(c);
  return isNaN(v) ? null : v;
}

function parseData(s){
  var partes = s.split('/');
  var d = parseInt(partes[0],10), m = parseInt(partes[1],10);
  var ano = partes[2] ? (partes[2].length===2 ? '20'+partes[2] : partes[2]) : String(new Date().getFullYear());
  if (!d || !m) return null;
  return ano+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}

function sugerirCategoriaId(descricao, categorias){
  var texto = lo(descricao);
  for (var chave in KEYWORDS) {
    var achou = KEYWORDS[chave].some(function(kw){ return texto.indexOf(kw) !== -1; });
    if (achou) {
      var cat = categorias.find(function(c){ return lo(c.nome).indexOf(chave) !== -1; });
      if (cat) return cat.id;
    }
  }
  var outros = categorias.find(function(c){ return lo(c.nome) === 'outros'; });
  return outros ? outros.id : (categorias[0] ? categorias[0].id : null);
}

function parseExtrato(texto, tipoPadrao){
  var linhas = texto.split('\n');
  var resultado = [];
  linhas.forEach(function(linha){
    var m = linha.match(LINE_RE);
    if (!m) return;
    var data = parseData(m[1]);
    var valor = parseValor(m[3]);
    if (!data || valor === null || valor === 0) return;
    var negativo = /^-|-\s?R?\$/.test(m[3].trim());
    resultado.push({
      data: data,
      descricao: m[2].trim(),
      valor: Math.abs(valor),
      tipo: negativo ? 'despesa' : tipoPadrao,
      selecionado: true
    });
  });
  return resultado;
}

/* ── UI ── */
var linhasDetectadas = [];

function popularSelects(){
  var pagSel = document.getElementById('pagamentoPadrao');
  pagSel.innerHTML = StorageService.getTiposPagamento().map(function(p){ return '<option value="'+p.id+'">'+p.nome+'</option>'; }).join('');
  var respSel = document.getElementById('responsavelPadrao');
  respSel.innerHTML = '<option value="">— não especificar —</option>' +
    StorageService.getResponsaveis().map(function(r){ return '<option value="'+r.id+'">'+r.nome+'</option>'; }).join('');
}

function analisar(){
  var texto = document.getElementById('txtExtrato').value;
  var tipoPadrao = document.getElementById('tipoPadrao').value;
  if (!texto.trim()) { alert('Cole o texto do extrato primeiro.'); return; }

  var categorias = StorageService.getCategorias();
  linhasDetectadas = parseExtrato(texto, tipoPadrao).map(function(l){
    var catsDoTipo = categorias.filter(function(c){ return c.tipo === l.tipo; });
    l.categoriaId = sugerirCategoriaId(l.descricao, catsDoTipo.length ? catsDoTipo : categorias);
    return l;
  });

  if (!linhasDetectadas.length) {
    alert('Não encontrei nenhum lançamento reconhecível nesse texto. Confira se cada linha tem data, descrição e valor (ex: 01/07/2026 UBER TRIP 25,90).');
    return;
  }

  renderRevisao();
  document.getElementById('stepColar').style.display = 'none';
  document.getElementById('stepRevisao').style.display = '';
}

function renderRevisao(){
  var categorias = StorageService.getCategorias();
  var corpo = document.getElementById('corpoRevisao');
  corpo.innerHTML = linhasDetectadas.map(function(l, i){
    var opts = categorias.filter(function(c){ return c.tipo === l.tipo; })
      .map(function(c){ return '<option value="'+c.id+'"'+(c.id===l.categoriaId?' selected':'')+'>'+c.nome+'</option>'; }).join('');
    return '<tr>'+
      '<td><input type="checkbox" '+(l.selecionado?'checked':'')+' onchange="toggleLinha('+i+',this.checked)"/></td>'+
      '<td><input type="date" value="'+l.data+'" onchange="setLinha('+i+',\'data\',this.value)"/></td>'+
      '<td><input type="text" value="'+l.descricao.replace(/"/g,'&quot;')+'" onchange="setLinha('+i+',\'descricao\',this.value)"/></td>'+
      '<td><select onchange="setLinha('+i+',\'categoriaId\',this.value)">'+opts+'</select></td>'+
      '<td><input type="number" step="0.01" value="'+l.valor+'" onchange="setLinha('+i+',\'valor\',this.value)"/></td>'+
      '<td><select onchange="setLinha('+i+',\'tipo\',this.value)">'+
        '<option value="despesa"'+(l.tipo==='despesa'?' selected':'')+'>Despesa</option>'+
        '<option value="receita"'+(l.tipo==='receita'?' selected':'')+'>Receita</option>'+
      '</select></td>'+
    '</tr>';
  }).join('');

  var selecionadas = linhasDetectadas.filter(function(l){ return l.selecionado; });
  var totalDespesa = selecionadas.filter(function(l){return l.tipo==='despesa';}).reduce(function(s,l){return s+l.valor;},0);
  var totalReceita = selecionadas.filter(function(l){return l.tipo==='receita';}).reduce(function(s,l){return s+l.valor;},0);
  document.getElementById('impSummary').innerHTML =
    '<div>Linhas detectadas<strong>'+linhasDetectadas.length+'</strong></div>'+
    '<div>Selecionadas<strong>'+selecionadas.length+'</strong></div>'+
    '<div>Total despesas<strong>'+Utils.formatCurrency(totalDespesa)+'</strong></div>'+
    '<div>Total receitas<strong>'+Utils.formatCurrency(totalReceita)+'</strong></div>';
}

function toggleLinha(i, checked){ linhasDetectadas[i].selecionado = checked; renderRevisao(); }
function setLinha(i, campo, valor){
  linhasDetectadas[i][campo] = campo === 'valor' ? (parseFloat(valor)||0) : valor;
  if (campo === 'tipo') renderRevisao(); // categoria precisa recarregar pro tipo novo
}

function importarSelecionados(){
  var pagamentoId = document.getElementById('pagamentoPadrao').value;
  var responsavelId = document.getElementById('responsavelPadrao').value || null;
  var selecionadas = linhasDetectadas.filter(function(l){ return l.selecionado; });
  if (!selecionadas.length) { alert('Nenhuma linha selecionada.'); return; }

  var msg = document.getElementById('impMsg');
  msg.textContent = 'Importando '+selecionadas.length+' lançamentos...';
  document.getElementById('btnImportar').disabled = true;

  var promessas = selecionadas.map(function(l){
    return StorageService.addLancamento({
      tipo: l.tipo,
      categoriaId: l.categoriaId,
      responsavelId: responsavelId,
      pagamentoId: pagamentoId,
      descricao: l.descricao,
      valor: l.valor,
      data: l.data
    });
  });

  Promise.all(promessas).then(function(){
    msg.textContent = '✓ '+selecionadas.length+' lançamentos importados com sucesso.';
    document.getElementById('btnImportar').disabled = false;
    linhasDetectadas = linhasDetectadas.filter(function(l){ return !l.selecionado; });
    renderRevisao();
  }).catch(function(e){
    msg.textContent = 'Erro ao importar: '+e.message;
    document.getElementById('btnImportar').disabled = false;
  });
}

function voltar(){
  document.getElementById('stepRevisao').style.display = 'none';
  document.getElementById('stepColar').style.display = '';
}

window.toggleLinha = toggleLinha;
window.setLinha = setLinha;

StorageService.initFinanceiro().then(function(){
  popularSelects();
  document.getElementById('btnAnalisar').addEventListener('click', analisar);
  document.getElementById('btnImportar').addEventListener('click', importarSelecionados);
  document.getElementById('btnVoltar').addEventListener('click', voltar);
}).catch(function(e){
  document.getElementById('stepColar').innerHTML = '<div style="color:#B91C1C">⚠️ Não foi possível carregar agora ('+e.message+'). Tente recarregar a página.</div>';
});

}());
