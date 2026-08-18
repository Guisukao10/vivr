(function(){
'use strict';

/* ─── Helpers (portados do app.js antigo do vivr) ─── */
function brl(v){ return (v||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'}); }
function pct(v, d){ return (v||0).toFixed(d==null?1:d) + '%'; }
function uniq(arr){
  var seen={}, out=[];
  arr.forEach(function(v){ if(v && !seen[v]){ seen[v]=true; out.push(v); } });
  return out.sort();
}
function monthKey(date){
  if(!date) return null;
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
}
function monthLabel(key){
  var p=key.split('-');
  return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, 1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
}
function total(rows){ return rows.reduce(function(s,r){ return s+r.valor; }, 0); }
function makeChart(id, cfg){
  var el = document.getElementById(id);
  if(!el || !window.Chart) return;
  if(el._chart) el._chart.destroy();
  el._chart = new Chart(el, cfg);
}

/* ─── Dados derivados de lancamentos + categorias (StorageService) ─── */
var classifMap = {}; // {categoriaNome: 'Necessidade'|'Investimento'|'Lazer'}
var catNomeById = {};
var catIdByNome = {};
var allGastos = []; // [{cat, valor, date}]
var allGanhos = [];

function rebuildDerivedData(){
  var categorias = StorageService.getCategorias();
  classifMap = {};
  catNomeById = {};
  catIdByNome = {};
  categorias.forEach(function(c){
    catNomeById[c.id] = c.nome;
    if (c.tipo === 'despesa') catIdByNome[c.nome] = c.id;
    classifMap[c.nome] = c.bucket || 'Necessidade';
  });

  var respNomeById = {};
  (StorageService.getResponsaveis()||[]).forEach(function(r){ respNomeById[r.id] = r.nome; });

  var lancs = StorageService.getLancamentos();
  allGastos = lancs.filter(function(l){ return l.tipo === 'despesa'; }).map(function(l){
    return {
      cat: catNomeById[l.categoriaId] || 'Outros',
      valor: Number(l.valor)||0,
      date: l.data ? new Date(l.data+'T00:00:00') : null,
      desc: l.descricao || '',
      obs: l.obs || l.observacao || '',
      resp: respNomeById[l.responsavelId] || ''
    };
  });
  allGanhos = lancs.filter(function(l){ return l.tipo === 'receita'; }).map(function(l){
    return { cat: catNomeById[l.categoriaId] || 'Outros', valor: Number(l.valor)||0, date: l.data ? new Date(l.data+'T00:00:00') : null };
  });
}

/* ─── Reserva de Emergência ───
   Boa prática clássica de planejamento financeiro: ter de 3 a 6 meses de gastos
   guardados como colchão pra imprevistos. Puxa o total "Guardado" (mesma aba viva
   usada no card de Reserva da Análise) e compara com a média de gasto mensal real. */
var RESERVA_CSV_URL = 'https://docs.google.com/spreadsheets/d/1PnUe5-lId9eep3jb0AqOczUdCJHWtXQd6CEcLrcYN6I/export?format=csv&gid=1823976397';
var _reservaGuardadoTotal = 0;

function parseValorBR(s){
  var c = String(s||'').replace(/"/g,'').replace(/R\$/gi,'').replace(/\s/g,'').replace(/\./g,'').replace(',', '.');
  var v = parseFloat(c);
  return isNaN(v) ? 0 : v;
}
function parseCSVSimples(texto){
  var linhas=[], linha=[], campo='', aspas=false;
  for(var i=0;i<texto.length;i++){
    var c=texto[i];
    if(aspas){ if(c==='"'){ if(texto[i+1]==='"'){campo+='"';i++;} else aspas=false; } else campo+=c; }
    else if(c==='"') aspas=true;
    else if(c===',') { linha.push(campo); campo=''; }
    else if(c==='\r') { /* ignora */ }
    else if(c==='\n') { linha.push(campo); linhas.push(linha); linha=[]; campo=''; }
    else campo+=c;
  }
  if(campo.length||linha.length){ linha.push(campo); linhas.push(linha); }
  return linhas.filter(function(l){ return l.some(function(c){return c.trim();}); });
}

function renderReservaEmergencia(){
  var el = document.getElementById('reservaEmergenciaBox');
  if(!el) return;
  fetch(RESERVA_CSV_URL).then(function(r){
    if(!r.ok) throw new Error('HTTP '+r.status);
    return r.text();
  }).then(function(texto){
    var linhas = parseCSVSimples(texto);
    var totalGuardado = 0;
    linhas.slice(1).forEach(function(cols){
      if(cols.length<2) return;
      totalGuardado += parseValorBR(cols[1]);
    });
    _reservaGuardadoTotal = totalGuardado;
    var patInp = document.getElementById('patInicial');
    if(patInp && !patInp.dataset.touched && (patInp.value===''||parseFloat(patInp.value)===0)) patInp.value = totalGuardado;
    // média de gasto mensal só com meses fechados — o mês corrente incompleto puxaria a média pra baixo
    var mesAtual = monthKey(new Date());
    var mesesGasto = uniq(allGastos.map(function(r){ return monthKey(r.date); })).filter(function(m){ return m!==mesAtual; });
    var gastoMedio = mesesGasto.length ? mesesGasto.reduce(function(s,m){
      return s + allGastos.filter(function(r){ return monthKey(r.date)===m; }).reduce(function(s2,r){return s2+r.valor;},0);
    }, 0) / mesesGasto.length : 0;
    var meses = gastoMedio>0 ? totalGuardado/gastoMedio : 0;
    var cls = meses>=6 ? 'ok' : meses>=3 ? 'warn' : 'over';
    var msg = meses>=6 ? 'reserva completa (regra dos 3-6 meses)' : meses>=3 ? 'no caminho — meta são 6 meses' : 'abaixo do recomendado (3-6 meses)';
    el.innerHTML = '<div class="acp-card '+cls+'"><div class="ac-lbl">🛟 Reserva de Emergência</div>'+
      '<div class="ac-val">'+meses.toFixed(1).replace('.',',')+' meses</div>'+
      '<div class="ac-sub">'+brl(totalGuardado)+' guardados · '+msg+'</div></div>';
  }).catch(function(){ el.innerHTML=''; });
}

/* ─── Bucket (Necessidade/Investimento/Lazer) editável por categoria ─── */
var BUCKETS = ['Necessidade','Investimento','Lazer'];
var BUCKET_COLOR = {Necessidade:'#1D4ED8',Investimento:'#15803D',Lazer:'#C2410C'};
var BUCKET_CLS = {Necessidade:'nec',Investimento:'inv',Lazer:'laz'};

function bucketSelectHtml(cat){
  var id = catIdByNome[cat];
  if(!id) return '';
  var cur = classifMap[cat]||'Necessidade';
  return '<select class="bucket-sel '+BUCKET_CLS[cur]+'" data-cat-id="'+id+'" title="Classificar '+cat.replace(/"/g,'&quot;')+'">'+
    BUCKETS.map(function(b){
      return '<option value="'+b+'"'+(b===cur?' selected':'')+'>'+b+'</option>';
    }).join('')+'</select>';
}

/* Toast flutuante: confirma que a mudança foi salva no banco sem interromper o fluxo */
var _toastEl = null, _toastTimer = null;
function showToast(msg){
  if(!_toastEl){
    _toastEl = document.createElement('div');
    _toastEl.className = 'pj-toast';
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ _toastEl.classList.remove('show'); }, 2200);
}

function bindBucketSelects(container){
  container.querySelectorAll('.bucket-sel').forEach(function(sel){
    sel.addEventListener('change', function(){
      var catNome = catNomeById[sel.dataset.catId] || 'Categoria';
      StorageService.updateCategoria(sel.dataset.catId, { bucket: sel.value }).then(function(){
        rebuildDerivedData();
        renderSimTab();
        showToast('✓ '+catNome+' agora é '+sel.value);
      });
    });
  });
}

/* ─── Drill-down: lançamentos de uma categoria no mês ─── */
function detalheCategoriaHtml(cat, mes){
  var rows = allGastos.filter(function(r){ return r.cat===cat && monthKey(r.date)===mes; })
    .sort(function(a,b){ return a.date-b.date; });
  if(!rows.length) return '<div style="padding:10px;font-size:.75rem;color:#bbb">Nenhum lançamento neste mês.</div>';
  var html='<table style="width:100%;font-size:.74rem;border-collapse:collapse">';
  rows.forEach(function(r){
    html+='<tr style="border-bottom:1px solid #f0f0f0">'+
      '<td style="padding:4px 8px;color:#888;white-space:nowrap;width:70px">'+r.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+'</td>'+
      '<td style="padding:4px 8px">'+r.desc+(r.obs?' <span style="color:#aaa">· '+r.obs+'</span>':'')+'</td>'+
      '<td style="padding:4px 8px;color:#888;width:90px">'+r.resp+'</td>'+
      '<td style="padding:4px 8px;text-align:right;font-weight:600;white-space:nowrap;width:100px">'+brl(r.valor)+'</td></tr>';
  });
  html+='</table>';
  return html;
}

function bindCatDrilldown(container, mes){
  container.querySelectorAll('tr[data-drill-cat]').forEach(function(tr){
    tr.style.cursor='pointer';
    tr.addEventListener('click', function(ev){
      if(ev.target.closest('.bucket-sel')) return; // clique no seletor não abre/fecha
      var next = tr.nextElementSibling;
      if(next && next.classList.contains('cat-detail-row')){
        next.remove();
        tr.classList.remove('open');
        return;
      }
      var cat = tr.dataset.drillCat;
      var det = document.createElement('tr');
      det.className='cat-detail-row';
      det.innerHTML='<td colspan="7" style="background:#fcfcfc;padding:2px 10px 8px">'+detalheCategoriaHtml(cat, mes)+'</td>';
      tr.parentNode.insertBefore(det, tr.nextSibling);
      tr.classList.add('open');
    });
  });
}

/* ─── Seleção de mês do acompanhamento ─── */
// Mesmo range de simGetPlanMonths() (mês atual até dezembro) — de propósito: orçamento
// só pode ser preenchido pra frente (pela tabela de baixo ou "preencher com médias"),
// então deixar escolher mês passado aqui abriria uma tela "sem orçamento" sem ação possível.
// Análise de meses passados já é o papel da aba Análise.
function getMesesAcompanhamento(){
  var now = new Date();
  var meses = [monthKey(now)];
  for (var m=now.getMonth()+1; m<=11; m++){
    meses.push(now.getFullYear()+'-'+String(m+1).padStart(2,'0'));
  }
  return meses;
}

function populateMonthSelect(){
  var sel = document.getElementById('acpMonthSelect');
  if (!sel) return;
  var meses = getMesesAcompanhamento();
  var atual = sel.value && meses.indexOf(sel.value)!==-1 ? sel.value : meses[0];
  sel.innerHTML = meses.map(function(m){ return '<option value="'+m+'"'+(m===atual?' selected':'')+'>'+monthLabel(m)+'</option>'; }).join('');
  sel.onchange = function(){ renderAcompanhamento(sel.value); };
  return atual;
}

/* ─── Planejador 50/20/30: Acompanhamento do mês escolhido ─── */
function renderAcompanhamento(mesEscolhido){
  var now = new Date();
  var curMonth = mesEscolhido || monthKey(now);
  var isMesAtual = curMonth === monthKey(now);
  var cats = uniq(allGastos.map(function(r){ return r.cat; }));

  var realMap = {};
  allGastos.forEach(function(r){
    if(monthKey(r.date)!==curMonth) return;
    realMap[r.cat]=(realMap[r.cat]||0)+r.valor;
  });

  var planMap = {};
  var hasPlan = false;
  cats.forEach(function(c){
    var v = StorageService.getBudgetPlanValue(c, curMonth);
    if(v!==null && v>0){ planMap[c]=v; hasPlan=true; }
  });

  var titleEl = document.getElementById('acpTitle');
  var subEl = document.getElementById('acpSub');
  if(titleEl) titleEl.textContent = 'Acompanhamento — ' + monthLabel(curMonth);
  if(subEl) subEl.textContent = isMesAtual ? now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'}) : 'mês fechado';

  if(!hasPlan){
    document.getElementById('acpResume').innerHTML='';
    document.getElementById('acpTable').innerHTML=
      '<tbody><tr><td colspan="7"><div class="acp-no-plan">'+
      '📋 Nenhum orçamento planejado para '+monthLabel(curMonth)+'. '+
      'Preencha a tabela abaixo para começar a acompanhar seus gastos.</div></td></tr></tbody>';
    return;
  }

  var totalPlan = Object.values(planMap).reduce(function(s,v){return s+v;},0);
  // gasto total do mês inclui categorias sem orçamento — gasto não some da conta
  var totalGasto = Object.values(realMap).reduce(function(s,v){return s+v;},0);
  var totalRest = totalPlan - totalGasto;
  var pctUsed = totalPlan>0 ? totalGasto/totalPlan*100 : 0;
  var restCls = totalRest<0?'over':pctUsed>=80?'warn':'ok';

  // Comparação por mês inteiro (planejado vs. gasto do mês), sem projeção por dia —
  // "quanto já usei do orçamento do mês", não "estou no ritmo pra hoje".
  document.getElementById('acpResume').innerHTML =
    '<div class="acp-card"><div class="ac-lbl">Orçamento do Mês</div><div class="ac-val">'+brl(totalPlan)+'</div><div class="ac-sub">planejado para '+monthLabel(curMonth)+'</div></div>'+
    '<div class="acp-card"><div class="ac-lbl">Gasto no Mês</div><div class="ac-val">'+brl(totalGasto)+'</div><div class="ac-sub">'+pct(pctUsed,0)+' do orçamento usado</div></div>'+
    '<div class="acp-card '+restCls+'"><div class="ac-lbl">Saldo Restante</div><div class="ac-val">'+brl(totalRest)+'</div><div class="ac-sub">'+(totalRest>=0?'disponível para o mês':'acima do orçamento do mês')+'</div></div>';

  var buckets = BUCKETS;
  var bColor = BUCKET_COLOR;

  var html='<thead><tr>'+
    '<th style="text-align:left">Categoria</th>'+
    '<th style="text-align:center">Tipo</th>'+
    '<th>Orçamento</th><th>Gasto</th><th>Restante</th>'+
    '<th class="t-bar-cell">Progresso</th><th>Status</th></tr></thead><tbody>';

  var sortedCats = Object.keys(planMap).sort(function(a,b){
    var pa=(realMap[a]||0)/planMap[a], pb=(realMap[b]||0)/planMap[b];
    return pb-pa;
  });

  buckets.forEach(function(buck){
    var bCats = sortedCats.filter(function(c){ return (classifMap[c]||'Necessidade')===buck; });
    if(!bCats.length) return;
    var bPlan=0, bGasto=0;
    bCats.forEach(function(c){ bPlan+=planMap[c]||0; bGasto+=realMap[c]||0; });
    // categorias do bucket sem orçamento também entram no subtotal de gasto
    cats.forEach(function(c){
      if(!planMap[c] && (classifMap[c]||'Necessidade')===buck) bGasto+=realMap[c]||0;
    });
    var bRest = bPlan-bGasto;
    html+='<tr style="background:#f7f7f7"><td colspan="7" style="padding:5px 10px">'+
      '<span style="font-size:.61rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:'+bColor[buck]+'">'+buck+'</span>'+
      '<span style="float:right;font-size:.67rem;color:#888">orçado <strong>'+brl(bPlan)+'</strong> · gasto <strong style="color:'+bColor[buck]+'">'+brl(bGasto)+'</strong> · '+
      (bRest>=0?'restam <strong style="color:#15803D">'+brl(bRest)+'</strong>':'estourou <strong style="color:#B91C1C">'+brl(Math.abs(bRest))+'</strong>')+'</span></td></tr>';
    bCats.forEach(function(cat){
      var plan = planMap[cat]||0;
      var gasto = realMap[cat]||0;
      var rest = plan - gasto;
      var used = plan>0 ? Math.min(gasto/plan*100,100) : 0;
      var over = plan>0 ? Math.max(0,(gasto-plan)/plan*100) : 0;
      var cls = rest<0?'over':used>=80?'warn':'ok';
      var statusTxt = gasto===0?'Não iniciado':rest<0?'Estourou '+brl(Math.abs(rest)):used>=80?'Atenção — '+brl(rest)+' restam':'OK — '+brl(rest)+' restam';
      var statusCls = gasto===0?'ts-empty':rest<0?'ts-over':used>=80?'ts-warn':'ts-ok';

      html+='<tr data-drill-cat="'+cat.replace(/"/g,'&quot;')+'" title="Clique para ver os lançamentos">'+
        '<td><span class="drill-arrow">▸</span>'+cat+'</td>'+
        '<td style="text-align:center">'+bucketSelectHtml(cat)+'</td>'+
        '<td class="t-plan">'+brl(plan)+'</td>'+
        '<td class="t-gasto">'+brl(gasto)+'</td>'+
        '<td class="t-rest '+cls+'">'+brl(rest)+'</td>'+
        '<td class="t-bar-cell"><div class="t-bar-wrap">'+
          '<div class="t-bar-fill" style="width:'+used.toFixed(1)+'%;background:'+bColor[(classifMap[cat]||'Necessidade')]+'"></div>'+
          (over>0?'<div class="t-bar-over" style="width:'+Math.min(over,30).toFixed(1)+'%"></div>':'')+
        '</div><div style="font-size:.63rem;color:#aaa;text-align:right;margin-top:2px">'+pct(used,0)+'</div></td>'+
        '<td><span class="t-status '+statusCls+'">'+statusTxt+'</span></td>'+
      '</tr>';
    });
  });

  var unplanned = cats.filter(function(c){ return !planMap[c] && realMap[c]>0; });
  if(unplanned.length){
    html+='<tr style="background:#f7f7f7"><td colspan="7" style="font-size:.61rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#bbb;padding:5px 10px">Sem orçamento definido</td></tr>';
    unplanned.forEach(function(cat){
      html+='<tr data-drill-cat="'+cat.replace(/"/g,'&quot;')+'" title="Clique para ver os lançamentos">'+
        '<td><span class="drill-arrow">▸</span>'+cat+'</td>'+
        '<td style="text-align:center">'+bucketSelectHtml(cat)+'</td>'+
        '<td class="t-plan" style="color:#ddd">—</td>'+
        '<td class="t-gasto">'+brl(realMap[cat])+'</td>'+
        '<td style="color:#bbb">—</td>'+
        '<td></td>'+
        '<td><span class="t-status ts-empty">Sem plano</span></td></tr>';
    });
  }

  html+='</tbody><tfoot><tr><td>Total</td><td></td><td>'+brl(totalPlan)+'</td><td>'+brl(totalGasto)+'</td>'+
    '<td class="t-rest '+restCls+'">'+brl(totalRest)+'</td>'+
    '<td><div class="t-bar-wrap"><div class="t-bar-fill" style="width:'+Math.min(pctUsed,100).toFixed(1)+'%;background:#1a1a1a"></div></div>'+
    '<div style="font-size:.63rem;color:#aaa;text-align:right;margin-top:2px">'+pct(pctUsed,0)+'</div></td>'+
    '<td><span class="t-status '+(restCls==='ok'?'ts-ok':restCls==='warn'?'ts-warn':'ts-over')+'">'+(totalRest>=0?brl(totalRest)+' restam':'Estourou '+brl(Math.abs(totalRest)))+'</span></td></tr></tfoot>';

  var acpTbl = document.getElementById('acpTable');
  acpTbl.innerHTML = html;
  bindBucketSelects(acpTbl);
  bindCatDrilldown(acpTbl, curMonth);
}

function simGetPlanMonths(){
  var now = new Date();
  var months = [];
  for(var m=now.getMonth()+1; m<=12; m++){
    months.push(now.getFullYear()+'-'+String(m).padStart(2,'0'));
  }
  return months;
}
function simGetRefMonths(){
  var now = new Date();
  var refs = [];
  for(var i=3;i>=1;i--){
    var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    refs.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return refs;
}

function renderSimTab(){
  var mesEscolhido = populateMonthSelect();
  renderAcompanhamento(mesEscolhido);
  var months = simGetPlanMonths();
  var cats = uniq(allGastos.map(function(r){ return r.cat; }));
  var ganhoMs = uniq(allGanhos.map(function(r){ return monthKey(r.date); }));
  var autoGanho = ganhoMs.length ? total(allGanhos)/ganhoMs.length : 0;
  var overrideGanho = StorageService.getBudgetIncome();
  var avgGanho = overrideGanho!==null ? overrideGanho : autoGanho;
  var isOvr = overrideGanho!==null;

  var refMs = simGetRefMonths();

  var realMap = {};
  allGastos.forEach(function(r){
    var c=r.cat||'Outros', m=monthKey(r.date); if(!m) return;
    if(!realMap[c]) realMap[c]={};
    realMap[c][m]=(realMap[c][m]||0)+r.valor;
  });
  var realColTot = {};
  refMs.forEach(function(m){
    realColTot[m]=cats.reduce(function(s,c){return s+(realMap[c]&&realMap[c][m]||0);},0);
  });

  var buckets = ['Necessidade','Investimento','Lazer'];
  var bucketCats = {Necessidade:[],Investimento:[],Lazer:[]};
  cats.forEach(function(c){ var b=classifMap[c]||'Necessidade'; bucketCats[b].push(c); });

  var colTotals={}; months.forEach(function(m){colTotals[m]=0;});
  var catTotals={}; cats.forEach(function(c){catTotals[c]=0;});
  var buckTotals={Necessidade:0,Investimento:0,Lazer:0};
  var grandTotal=0;
  cats.forEach(function(c){
    months.forEach(function(m){
      var v=StorageService.getBudgetPlanValue(c,m)||0;
      colTotals[m]+=v; catTotals[c]+=v; grandTotal+=v;
      buckTotals[classifMap[c]||'Necessidade']+=v;
    });
  });
  var avgPlanned = months.length ? grandTotal/months.length : 0;

  var savRate = avgGanho>0 ? Math.max(0,(avgGanho-avgPlanned)/avgGanho*100) : 0;
  var kpis = [
    {lbl:'Total Planejado',val:brl(grandTotal),sub:months.length+' meses · '+brl(avgPlanned)+'/mês',cls:''},
    {lbl:'Receita Mensal',val:'__GANHO_INPUT__',sub:'Clique para editar',cls:'inv'},
    {lbl:'Necessidade',val:pct(grandTotal?buckTotals.Necessidade/grandTotal*100:0),sub:brl(buckTotals.Necessidade),cls:'nec'},
    {lbl:'Investimento',val:pct(grandTotal?buckTotals.Investimento/grandTotal*100:0),sub:brl(buckTotals.Investimento),cls:'inv'},
    {lbl:'Lazer',val:pct(grandTotal?buckTotals.Lazer/grandTotal*100:0),sub:brl(buckTotals.Lazer),cls:'laz'},
    {lbl:'Poupança Estimada',val:pct(savRate),sub:brl(avgGanho-avgPlanned)+'/mês',cls:savRate>=20?'inv':'warn'}
  ];
  document.getElementById('simKpis').innerHTML = kpis.map(function(k){
    if(k.val==='__GANHO_INPUT__'){
      return '<div class="sim-kpi '+k.cls+'" style="position:relative">'+
        '<div class="sk-lbl">'+k.lbl+(isOvr?' <span style="color:#EF9F27;font-size:.55rem">★ editado</span>':'')+'</div>'+
        '<div style="display:flex;align-items:center;gap:6px;margin:3px 0">'+
          '<input id="simGanhoInp" type="number" min="0" step="100" value="'+avgGanho.toFixed(2)+'" '+
          'style="width:110px;padding:4px 8px;border:1.5px solid #BBF7D0;border-radius:7px;font-family:inherit;font-size:1rem;font-weight:700;color:#15803D;background:#fff;outline:none"/>'+
        '</div>'+
        '<div class="sk-sub">Histórico: '+brl(autoGanho)+'/mês'+
          (isOvr?' &bull; <button id="btnResetGanho" style="border:none;background:none;color:#bbb;cursor:pointer;font-size:.65rem;padding:0">↩ resetar</button>':'')+
        '</div>'+
      '</div>';
    }
    return '<div class="sim-kpi '+k.cls+'"><div class="sk-lbl">'+k.lbl+'</div><div class="sk-val">'+k.val+'</div><div class="sk-sub">'+k.sub+'</div></div>';
  }).join('');

  var ginp = document.getElementById('simGanhoInp');
  if(ginp){
    ginp.addEventListener('change', function(){
      var v = parseFloat(ginp.value);
      StorageService.setBudgetIncome(isNaN(v)||v<=0 ? null : v).then(renderSimTab);
    });
    ginp.addEventListener('focus', function(){ ginp.select(); });
  }
  var btnReset = document.getElementById('btnResetGanho');
  if(btnReset) btnReset.addEventListener('click', function(){ StorageService.setBudgetIncome(null).then(renderSimTab); });

  var totalCols = refMs.length + months.length;

  var html = '<thead><tr>';
  html += '<th colspan="2" style="text-align:left;border-right:2px solid #e0e0e0"></th>';
  if(refMs.length) html += '<th colspan="'+refMs.length+'" style="text-align:center;color:#bbb;font-size:.6rem;background:#f9f9f9;border-right:2px dashed #ddd">&#128197; REALIZADO</th>';
  html += '<th colspan="'+months.length+'" style="text-align:center;color:#1D4ED8;font-size:.6rem;background:#F0F4FF">&#9997; PLANEJADO</th>';
  html += '<th colspan="3"></th></tr>';
  html += '<tr><th style="text-align:left">Categoria</th><th style="text-align:center">Bucket</th>';
  refMs.forEach(function(m){ html += '<th style="color:#bbb;background:#f9f9f9;font-style:italic">'+monthLabel(m)+'</th>'; });
  months.forEach(function(m){ html+='<th style="color:#1D4ED8;background:#F0F4FF">'+monthLabel(m)+'</th>'; });
  html += '<th>Total Plan.</th><th>% Total</th><th>Média/mês</th></tr></thead><tbody>';

  buckets.forEach(function(buck){
    var bCats = bucketCats[buck]; if(!bCats.length) return;
    var bColor = {Necessidade:'#1D4ED8',Investimento:'#15803D',Lazer:'#C2410C'}[buck];
    var pillCls = {Necessidade:'nec',Investimento:'inv',Lazer:'laz'}[buck];
    html += '<tr class="bucket-sep"><td colspan="'+(totalCols+5)+'">'+buck+'</td></tr>';
    bCats.forEach(function(cat){
      var cTot = catTotals[cat];
      var pctOfTotal = grandTotal ? cTot/grandTotal*100 : 0;
      var cAvg = months.length ? cTot/months.length : 0;
      var inpCls = 'p-inp '+pillCls+'-inp';
      html += '<tr><td>'+cat+'</td>';
      html += '<td style="text-align:center">'+(bucketSelectHtml(cat)||'<span class="pct-pill '+pillCls+'">'+buck.charAt(0)+'</span>')+'</td>';
      refMs.forEach(function(m){
        var rv = realMap[cat]&&realMap[cat][m]||0;
        var isLast = m===refMs[refMs.length-1];
        html += '<td style="color:#999;font-size:.75rem;font-variant-numeric:tabular-nums;background:#f9f9f9'+(isLast?';border-right:2px dashed #ddd':'')+'">'+(rv>0?brl(rv):'—')+'</td>';
      });
      months.forEach(function(m){
        var v = StorageService.getBudgetPlanValue(cat,m);
        var refV = realMap[cat]&&realMap[cat][refMs[refMs.length-1]]||0;
        var dispV = v!==null ? v : '';
        html += '<td style="background:#F8FAFF"><input class="'+inpCls+(dispV!==''?' has-val':'')+'" type="number" min="0" step="50" '+
          'data-sim-cat="'+cat.replace(/"/g,'&quot;')+'" data-sim-month="'+m+'" '+
          'value="'+dispV+'" placeholder="'+(refV>0?Math.round(refV):'—')+'"/></td>';
      });
      html += '<td class="col-tot">'+(cTot>0?brl(cTot):'—')+'</td>';
      html += '<td><div style="display:flex;align-items:center;gap:4px">'+
        '<div style="flex:1;background:#f0f0f0;border-radius:3px;height:6px;overflow:hidden;min-width:36px">'+
        '<div style="height:100%;border-radius:3px;background:'+bColor+';width:'+Math.min(pctOfTotal,100).toFixed(1)+'%"></div></div>'+
        '<span style="font-size:.68rem;color:#888;min-width:30px">'+pct(pctOfTotal,1)+'</span></div></td>';
      html += '<td class="col-tot" style="font-size:.73rem;color:#888">'+(cAvg>0?brl(cAvg):'—')+'</td>';
      html += '</tr>';
    });
  });

  html += '</tbody><tfoot><tr><td colspan="2">Total</td>';
  refMs.forEach(function(m){
    var isLast=m===refMs[refMs.length-1];
    html+='<td style="background:#f9f9f9;color:#888'+(isLast?';border-right:2px dashed #ddd':'')+'">'+(realColTot[m]>0?brl(realColTot[m]):'—')+'</td>';
  });
  months.forEach(function(m){ html+='<td style="background:#F0F4FF;color:#1D4ED8">'+(colTotals[m]>0?brl(colTotals[m]):'—')+'</td>'; });
  html+='<td>'+brl(grandTotal)+'</td><td>100%</td><td>'+brl(avgPlanned)+'</td></tr>';

  html+='<tr style="background:#F0FDF4"><td colspan="2" style="color:#15803D;font-weight:600">Receita Estimada</td>';
  refMs.forEach(function(){html+='<td style="background:#f9f9f9"></td>';});
  months.forEach(function(){html+='<td style="color:#15803D;background:#F0FDF4">'+brl(avgGanho)+'</td>';});
  html += '<td style="color:#15803D">'+brl(avgGanho*months.length)+'</td><td></td><td style="color:#15803D">'+brl(avgGanho)+'</td></tr>';

  html += '<tr style="background:#F8F8F8"><td colspan="2" style="font-weight:600">Saldo Estimado</td>';
  refMs.forEach(function(m){
    var s=avgGanho-(realColTot[m]||0);
    html+='<td style="font-size:.73rem;background:#f9f9f9;color:'+(s>=0?'#15803D':'#B91C1C')+'">'+brl(s)+'</td>';
  });
  months.forEach(function(m){
    var s=avgGanho-(colTotals[m]||0);
    html+='<td style="font-weight:700;background:#F8FAFF;color:'+(s>=0?'#15803D':'#B91C1C')+'">'+brl(s)+'</td>';
  });
  var totalSaldo = avgGanho*months.length - grandTotal;
  html += '<td style="font-weight:700;color:'+(totalSaldo>=0?'#15803D':'#B91C1C')+'">'+brl(totalSaldo)+'</td>';
  html += '<td></td><td style="font-weight:700;color:'+(avgGanho-avgPlanned>=0?'#15803D':'#B91C1C')+'">'+brl(avgGanho-avgPlanned)+'</td></tr>';
  html += '</tfoot>';

  var tbl = document.getElementById('simTable');
  tbl.innerHTML = html;
  bindBucketSelects(tbl);

  tbl.querySelectorAll('.p-inp').forEach(function(inp){
    inp.addEventListener('input', function(){ inp.classList.toggle('has-val', inp.value!==''); });
    inp.addEventListener('change', function(){
      var cat = inp.dataset.simCat;
      var month = inp.dataset.simMonth;
      var val = inp.value==='' ? null : parseFloat(inp.value);
      StorageService.setBudgetPlanValue(cat, month, isNaN(val)?null:val).then(function(){
        renderSimTab();
        showToast(val===null||isNaN(val) ? '✓ Orçamento removido' : '✓ '+cat+' ('+monthLabel(month)+'): '+brl(val));
      });
    });
  });

  var idealNec=50, idealInv=20, idealLaz=30;
  var actNec=grandTotal?buckTotals.Necessidade/grandTotal*100:0;
  var actInv=grandTotal?buckTotals.Investimento/grandTotal*100:0;
  var actLaz=grandTotal?buckTotals.Lazer/grandTotal*100:0;

  function progRow(lbl,actual,ideal,color,pillcls){
    var ok=Math.abs(actual-ideal)<=5;
    return '<div class="sp-row">'+
      '<span class="sp-lbl"><span class="pct-pill '+pillcls+'">'+lbl+'</span></span>'+
      '<div class="sp-track"><div class="sp-fill" style="width:'+Math.min(actual,100).toFixed(1)+'%;background:'+color+'"></div></div>'+
      '<span class="sp-vals">'+pct(actual,1)+' <span style="color:#bbb">· meta ≤'+ideal+'%</span> '+
      (grandTotal?'<span style="color:'+(ok?'#15803D':'#D97706')+'">'+(ok?'✓':'!')+'</span>':'')+'</span>'+
      '</div>';
  }
  var insights = [];
  if(grandTotal){
    if(actNec>55) insights.push('Necessidades em '+pct(actNec,0)+' do planejado — acima do ideal, dá pra revisar gastos fixos antes de comprometer mais renda.');
    if(actInv<20) insights.push('Investimento em '+pct(actInv,0)+' — faltam '+brl(Math.max(0,grandTotal*0.20-buckTotals.Investimento))+'/mês pra chegar nos 20% recomendados.');
    if(actLaz>30) insights.push('Lazer em '+pct(actLaz,0)+' — acima da meta de 30%.');
  }
  var insightHtml = insights.length
    ? '<div style="margin-top:8px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:.7rem;color:#92400E">💡 '+insights.join(' ')+'</div>'
    : (grandTotal ? '<div style="margin-top:8px;padding:8px 10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;font-size:.7rem;color:#15803D">✓ Distribuição dentro da meta 50/20/30.</div>' : '');

  document.getElementById('simProgress').innerHTML =
    progRow('Necessidade',actNec,50,'rgba(29,78,216,.6)','nec')+
    progRow('Investimento',actInv,20,'rgba(21,128,61,.7)','inv')+
    progRow('Lazer',actLaz,30,'rgba(194,65,12,.7)','laz')+
    '<p style="font-size:.67rem;color:#bbb;margin-top:8px">Meta sugerida: Necessidade ≤50% · Investimento ≥20% · Lazer ≤30% (regra 50/20/30)</p>'+
    insightHtml;
}

function simFillAverages(){
  var months = simGetPlanMonths();
  var rows = allGastos.filter(function(r){ if(!r.date) return false; var mo=r.date.getMonth()+1; return mo!==1&&mo!==2; });
  var cats = uniq(allGastos.map(function(r){return r.cat;}));
  var realMonths = uniq(rows.map(function(r){return monthKey(r.date);}));
  var catAvg = {};
  cats.forEach(function(c){
    var mTot={}; rows.forEach(function(r){ if(r.cat===c){var mk=monthKey(r.date);if(mk)mTot[mk]=(mTot[mk]||0)+r.valor;} });
    catAvg[c] = realMonths.length ? Object.values(mTot).reduce(function(s,v){return s+v;},0)/realMonths.length : 0;
  });
  var ops = [];
  cats.forEach(function(c){
    months.forEach(function(m){ if(catAvg[c]>0) ops.push(StorageService.setBudgetPlanValue(c,m,Math.round(catAvg[c]))); });
  });
  Promise.all(ops).then(function(){ renderSimTab(); showSimSaved('Médias aplicadas!'); });
}

function simFillLastMonth(){
  var months = simGetPlanMonths();
  var cats = uniq(allGastos.map(function(r){return r.cat;}));
  var realMs = uniq(allGastos.map(function(r){return monthKey(r.date);})).sort();
  var lastM = realMs[realMs.length-1];
  if(!lastM) return;
  var catMap = {};
  allGastos.forEach(function(r){ if(monthKey(r.date)===lastM){ catMap[r.cat]=(catMap[r.cat]||0)+r.valor; } });
  var ops = [];
  cats.forEach(function(c){
    months.forEach(function(m){ if(catMap[c]>0) ops.push(StorageService.setBudgetPlanValue(c,m,Math.round(catMap[c]))); });
  });
  Promise.all(ops).then(function(){ renderSimTab(); showSimSaved('Último mês aplicado!'); });
}

function simClearAll(){
  var months = simGetPlanMonths();
  var cats = uniq(allGastos.map(function(r){return r.cat;}));
  var ops = [];
  cats.forEach(function(c){ months.forEach(function(m){ ops.push(StorageService.setBudgetPlanValue(c,m,null)); }); });
  ops.push(StorageService.setBudgetIncome(null));
  Promise.all(ops).then(function(){ renderSimTab(); showSimSaved('Tudo limpo.'); });
}

function showSimSaved(msg){
  var el=document.getElementById('simSavedMsg'); if(!el) return;
  el.textContent='✓ '+msg;
  setTimeout(function(){ el.textContent=''; }, 2500);
}

/* ─── Simulador de Investimentos (sem auto-preenchimento de patrimônio — entrada manual) ─── */
function calcInvest(aporte, taxaMes, anos, patrimonioInicial){
  var meses = anos*12, r = taxaMes/100, pv = patrimonioInicial||0;
  var rows=[], patrimonio=pv;
  for(var t=1;t<=meses;t++){
    patrimonio = patrimonio*(1+r)+aporte;
    if(t%12===0){
      var ano=t/12;
      var totalAportado = aporte*t;
      var jurosTotal = patrimonio-pv-totalAportado;
      rows.push({ano:ano, patrimonio:patrimonio, totalInvestido:totalAportado, juros:jurosTotal, patrimonioInicial:pv});
    }
  }
  return rows;
}

/* Perfis de investimento — referência de taxa mensal típica pra cada tipo, editável
   no slider depois de escolher (não é garantia de retorno, é ponto de partida). */
var INVEST_PRESETS = [
  {id:'poup', lbl:'💰 Poupança', taxaMes:0.5, sub:'~6,2% a.a. · baixo risco'},
  {id:'cdb', lbl:'🏦 CDB / Tesouro Selic', taxaMes:0.85, sub:'~100% CDI · baixo risco'},
  {id:'multi', lbl:'📊 Fundos Multimercado', taxaMes:1.0, sub:'risco moderado'},
  {id:'acoes', lbl:'📈 Ações / Renda Variável', taxaMes:1.3, sub:'alto risco · retorno não garantido'}
];

var META_PRESETS = [
  {lbl:'🏠 Entrada de casa', nome:'Entrada da casa'},
  {lbl:'🚗 Carro', nome:'Carro'},
  {lbl:'✈️ Viagem', nome:'Viagem dos sonhos'},
  {lbl:'🎓 Educação', nome:'Educação'}
];

/* Quantos meses até o patrimônio (com aporte mensal e taxa compostos) atingir o alvo. */
function calcMesesParaMeta(pv, aporte, taxaMesPct, alvo){
  var r = taxaMesPct/100, pat = pv;
  if(pat>=alvo) return 0;
  for(var m=1; m<=600; m++){
    pat = pat*(1+r)+aporte;
    if(pat>=alvo) return m;
  }
  return null; // não atinge em 50 anos com esse aporte/taxa
}

function renderInvestTab(){
  var investRows = allGastos.filter(function(r){
    if(!r.date) return false;
    var mo = r.date.getMonth()+1;
    return mo!==1 && mo!==2 && (r.cat||'').toLowerCase().indexOf('invest')!==-1;
  });
  var investMonths = uniq(investRows.map(function(r){return monthKey(r.date);}));
  var mediaInvest = investMonths.length>0 ? total(investRows)/investMonths.length : 500;
  mediaInvest = Math.round(mediaInvest/50)*50;

  var slAp=document.getElementById('slAporte'), slTx=document.getElementById('slTaxa'), slAn=document.getElementById('slAnos');
  var slInfl=document.getElementById('slInflacao');
  var patInp=document.getElementById('patInicial');
  if(!slAp) return;

  if(!slAp.dataset.init){
    slAp.value = Math.min(Math.max(mediaInvest,100),5000);
    slTx.value = 0.9;
    slAn.value = 10;
    slAp.dataset.init = '1';
  }
  // pré-preenche com o total já guardado (mesma fonte do card de Reserva) em vez de
  // começar do zero — só na primeira vez que o campo aparece, sem sobrescrever edição.
  if(!patInp.dataset.touched && (patInp.value===''||parseFloat(patInp.value)===0) && _reservaGuardadoTotal>0){
    patInp.value = _reservaGuardadoTotal;
  }

  var presetsEl = document.getElementById('invPresets');
  if(presetsEl && !presetsEl.dataset.init){
    presetsEl.innerHTML = INVEST_PRESETS.map(function(p){
      return '<button type="button" class="inv-preset-btn" data-preset="'+p.id+'" data-taxa="'+p.taxaMes+'">'+
        '<span class="ipb-lbl">'+p.lbl+'</span><span class="ipb-sub">'+p.sub+'</span></button>';
    }).join('');
    presetsEl.dataset.init = '1';
    presetsEl.addEventListener('click', function(ev){
      var btn = ev.target.closest('[data-preset]');
      if(!btn) return;
      slTx.value = btn.dataset.taxa;
      presetsEl.querySelectorAll('.inv-preset-btn').forEach(function(b){ b.classList.toggle('on', b===btn); });
      refresh();
    });
  }

  var metaPresetsEl = document.getElementById('metaPresets');
  if(metaPresetsEl && !metaPresetsEl.dataset.init){
    metaPresetsEl.innerHTML = META_PRESETS.map(function(p){
      return '<button type="button" class="inv-preset-btn" data-meta-nome="'+p.nome+'"><span class="ipb-lbl">'+p.lbl+'</span></button>';
    }).join('');
    metaPresetsEl.dataset.init = '1';
    metaPresetsEl.addEventListener('click', function(ev){
      var btn = ev.target.closest('[data-meta-nome]');
      if(!btn) return;
      document.getElementById('metaNome').value = btn.dataset.metaNome;
      metaPresetsEl.querySelectorAll('.inv-preset-btn').forEach(function(b){ b.classList.toggle('on', b===btn); });
      document.getElementById('metaValor').focus();
      renderMetaResultado();
    });
  }

  function renderMetaResultado(){
    var el = document.getElementById('metaResultado');
    if(!el) return;
    var nome = (document.getElementById('metaNome').value||'').trim();
    var alvo = parseFloat(document.getElementById('metaValor').value);
    if(!nome || !alvo || alvo<=0){ el.innerHTML=''; return; }
    var aporte=parseFloat(slAp.value)||0, taxa=parseFloat(slTx.value)||0, pv=parseFloat(patInp.value)||0;
    var meses = calcMesesParaMeta(pv, aporte, taxa, alvo);
    if(meses===null){
      el.innerHTML = '<div class="acp-card over"><div class="ac-lbl">🎯 '+nome+' — '+brl(alvo)+'</div>'+
        '<div class="ac-val" style="font-size:.95rem">Não atinge em 50 anos</div>'+
        '<div class="ac-sub">aumente o aporte mensal ou escolha um perfil de investimento com taxa maior</div></div>';
      return;
    }
    var anosQ = Math.floor(meses/12), restM = meses%12;
    var quando = meses===0
      ? 'você já tem esse valor guardado'
      : (anosQ>0 ? anosQ+' ano'+(anosQ>1?'s':'')+(restM>0?' e '+restM+' mês'+(restM>1?'es':''):'') : restM+' mês'+(restM>1?'es':''));
    var dataAlvo = new Date(); dataAlvo.setMonth(dataAlvo.getMonth()+meses);
    el.innerHTML = '<div class="acp-card ok"><div class="ac-lbl">🎯 '+nome+' — '+brl(alvo)+'</div>'+
      '<div class="ac-val" style="font-size:1.1rem">'+quando+'</div>'+
      '<div class="ac-sub">'+(meses===0?'':'por volta de '+dataAlvo.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})+', mantendo esse aporte e taxa')+'</div></div>';
  }
  var metaNomeEl = document.getElementById('metaNome'), metaValorEl = document.getElementById('metaValor');
  if(metaNomeEl && !metaNomeEl.dataset.init){
    metaNomeEl.addEventListener('input', renderMetaResultado);
    metaValorEl.addEventListener('input', renderMetaResultado);
    metaNomeEl.dataset.init = '1';
  }

  function refresh(){
    var aporte=parseFloat(slAp.value), taxa=parseFloat(slTx.value), anos=parseInt(slAn.value,10);
    var inflacaoAno = parseFloat(slInfl.value)||0;
    var pv = parseFloat(patInp.value)||0;

    document.getElementById('svAporte').textContent = brl(aporte);
    document.getElementById('svTaxa').textContent = taxa.toFixed(2).replace('.',',')+'%';
    document.getElementById('svAnos').textContent = anos+' ano'+(anos>1?'s':'');
    document.getElementById('svInflacao').textContent = inflacaoAno.toFixed(1).replace('.',',')+'%';

    var rows10 = calcInvest(aporte,taxa,anos,pv);
    if(!rows10.length) return;
    var final = rows10[rows10.length-1];
    var taxaAnual = (Math.pow(1+taxa/100,12)-1)*100;
    var totalCapital = pv + final.totalInvestido;

    // Retorno real: desconta a inflação do período pra mostrar o poder de compra de
    // verdade, não só o número nominal (que engana em horizontes longos no Brasil).
    var patrimonioReal = final.patrimonio / Math.pow(1+inflacaoAno/100, anos);

    // Comparação com poupança (aproximação simplificada, ~0,5%/mês) — referência
    // pra saber se a taxa escolhida vale o esforço de sair da poupança.
    var TAXA_POUPANCA_MES = 0.5;
    var poupRows = calcInvest(aporte, TAXA_POUPANCA_MES, anos, pv);
    var patrimonioPoupanca = poupRows.length ? poupRows[poupRows.length-1].patrimonio : pv;
    var ganhoVsPoupanca = final.patrimonio - patrimonioPoupanca;

    // Regra dos 4%: retirada anual sustentável de longo prazo sobre o patrimônio
    // acumulado (referência clássica de independência financeira/aposentadoria).
    var rendaPassivaMensal = final.patrimonio * 0.04 / 12;

    var pvCard = pv>0
      ? '<div class="inv-card hi"><div class="cl">Patrimônio Inicial</div><div class="cv">'+brl(pv)+'</div><div class="cs">Saldo já guardado incluído</div></div>'
      : '';
    document.getElementById('invKpis').innerHTML =
      '<div class="inv-card"><div class="cl">Aporte Mensal</div><div class="cv">'+brl(aporte)+'</div><div class="cs">Histórico: '+brl(mediaInvest)+'/mês</div></div>'+
      '<div class="inv-card"><div class="cl">Taxa Anual Equiv.</div><div class="cv">'+taxaAnual.toFixed(2).replace('.',',')+'% a.a.</div><div class="cs">'+taxa.toFixed(2).replace('.',',')+'% a.m.</div></div>'+
      pvCard+
      '<div class="inv-card hi"><div class="cl">Patrimônio em '+anos+' ano'+(anos>1?'s':'')+'</div><div class="cv">'+brl(final.patrimonio)+'</div><div class="cs">'+brl(totalCapital)+' aportados</div></div>'+
      '<div class="inv-card hi"><div class="cl">Juros Acumulados</div><div class="cv">'+brl(final.juros)+'</div><div class="cs">'+pct(final.juros/final.patrimonio*100,1)+' do patrimônio</div></div>'+
      '<div class="inv-card"><div class="cl">Multiplicador</div><div class="cv">'+(final.patrimonio/Math.max(totalCapital,1)).toFixed(2).replace('.',',')+'x</div><div class="cs">Retorno sobre capital total</div></div>'+
      '<div class="inv-card"><div class="cl">Poder de Compra Real</div><div class="cv">'+brl(patrimonioReal)+'</div><div class="cs">descontada inflação de '+inflacaoAno.toFixed(1).replace('.',',')+'%/ano</div></div>'+
      '<div class="inv-card '+(ganhoVsPoupanca>=0?'hi':'')+'"><div class="cl">vs. Poupança (aprox.)</div><div class="cv" style="color:'+(ganhoVsPoupanca>=0?'#15803D':'#B91C1C')+'">'+(ganhoVsPoupanca>=0?'+':'')+brl(ganhoVsPoupanca)+'</div><div class="cs">poupança renderia '+brl(patrimonioPoupanca)+'</div></div>'+
      '<div class="inv-card hi"><div class="cl">Renda Passiva (regra dos 4%)</div><div class="cv">'+brl(rendaPassivaMensal)+'/mês</div><div class="cs">retirada sustentável de longo prazo, sem consumir o patrimônio</div></div>';

    var tbl = '<thead><tr><th>Ano</th>'+(pv>0?'<th>Pat. Inicial</th>':'')+
      '<th>Aportes Acum.</th><th>Juros Acum.</th><th>Patrimônio</th><th>Rendim. Anual</th><th>% Juros</th></tr></thead><tbody>';
    rows10.forEach(function(r,i){
      var prevPat = i>0 ? rows10[i-1].patrimonio : pv;
      var rendAnual = r.patrimonio-prevPat-aporte*12;
      var cls = r.ano%2===0?' yr-hi':'';
      tbl += '<tr class="'+cls+'"><td>Ano '+r.ano+' ('+(new Date().getFullYear()+r.ano)+')</td>'+
        (pv>0?'<td style="color:#15803D">'+brl(pv)+'</td>':'')+
        '<td>'+brl(r.totalInvestido)+'</td>'+
        '<td style="color:#15803D">'+brl(r.juros)+'</td>'+
        '<td style="font-weight:700">'+brl(r.patrimonio)+'</td>'+
        '<td style="color:#15803D">'+brl(Math.max(rendAnual,0))+'</td>'+
        '<td>'+pct(r.juros/r.patrimonio*100,1)+'</td></tr>';
    });
    tbl += '</tbody>';
    document.getElementById('invYrTable').innerHTML = tbl;

    document.getElementById('invNote').innerHTML =
      '&#128161; Juros compostos: '+brl(aporte)+'/mês a '+taxa.toFixed(2).replace('.',',')+'% a.m. ('+taxaAnual.toFixed(2).replace('.',',')+'% a.a.) por '+anos+' ano'+(anos>1?'s':'')+
      (pv>0?' &bull; Patrimônio inicial de <strong>'+brl(pv)+'</strong> incluído na simulação.':'')+
      ' &bull; Média histórica aportada: <strong>'+brl(mediaInvest)+'/mês</strong>.';

    var allMonths=[], patData=[], invData=[], jurData=[];
    var r2 = pv;
    for(var t=1;t<=anos*12;t++){
      r2 = r2*(1+taxa/100)+aporte;
      if(t%3===0 || t===1){
        var lbl='Mês '+t; if(t%12===0) lbl='Ano '+(t/12);
        allMonths.push(lbl);
        patData.push(parseFloat(r2.toFixed(2)));
        invData.push(pv+aporte*t);
        jurData.push(parseFloat((r2-pv-aporte*t).toFixed(2)));
      }
    }
    makeChart('chInvest', {
      type:'line',
      data:{ labels:allMonths, datasets:[
        {label:'Patrimônio Total', data:patData, borderColor:'#15803D', borderWidth:2.5, pointRadius:0, fill:true, backgroundColor:'rgba(21,128,61,.08)', tension:.4},
        {label:'Capital Investido', data:invData, borderColor:'#1D4ED8', borderWidth:2, pointRadius:0, fill:true, backgroundColor:'rgba(29,78,216,.05)', tension:.4, borderDash:[4,3]},
        {label:'Juros Acumulados', data:jurData, borderColor:'#EF9F27', borderWidth:1.5, pointRadius:0, fill:false, tension:.4, borderDash:[2,2]}
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:true,labels:{font:{family:'Inter',size:11},color:'#666',boxWidth:14}},
          tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+brl(c.parsed.y);}}} },
        scales:{ x:{grid:{display:false},ticks:{font:{family:'Inter',size:9},color:'#bbb',maxTicksLimit:12}},
          y:{grid:{color:'#f0f0f0'},ticks:{font:{family:'Inter',size:10},color:'#bbb',callback:function(v){return 'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v);}}} }
      }
    });
    renderMetaResultado();
  }

  slAp.oninput = slTx.oninput = slAn.oninput = slInfl.oninput = refresh;
  patInp.oninput = function(){ patInp.dataset.touched='1'; refresh(); };
  refresh();
}

/* ─── Tabs da página ── */
var currentTab = 'planejador';
function setTab(t){
  currentTab = t;
  document.querySelectorAll('.tabs .tab').forEach(function(b){ b.classList.toggle('on', b.dataset.t===t); });
  document.getElementById('panelPlanejador').style.display = t==='planejador' ? '' : 'none';
  document.getElementById('panelInvest').style.display = t==='invest' ? '' : 'none';
  if(t==='invest') renderInvestTab();
}

/* ─── Init ─── */
function setLoading(msg){ document.getElementById('loadingMsg').textContent = msg; }

setLoading('Carregando dados financeiros…');
StorageService.initFinanceiro().then(function(){
  document.getElementById('loadingMsg').style.display='none';
  document.getElementById('pjContent').style.display='';
  rebuildDerivedData();
  renderSimTab();
  renderReservaEmergencia();
  document.querySelectorAll('.tabs .tab').forEach(function(b){
    b.addEventListener('click', function(){ setTab(b.dataset.t); });
  });
  document.getElementById('btnFillAvg').addEventListener('click', simFillAverages);
  document.getElementById('btnFillLast').addEventListener('click', simFillLastMonth);
  document.getElementById('btnClearSim').addEventListener('click', simClearAll);
}).catch(function(e){ setLoading('⚠️ Erro ao carregar: '+e.message); });

}());
