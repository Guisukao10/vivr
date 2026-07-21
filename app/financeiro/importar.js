(function(){
'use strict';

// Reconhecimento por padrão (regex + palavras-chave) — não é um modelo de IA real.
// Cobre o caso comum de extrato colado como texto: uma linha por lançamento com
// data + descrição + valor. PDFs precisam ser abertos e o texto copiado antes de colar aqui.

var LINE_RE = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+(.+?)\s+(-?\s?R?\$?\s?-?[\d.]{1,12},\d{2})\s*$/;

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
  var achada = Utils.sugerirCategoriaPorTexto(descricao, categorias);
  if (achada) return achada;
  var outros = categorias.find(function(c){ return c.nome.toLowerCase() === 'outros'; });
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

/* ── PDF ──
   Dois caminhos: PDF com texto embutido é lido aqui mesmo, de graça e offline
   (pdf.js reconstrói as linhas pela posição Y). PDF de imagem — como a fatura
   do app do Bradesco — vira JPEG por página e vai pra IA via Edge Function
   (a chave do Gemini fica no servidor, nunca no navegador). */
var PDF_TEXTO_MINIMO = 300; // menos que isso de texto = PDF escaneado/imagem

function pdfPaginaTexto(page){
  return page.getTextContent().then(function(tc){
    var porY = {};
    tc.items.forEach(function(it){
      var y = Math.round(it.transform[5]);
      (porY[y] = porY[y] || []).push({ x: it.transform[4], s: it.str });
    });
    return Object.keys(porY).map(Number).sort(function(a,b){ return b-a; })
      .map(function(y){
        return porY[y].sort(function(a,b){ return a.x-b.x; })
          .map(function(o){ return o.s; }).join(' ').replace(/\s+/g,' ').trim();
      })
      .filter(Boolean).join('\n');
  });
}

function pdfPaginaImagem(page){
  var base = page.getViewport({ scale: 1 });
  var scale = Math.min(2, 1500 / base.width); // nítido pra IA sem estourar o payload
  var vp = page.getViewport({ scale: scale });
  var canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
    .then(function(){ return canvas.toDataURL('image/jpeg', 0.8); });
}

function setStatus(msg, isErro){
  var el = document.getElementById('pdfStatus');
  // .imp-status tem display:none como regra base no CSS — limpar o inline style (`''`)
  // cai de volta nessa regra e o aviso nunca aparece. Precisa de um valor explícito.
  el.style.display = msg ? 'block' : 'none';
  el.className = 'imp-status' + (isErro ? ' err' : '');
  el.innerHTML = msg || '';
}

function processarPdf(file){
  if (!window.pdfjsLib) { setStatus('Leitor de PDF não carregou — verifique a internet e recarregue a página.', true); return; }
  document.getElementById('aiSetup').style.display = 'none';
  setStatus('📖 Lendo <strong>' + file.name + '</strong>...');

  file.arrayBuffer().then(function(buf){
    return pdfjsLib.getDocument({ data: buf }).promise;
  }).then(function(doc){
    var nums = [];
    for (var i = 1; i <= Math.min(doc.numPages, 8); i++) nums.push(i);
    return Promise.all(nums.map(function(n){ return doc.getPage(n); }));
  }).then(function(pages){
    return Promise.all(pages.map(pdfPaginaTexto)).then(function(txts){
      var texto = txts.join('\n');
      if (texto.replace(/\s/g,'').length >= PDF_TEXTO_MINIMO) {
        // PDF com texto: tenta o parser local primeiro; IA só se ele não achar nada
        var tipoPadrao = document.getElementById('tipoPadrao').value;
        var achadas = parseExtrato(texto, tipoPadrao);
        if (achadas.length >= 3) {
          setStatus('✓ PDF com texto — ' + achadas.length + ' lançamentos reconhecidos sem precisar de IA.');
          concluirAnalise(achadas);
          return;
        }
        setStatus('🤖 O texto do PDF não segue um padrão simples. Analisando com IA (até ~30s)...');
        return chamarIA({ texto: texto });
      }
      setStatus('🤖 Este PDF é uma imagem (sem texto). Analisando com IA — pode levar ~30s...');
      return Promise.all(pages.map(pdfPaginaImagem)).then(function(imgs){
        return chamarIA({ images: imgs });
      });
    });
  }).catch(function(e){
    setStatus('Não consegui ler esse PDF: ' + (e.message || e), true);
  });
}

function chamarIA(payload){
  return vivr.fn('parse-extrato', payload).then(function(resp){
    var tipoPadrao = document.getElementById('tipoPadrao').value;
    var rows = (resp.lancamentos || []).map(function(r){
      var valor = Number(r.valor);
      var data = /^\d{4}-\d{2}-\d{2}$/.test(r.data || '') ? r.data : null;
      if (!data || !(valor > 0) || !r.descricao) return null;
      return {
        data: data,
        descricao: String(r.descricao).trim(),
        valor: valor,
        tipo: r.tipo === 'receita' ? 'receita' : (r.tipo === 'despesa' ? 'despesa' : tipoPadrao),
        obs: [r.parcela ? 'Parcela ' + r.parcela : '', r.titular ? 'Cartão ' + r.titular : '']
          .filter(Boolean).join(' · '),
        selecionado: true
      };
    }).filter(Boolean);
    if (!rows.length) {
      setStatus('A IA não encontrou lançamentos nesse documento. Se for uma fatura mesmo, me avisa que a gente investiga.', true);
      return;
    }
    setStatus('✓ IA leu o documento: ' + rows.length + ' lançamentos encontrados. Confira abaixo antes de importar.');
    concluirAnalise(rows);
  }).catch(function(e){
    if (/GEMINI_API_KEY/.test(e.message)) {
      setStatus('', false);
      document.getElementById('aiSetup').style.display = 'block'; // mesmo motivo do setStatus: .imp-ai-setup é display:none por padrão
    } else {
      setStatus('Erro na análise por IA: ' + e.message, true);
    }
  });
}

// Marca o que já existe no vivr (mesma data + valor + descrição parecida) pra não
// importar em dobro quem já foi lançado à mão durante o mês.
function marcarDuplicados(rows){
  var existentes = StorageService.getLancamentos();
  rows.forEach(function(l){
    var dup = existentes.some(function(e){
      return e.data === l.data && Math.abs(Number(e.valor) - l.valor) < 0.005 &&
        (e.descricao || '').toLowerCase().replace(/\s+/g,'') === l.descricao.toLowerCase().replace(/\s+/g,'');
    });
    if (dup) { l.jaExiste = true; l.selecionado = false; }
  });
  return rows;
}

function concluirAnalise(rows){
  var categorias = StorageService.getCategorias();
  linhasDetectadas = marcarDuplicados(rows).map(function(l){
    var catsDoTipo = categorias.filter(function(c){ return c.tipo === l.tipo; });
    l.categoriaId = sugerirCategoriaId(l.descricao, catsDoTipo.length ? catsDoTipo : categorias);
    return l;
  });
  renderRevisao();
  document.getElementById('stepColar').style.display = 'none';
  document.getElementById('stepRevisao').style.display = '';
}

/* ── UI ── */
var linhasDetectadas = [];

// Gastei → só formas de pagamento (débito/crédito/ticket...); Recebi → só formas de
// recebimento — mesma separação da tela de Lançamentos, aplicada aqui à forma
// predominante do extrato inteiro.
function atualizarPagamentoPadrao(){
  var tipoPadrao = document.getElementById('tipoPadrao').value;
  var wantTipo = tipoPadrao === 'despesa' ? 'pagamento' : 'recebimento';
  var pagSel = document.getElementById('pagamentoPadrao');
  var atual = pagSel.value;
  var opcoes = StorageService.getTiposPagamento().filter(function(p){ return p.tipo === wantTipo; });
  pagSel.innerHTML = opcoes.map(function(p){ return '<option value="'+p.id+'"'+(p.id===atual?' selected':'')+'>'+p.nome+'</option>'; }).join('');
  atualizarUltimoLancamento();
}

function popularSelects(){
  atualizarPagamentoPadrao();
  var respSel = document.getElementById('responsavelPadrao');
  respSel.innerHTML = '<option value="">— não especificar —</option>' +
    StorageService.getResponsaveis().map(function(r){ return '<option value="'+r.id+'">'+r.nome+'</option>'; }).join('');
}

// "Qual foi o último lançamento desse cartão?" — ajuda a pessoa a saber a partir de
// onde o extrato passa a trazer coisa nova, antes mesmo de analisar o arquivo.
function atualizarUltimoLancamento(){
  var el = document.getElementById('ultimoLancamentoInfo');
  if (!el) return;
  var pagamentoId = document.getElementById('pagamentoPadrao').value;
  if (!pagamentoId) { el.style.display = 'none'; return; }
  var doCartao = StorageService.getLancamentos()
    .filter(function(l){ return l.pagamentoId === pagamentoId; })
    .sort(function(a,b){ return b.data.localeCompare(a.data); });
  if (!doCartao.length) {
    el.style.display = '';
    el.innerHTML = 'Ainda não há nenhum lançamento registrado com essa forma de pagamento.';
    return;
  }
  var ultimo = doCartao[0];
  el.style.display = '';
  el.innerHTML = 'Último lançamento registrado: <strong>' + Utils.formatDate(ultimo.data) + ' · ' +
    ultimo.descricao + ' · ' + Utils.formatCurrency(ultimo.valor) + '</strong>. ' +
    'Ao analisar o extrato, o que já estiver lançado aparece marcado e vem desmarcado pra não duplicar.';
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
    return '<tr'+(l.jaExiste?' class="imp-dup"':'')+'>'+
      '<td><input type="checkbox" '+(l.selecionado?'checked':'')+' onchange="toggleLinha('+i+',this.checked)"/></td>'+
      '<td><input type="date" value="'+l.data+'" onchange="setLinha('+i+',\'data\',this.value)"/></td>'+
      '<td><input type="text" value="'+l.descricao.replace(/"/g,'&quot;')+'" onchange="setLinha('+i+',\'descricao\',this.value)"/>'+
        (l.jaExiste?' <span class="imp-badge-dup" title="Já existe um lançamento igual nesta data">já lançado</span>':'')+'</td>'+
      '<td><select onchange="setLinha('+i+',\'categoriaId\',this.value)">'+opts+'</select></td>'+
      '<td><input type="number" step="0.01" value="'+l.valor+'" onchange="setLinha('+i+',\'valor\',this.value)"/></td>'+
      '<td><select onchange="setLinha('+i+',\'tipo\',this.value)">'+
        '<option value="despesa"'+(l.tipo==='despesa'?' selected':'')+'>Despesa</option>'+
        '<option value="receita"'+(l.tipo==='receita'?' selected':'')+'>Receita</option>'+
      '</select></td>'+
    '</tr>';
  }).join('');

  var selecionadas = linhasDetectadas.filter(function(l){ return l.selecionado; });
  var jaLancadas = linhasDetectadas.filter(function(l){ return l.jaExiste; });
  var totalDespesa = selecionadas.filter(function(l){return l.tipo==='despesa';}).reduce(function(s,l){return s+l.valor;},0);
  var totalReceita = selecionadas.filter(function(l){return l.tipo==='receita';}).reduce(function(s,l){return s+l.valor;},0);
  document.getElementById('impSummary').innerHTML =
    '<div>Linhas no extrato<strong>'+linhasDetectadas.length+'</strong></div>'+
    '<div>Já lançadas (puladas)<strong>'+jaLancadas.length+'</strong></div>'+
    '<div>Novas selecionadas<strong>'+selecionadas.length+'</strong></div>'+
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

// A caixa de "arraste ou clique" existia só visualmente — nada disparava o processamento
// do PDF. Clique abre o seletor de arquivo; soltar (drag&drop) ou escolher no seletor
// chamam processarPdf direto.
function registrarUploadPdf(){
  var drop = document.getElementById('pdfDrop');
  var input = document.getElementById('filePdf');
  if (!drop || !input) return;

  drop.addEventListener('click', function(){ input.click(); });

  input.addEventListener('change', function(){
    if (input.files && input.files[0]) processarPdf(input.files[0]);
    input.value = ''; // permite escolher o mesmo arquivo de novo depois
  });

  ['dragenter', 'dragover'].forEach(function(evt){
    drop.addEventListener(evt, function(e){ e.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function(evt){
    drop.addEventListener(evt, function(e){ e.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function(e){
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) processarPdf(file);
  });
}

window.toggleLinha = toggleLinha;
window.setLinha = setLinha;

StorageService.initFinanceiro().then(function(){
  popularSelects();
  registrarUploadPdf();
  document.getElementById('btnAnalisar').addEventListener('click', analisar);
  document.getElementById('btnImportar').addEventListener('click', importarSelecionados);
  document.getElementById('btnVoltar').addEventListener('click', voltar);
  document.getElementById('tipoPadrao').addEventListener('change', atualizarPagamentoPadrao);
  document.getElementById('pagamentoPadrao').addEventListener('change', atualizarUltimoLancamento);
}).catch(function(e){
  document.getElementById('stepColar').innerHTML = '<div style="color:#B91C1C">⚠️ Não foi possível carregar agora ('+e.message+'). Tente recarregar a página.</div>';
});

}());
