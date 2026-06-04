(function(){
'use strict';

/* ─── URLs ─── */
var URL_GASTOS   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSHxO0A4QTL9fxCK5OglA3Jcat2gfH4nUP1zoYbMqCdBS-F3fHpZTQ4mL2VYww9CMMBzbXz24zGhmEc/pub?gid=1589078644&single=true&output=csv';
var URL_GANHOS   = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSHxO0A4QTL9fxCK5OglA3Jcat2gfH4nUP1zoYbMqCdBS-F3fHpZTQ4mL2VYww9CMMBzbXz24zGhmEc/pub?gid=792665561&single=true&output=csv';
var URL_GUARDADO = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSHxO0A4QTL9fxCK5OglA3Jcat2gfH4nUP1zoYbMqCdBS-F3fHpZTQ4mL2VYww9CMMBzbXz24zGhmEc/pub?gid=1823976397&single=true&output=csv';

/* ─── Config ─── */
var CAT_COLORS = {
  'alimenta':'#1D9E75','compra':'#E85D04','transport':'#EF9F27','saude':'#D4537E',
  'lazer':'#7F77DD','educa':'#D85A30','moradia':'#378ADD','assina':'#9B5DE5',
  'viagem':'#00B4D8','doa':'#F77F00','outros':'#888780','salario':'#1D9E75',
  'ticket':'#EF9F27','ppr':'#7F77DD','auxilio':'#378ADD','casa':'#378ADD',
  'invest':'#1D9E75'
};
var RESP_COLORS = ['#378ADD','#1D9E75','#EF9F27','#D4537E','#7F77DD','#E85D04'];
var BUCK_COLORS = {Necessidade:'#1D4ED8', Investimento:'#15803D', Lazer:'#C2410C'};
var BUCK_ALPHA  = {Necessidade:'rgba(29,78,216,.55)', Investimento:'rgba(21,128,61,.55)', Lazer:'rgba(194,65,12,.55)'};
var DEFAULT_CLASSIF = {
  'Alimentação':'Necessidade','Casa':'Necessidade',
  'Transporte':'Necessidade','Saúde / Bem estar':'Necessidade','Moradia':'Necessidade',
  'Doação':'Necessidade','Outros':'Necessidade','Educação':'Necessidade',
  'Investimento':'Investimento',
  'Compras':'Lazer','Assinatura':'Lazer','Lazer':'Lazer','Viagem':'Lazer'
};
var LS_KEY = 'cf_classif_v3';

/* ─── Utils ─── */
function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function lo(s) { return stripAccents(String(s || '')).toLowerCase(); }

function catColor(name) {
  var n = lo(name);
  var keys = Object.keys(CAT_COLORS);
  for (var i = 0; i < keys.length; i++) {
    if (n.indexOf(keys[i]) !== -1) return CAT_COLORS[keys[i]];
  }
  return '#888780';
}

function findCol(headers, patterns) {
  for (var p = 0; p < patterns.length; p++) {
    for (var h = 0; h < headers.length; h++) {
      if (lo(headers[h]).indexOf(patterns[p]) !== -1) return headers[h];
    }
  }
  return null;
}

function parseMoney(s) {
  if (!s) return 0;
  var c = String(s).replace(/R\$\s*/gi,'').replace(/\s/g,'').replace(/\./g,'').replace(/,/g,'.');
  var v = parseFloat(c);
  return isNaN(v) ? 0 : v;
}

function brl(v) {
  return v.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function pct(v, d) { return v.toFixed(d == null ? 1 : d) + '%'; }

function parseDate(s) {
  if (!s) return null;
  var m = String(s).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    var y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function monthKey(date) {
  if (!date) return null;
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function monthLabel(key) {
  var p = key.split('-');
  return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, 1)
    .toLocaleDateString('pt-BR', {month:'short', year:'2-digit'});
}

function uniq(arr) {
  var seen = {}, out = [];
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] && !seen[arr[i]]) { seen[arr[i]] = true; out.push(arr[i]); }
  }
  return out.sort();
}

function sumBy(rows, key) {
  var m = {};
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i][key] || 'Outros';
    m[k] = (m[k] || 0) + rows[i].valor;
  }
  return Object.keys(m).map(function(k){ return [k, m[k]]; }).sort(function(a,b){ return b[1]-a[1]; });
}

function sumMonthly(rows) {
  var m = {};
  for (var i = 0; i < rows.length; i++) {
    var k = monthKey(rows[i].date);
    if (k) m[k] = (m[k] || 0) + rows[i].valor;
  }
  return m;
}

function total(rows) {
  var s = 0;
  for (var i = 0; i < rows.length; i++) s += rows[i].valor;
  return s;
}

function $(id) { return document.getElementById(id); }

/* ─── Forecast: project N months ahead using per-category average ─── */
function buildForecast(rows, nMonths) {
  // For each category, compute average monthly spend across REAL months
  var catMonthMap = {};  // {cat: {month: value}}
  rows.forEach(function(r) {
    var k = monthKey(r.date); if (!k) return;
    var c = r.cat || 'Outros';
    if (!catMonthMap[c]) catMonthMap[c] = {};
    catMonthMap[c][k] = (catMonthMap[c][k] || 0) + r.valor;
  });

  // Real months present in data
  var realMonths = uniq(rows.map(function(r){ return monthKey(r.date); }).filter(Boolean));
  if (!realMonths.length) return {rows:[], months:[]};

  // Last real month
  var lastReal = realMonths[realMonths.length - 1];
  var lp = lastReal.split('-');
  var futureMonths = [];
  var yr = parseInt(lp[0],10), mo = parseInt(lp[1],10);
  for (var i = 0; i < nMonths; i++) {
    mo++;
    if (mo > 12) { mo = 1; yr++; }
    futureMonths.push(yr + '-' + String(mo).padStart(2,'0'));
  }

  // Average per category
  var catAvg = {};
  Object.keys(catMonthMap).forEach(function(cat) {
    var vals = Object.values(catMonthMap[cat]);
    catAvg[cat] = vals.reduce(function(s,v){return s+v;},0) / realMonths.length;
  });

  // Build forecast rows
  var forecastRows = [];
  futureMonths.forEach(function(mk) {
    var p = mk.split('-');
    var date = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, 1);
    Object.keys(catAvg).forEach(function(cat) {
      if (catAvg[cat] > 0.5) {
        forecastRows.push({
          date: date, rawDate: '', desc: 'Previsão', cat: cat,
          tipo: '', resp: '', valor: catAvg[cat], forecast: true
        });
      }
    });
  });

  return { rows: forecastRows, months: futureMonths, catAvg: catAvg };
}

/* Same for ganhos */
function buildGanhoForecast(rows, nMonths) {
  var realMonths = uniq(rows.map(function(r){ return monthKey(r.date); }).filter(Boolean));
  if (!realMonths.length) return { rows:[], months:[] };
  var monthlyTotal = sumMonthly(rows);
  var avg = Object.values(monthlyTotal).reduce(function(s,v){return s+v;},0) / realMonths.length;

  var lastReal = realMonths[realMonths.length-1];
  var lp = lastReal.split('-');
  var futureMonths = [], yr=parseInt(lp[0],10), mo=parseInt(lp[1],10);
  for (var i = 0; i < nMonths; i++) {
    mo++; if(mo>12){mo=1;yr++;}
    futureMonths.push(yr+'-'+String(mo).padStart(2,'0'));
  }

  var forecastRows = futureMonths.map(function(mk) {
    var p = mk.split('-');
    return { date: new Date(parseInt(p[0],10),parseInt(p[1],10)-1,1), rawDate:'', desc:'Previsão',
      cat:'Projeção', tipo:'', resp:'', valor: avg, forecast: true };
  });
  return { rows: forecastRows, months: futureMonths, avg: avg };
}

/* ─── Forecast overrides (user-editable per category/description per month) ─── */
var FC_OVR_KEY = 'cf_fc_overrides_v1';
function fcGetAll()  { try { return JSON.parse(localStorage.getItem(FC_OVR_KEY)||'{}'); } catch(e){ return {}; } }
function fcKey(level, name, month) { return level+'|'+name+'|'+month; }
function fcGet(level, name, month) { return fcGetAll()[fcKey(level,name,month)]; }
function fcSet(level, name, month, val) {
  var all = fcGetAll();
  if (val === null || val === undefined || isNaN(val)) { delete all[fcKey(level,name,month)]; }
  else { all[fcKey(level,name,month)] = val; }
  localStorage.setItem(FC_OVR_KEY, JSON.stringify(all));
}
function fcClearAll() { localStorage.removeItem(FC_OVR_KEY); }
function fcOverrideCount() { return Object.keys(fcGetAll()).length; }

/* ─── Forecast to year-end, excluding Jan & Feb from average ─── */
function buildForecastToYearEnd(rows) {
  // Only use months that are NOT January or February for average base
  var baseRows = rows.filter(function(r) {
    if (!r.date) return false;
    var mo = r.date.getMonth() + 1;
    return mo !== 1 && mo !== 2;
  });

  var catMonthMap = {};
  baseRows.forEach(function(r) {
    var k = monthKey(r.date); if (!k) return;
    var c = r.cat || 'Outros';
    if (!catMonthMap[c]) catMonthMap[c] = {};
    catMonthMap[c][k] = (catMonthMap[c][k] || 0) + r.valor;
  });

  var realMonths = uniq(baseRows.map(function(r){ return monthKey(r.date); }).filter(Boolean));

  var catAvg = {};
  Object.keys(catMonthMap).forEach(function(cat) {
    var vals = Object.values(catMonthMap[cat]);
    catAvg[cat] = vals.reduce(function(s,v){return s+v;},0) / Math.max(realMonths.length, 1);
  });

  // Future months: from next month until Dec of current year
  var now = new Date();
  var curYear = now.getFullYear();
  var nextMo  = now.getMonth() + 2; // getMonth() is 0-based, so +1 = current, +2 = next
  var futureMonths = [];
  for (var mo = nextMo; mo <= 12; mo++) {
    futureMonths.push(curYear + '-' + String(mo).padStart(2, '0'));
  }

  // Real months with data this year (excluding jan/feb)
  var realMonthsYear = realMonths.filter(function(m){ return m.split('-')[0] === String(curYear); });

  return { months: futureMonths, catAvg: catAvg, realMonths: realMonths, realMonthsYear: realMonthsYear };
}

/* ─── Forecast Tab ─── */
function renderForecastTab(rows) {
  var fc = buildForecastToYearEnd(rows);
  var fcMonths = fc.months;
  var catAvg   = fc.catAvg;
  var cats = Object.keys(catAvg).filter(function(c){ return catAvg[c] > 0.5; }).sort(function(a,b){return catAvg[b]-catAvg[a];});

  // KPI cards
  var avgMonthly = cats.reduce(function(s,c){return s+catAvg[c];},0);
  var projTotal  = avgMonthly * fcMonths.length;
  var baseMonths = fc.realMonths.length;

  function card(lbl, val, sub) {
    return '<div class="card"><div class="cl">'+lbl+'</div><div class="cv sm">'+val+'</div>'+(sub?'<div class="cs">'+sub+'</div>':'')+' </div>';
  }
  $('fcCardsEl').innerHTML =
    card('M\xe9dia Mensal (base)', brl(avgMonthly), 'Ex. Jan/Fev &bull; ' + baseMonths + ' meses') +
    card('Meses Restantes', fcMonths.length, 'At\xe9 dez/' + new Date().getFullYear()) +
    card('Total Projetado', brl(projTotal), 'Jun a Dez') +
    card('Maior Categoria', cats[0]||'—', cats[0] ? brl(catAvg[cats[0]]) + '/m\xeas' : '');

  // Table: category x future months
  var html = '<thead><tr><th>Categoria</th>';
  fcMonths.forEach(function(m){ html += '<th>' + monthLabel(m) + '</th>'; });
  html += '<th>Total</th><th>M\xe9dia/m\xeas</th></tr></thead><tbody>';

  cats.forEach(function(cat) {
    html += '<tr><td>' + cat + '</td>';
    var rowTot = 0;
    fcMonths.forEach(function(m) {
      var v = catAvg[cat] || 0;
      rowTot += v;
      html += '<td class="fcast">' + (v > 0.5 ? brl(v) : '—') + '</td>';
    });
    html += '<td style="font-weight:600;color:#444">' + brl(rowTot) + '</td>';
    html += '<td style="color:#888">' + brl(catAvg[cat]||0) + '</td></tr>';
  });

  // Total row
  html += '<tr class="tot-row"><td>Total</td>';
  fcMonths.forEach(function() { html += '<td class="fcast">' + brl(avgMonthly) + '</td>'; });
  html += '<td>' + brl(projTotal) + '</td><td>' + brl(avgMonthly) + '</td></tr></tbody>';
  html += '<tfoot><tr><td colspan="' + (fcMonths.length + 3) + '" style="font-size:.65rem;color:#bbb;padding:6px 8px">* M\xe9dia calculada excluindo Janeiro e Fevereiro (meses atípicos)</td></tr></tfoot>';

  $('fcTable').innerHTML = html;

  // Chart: bar per category
  if (currentTab === 'previsao') {
    var colors = cats.map(function(c){ return catColor(c); });
    makeChart('chFc', {
      type: 'bar',
      data: {
        labels: cats,
        datasets: [{
          label: 'Média mensal prevista',
          data: cats.map(function(c){ return catAvg[c]||0; }),
          backgroundColor: colors.map(function(c){ return c+'bb'; }),
          borderRadius: 5
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx){ return brl(ctx.parsed.y) + '/mês'; } } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 }, color: '#888' } },
          y: { grid: { color: '#f0f0f0' }, ticks: { font: { family: 'Inter', size: 10 }, color: '#bbb', callback: function(v){ return 'R$' + v.toLocaleString('pt-BR'); } } }
        }
      }
    });
  }
}

/* ─── Main Tab ─── */
function renderMainTab(gRows, ganhoRows) {
  var tot  = total(gRows);
  var totG = total(ganhoRows);
  var saldo = totG - tot;
  var rate  = totG > 0 ? saldo / totG * 100 : 0;

  // ── Hero KPIs ──
  var gMap  = sumMonthly(allGastos);
  var gaMap = sumMonthly(allGanhos);
  var allK  = uniq(Object.keys(gMap).concat(Object.keys(gaMap))).sort();
  var lastK = allK[allK.length - 1];
  var prevK = allK.length > 1 ? allK[allK.length - 2] : null;
  var lastGasto = lastK ? (gMap[lastK] || 0) : 0;
  var prevGasto = prevK ? (gMap[prevK] || 0) : 0;
  var momDelta  = prevGasto > 0 ? (lastGasto - prevGasto) / prevGasto * 100 : 0;

  // bucket totals
  var buckTot = {Necessidade:0,Investimento:0,Lazer:0};
  allGastos.forEach(function(r){ var b=classifMap[r.cat]||'Necessidade'; buckTot[b]=(buckTot[b]||0)+r.valor; });
  var totAllG = total(allGastos);

  function hero(lbl, val, sub, badge, badgeCls, accentCls) {
    return '<div class="mhc '+(accentCls||'')+'">'+
      '<div class="mhc-lbl">'+lbl+'</div>'+
      '<div class="mhc-val">'+val+'</div>'+
      '<div class="mhc-sub">'+sub+(badge?'&nbsp;<span class="mhc-badge '+(badgeCls||'mb-n')+'">'+badge+'</span>':'')+' </div>'+
      '</div>';
  }
  document.getElementById('mHero').innerHTML =
    hero('Total Gastos (período)', brl(tot), allGastos.length+' lançamentos', '', '', '') +
    hero('Total Ganhos (período)', brl(totG), ganhoRows.length+' entradas', '', '', 'accent-green') +
    hero('Saldo do Período', brl(saldo), 'Ganhos − Gastos', saldo>=0?'▲ Positivo':'▼ Negativo', saldo>=0?'mb-g':'mb-r', saldo>=0?'accent-green':'accent-red') +
    hero('Taxa de Poupança', pct(Math.max(rate,0)), 'do total recebido', rate>=20?'Saudável':rate>=0?'Atenção':'Crítico', rate>=20?'mb-g':rate>=0?'mb-n':'mb-r', rate>=20?'accent-green':'accent-yellow') +
    hero('Último Mês', brl(lastGasto), lastK?monthLabel(lastK):'', momDelta>0?'▲ '+pct(Math.abs(momDelta),1):momDelta<0?'▼ '+pct(Math.abs(momDelta),1):'—', momDelta>0?'mb-r':'mb-g', '') +
    hero('Lazer+Compras', brl((buckTot.Lazer||0)), totAllG?pct((buckTot.Lazer||0)/totAllG*100)+' dos gastos':'', '', '', 'accent-yellow');

  // ── Ganhos vs Gastos chart ──
  if (currentTab === 'main') {
    var labels  = allK.map(monthLabel);
    var gData   = allK.map(function(k){ return gMap[k]||0; });
    var gaData  = allK.map(function(k){ return gaMap[k]||0; });
    var saldoD  = allK.map(function(k){ return (gaMap[k]||0)-(gMap[k]||0); });
    makeChart('chMain', {
      type: 'bar',
      data: { labels: labels, datasets: [
        { label:'Ganhos', data:gaData, backgroundColor:'rgba(21,128,61,.65)', borderRadius:5, order:2 },
        { label:'Gastos', data:gData,  backgroundColor:'rgba(232,93,4,.65)',  borderRadius:5, order:2 },
        { label:'Saldo',  data:saldoD, type:'line', borderColor:'#1D4ED8', borderWidth:2.5, pointRadius:4, pointBackgroundColor:'#1D4ED8', fill:false, tension:.3, order:1 }
      ]},
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:true,labels:{font:{family:'Inter',size:11},color:'#666',boxWidth:12}},
          tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+brl(c.parsed.y);}}} },
        scales:{ x:{grid:{display:false},ticks:{font:{family:'Inter',size:10},color:'#bbb'}},
          y:{grid:{color:'#f5f5f5'},ticks:{font:{family:'Inter',size:10},color:'#bbb',callback:function(v){return 'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v);}}} } }
    });

    // ── Classification donut ──
    var bVals = [buckTot.Necessidade||0, buckTot.Investimento||0, buckTot.Lazer||0];
    makeChart('chMainBucks', {
      type: 'doughnut',
      data: { labels:['Necessidade','Investimento','Lazer'], datasets:[{ data:bVals, backgroundColor:['rgba(29,78,216,.75)','rgba(21,128,61,.75)','rgba(194,65,12,.75)'], borderWidth:0, hoverOffset:6 }] },
      options: { responsive:true, maintainAspectRatio:true, cutout:'68%',
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:function(c){return c.label+': '+brl(c.parsed)+' ('+pct(totAllG?c.parsed/totAllG*100:0)+')';}}} } }
    });
  }

  // ── Classification bucket bars ──
  var bucksHTML = '';
  [{k:'Necessidade',color:'#1D4ED8'},{k:'Investimento',color:'#15803D'},{k:'Lazer',color:'#C2410C'}].forEach(function(b){
    var v = buckTot[b.k]||0, p = totAllG?v/totAllG*100:0;
    bucksHTML += '<div class="m-buck-row">'+
      '<div class="m-buck-dot" style="background:'+b.color+'"></div>'+
      '<span class="m-buck-name">'+b.k+'</span>'+
      '<div class="m-buck-bar-wrap"><div class="m-buck-bar" style="width:'+p.toFixed(1)+'%;background:'+b.color+'"></div></div>'+
      '<div class="m-buck-vals"><div class="m-buck-pct" style="color:'+b.color+'">'+pct(p,1)+'</div><div class="m-buck-val">'+brl(v)+'</div></div>'+
      '</div>';
  });
  document.getElementById('mBucks').innerHTML = bucksHTML;

  // ── Top 5 categorias ──
  var catPairs = sumBy(allGastos, 'cat').slice(0, 7);
  var maxCat   = catPairs[0] ? catPairs[0][1] : 1;
  var mCatEl = document.getElementById('mCats');
  mCatEl.innerHTML = '';
  catPairs.forEach(function(pair, i) {
    var v = pair[1], p = totAllG ? v/totAllG*100 : 0;
    var row = document.createElement('div'); row.className = 'm-cat-row';
    row.innerHTML = '<span class="m-cat-rank">'+(i+1)+'</span>'+
      '<span class="m-cat-name" title="'+pair[0]+'">'+pair[0]+'</span>'+
      '<div class="m-cat-bar-wrap"><div class="m-cat-bar" style="width:'+((v/maxCat)*100).toFixed(1)+'%;background:'+catColor(pair[0])+'"></div></div>'+
      '<span class="m-cat-val">'+brl(v)+'</span>'+
      '<span class="m-cat-pct">'+pct(p,1)+'</span>';
    mCatEl.appendChild(row);
  });
  var mMonth = document.getElementById('mCatMonth');
  if (mMonth) mMonth.textContent = 'acumulado';

  // ── Savings per month ──
  var savEl = document.getElementById('mSav'); savEl.innerHTML = '';
  var savKeys = allK.slice(-6); // last 6 months
  savKeys.forEach(function(k) {
    var g=gaMap[k]||0, e=gMap[k]||0, s=g-e, sp=g>0?s/g*100:0;
    var color = sp>=20?'#15803D':sp>=0?'#EF9F27':'#E85D04';
    var row = document.createElement('div'); row.className = 'm-sav-row';
    row.innerHTML = '<span class="m-sav-lbl">'+monthLabel(k)+'</span>'+
      '<div class="m-sav-track"><div class="m-sav-fill" style="width:'+Math.min(Math.max(sp,0),100).toFixed(1)+'%;background:'+color+'"></div></div>'+
      '<span class="m-sav-val" style="color:'+color+'">'+brl(s)+'</span>'+
      '<span class="m-sav-pct"><span class="mhc-badge '+(sp>=20?'mb-g':sp>=0?'mb-n':'mb-r')+'">'+pct(sp,0)+'</span></span>';
    savEl.appendChild(row);
  });

  // ── Forecast next months ──
  var fcData = buildForecastToYearEnd(allGastos);
  var fcEl = document.getElementById('mFc'); fcEl.innerHTML = '';
  fcData.months.slice(0, 4).forEach(function(m) {
    var avg = Object.values(fcData.catAvg).reduce(function(s,v){return s+v;},0);
    var row = document.createElement('div'); row.className = 'm-fc-row';
    row.innerHTML = '<span class="m-fc-month">'+monthLabel(m)+'</span>'+
      '<span class="m-fc-val">'+brl(avg)+'</span>'+
      '<span class="m-fc-diff">prev.</span>';
    fcEl.appendChild(row);
  });
  if (!fcData.months.length) fcEl.innerHTML = '<div style="font-size:.75rem;color:#ccc;padding:8px 0">Ano encerrado</div>';

  // ── Investment teaser (milestone years) ──
  var investBase = allGastos.filter(function(r){
    if(!r.date) return false;
    var mo = r.date.getMonth()+1;
    return mo!==1&&mo!==2&&(r.cat||'').toLowerCase().indexOf('invest')!==-1;
  });
  var invMonths = uniq(investBase.map(function(r){return monthKey(r.date);}).filter(Boolean));
  var avgAporte = invMonths.length > 0 ? total(investBase)/invMonths.length : 500;
  var invEl = document.getElementById('mInv'); invEl.innerHTML = '';
  [2,5,10].forEach(function(anos) {
    var r2 = 0, taxa = 0.009;
    for (var t=1;t<=anos*12;t++) r2 = r2*(1+taxa)+avgAporte;
    var invested = avgAporte*anos*12;
    var row = document.createElement('div'); row.className = 'm-inv-yr';
    row.innerHTML = '<span class="m-inv-label">Em '+anos+' ano'+(anos>1?'s':'')+'</span>'+
      '<div style="text-align:right"><div class="m-inv-pat">'+brl(r2)+'</div>'+
      '<div class="m-inv-mult">'+brl(invested)+' invest. · '+(r2/invested).toFixed(2).replace('.',',')+'x</div></div>';
    invEl.appendChild(row);
  });
}

/* ─── Invest Tab ─── */
function calcInvest(aporte, taxaMes, anos, patrimonioInicial) {
  var meses = anos * 12;
  var r = taxaMes / 100;
  var pv = patrimonioInicial || 0;
  var rows = [];
  var patrimonio = pv;
  for (var t = 1; t <= meses; t++) {
    patrimonio = patrimonio * (1 + r) + aporte;
    if (t % 12 === 0) {
      var ano = t / 12;
      var totalAportado = aporte * t;           // only new contributions
      var jurosTotal = patrimonio - pv - totalAportado; // interest on everything
      rows.push({ ano: ano, patrimonio: patrimonio, totalInvestido: totalAportado, juros: jurosTotal, patrimonioInicial: pv });
    }
  }
  return rows;
}

function renderInvestTab(gastoRows) {
  // Compute average monthly investment from data (excluding Jan/Feb)
  var investRows = gastoRows.filter(function(r) {
    if (!r.date) return false;
    var mo = r.date.getMonth() + 1;
    return mo !== 1 && mo !== 2 && (r.cat || '').toLowerCase().indexOf('invest') !== -1;
  });
  var investMonths = uniq(investRows.map(function(r){ return monthKey(r.date); }).filter(Boolean));
  var mediaInvest = investMonths.length > 0
    ? total(investRows) / investMonths.length
    : 500;
  mediaInvest = Math.round(mediaInvest / 50) * 50; // round to nearest 50

  // Elements
  var slAp  = document.getElementById('slAporte');
  var slTx  = document.getElementById('slTaxa');
  var slAn  = document.getElementById('slAnos');
  var chkPat = document.getElementById('chkPat');
  var patInputs = document.getElementById('patInputs');
  var patNote   = document.getElementById('patNote');
  var patGEl    = document.getElementById('patG');
  var patGiEl   = document.getElementById('patGi');
  var patTotalEl= document.getElementById('patTotal');
  if (!slAp) return;

  // Set slider defaults from real data (only on first render)
  if (!slAp.dataset.init) {
    slAp.value = Math.min(Math.max(mediaInvest, 100), 5000);
    slTx.value = 0.9;
    slAn.value = 10;
    slAp.dataset.init = '1';

    // Auto-fill patrimônio guardado from sheet
    if (guardadoData && Object.keys(guardadoData).length > 0) {
      // Match Gui/Guilherme and Giulia by partial name (case-insensitive)
      var keys = Object.keys(guardadoData);
      var guiKey  = keys.filter(function(k){ var kl=lo(k); return kl.indexOf('gui')!==-1 && kl.indexOf('giulia')===-1; })[0];
      var giulKey = keys.filter(function(k){ return lo(k).indexOf('giulia')!==-1; })[0];
      if (guiKey)  { patGEl.value  = guardadoData[guiKey].toFixed(2); }
      if (giulKey) { patGiEl.value = guardadoData[giulKey].toFixed(2); }
      if (guiKey || giulKey) {
        chkPat.checked = true;
        updatePatVis();
        updatePatTotal();
      }
    }
  }

  // Toggle patrimônio visibility
  function updatePatVis() {
    var show = chkPat.checked;
    patInputs.style.display = show ? 'flex' : 'none';
    patNote.style.display   = show ? 'block' : 'none';
  }
  chkPat.onchange = function() { updatePatVis(); refresh(); };

  function getPatTotal() {
    if (!chkPat.checked) return 0;
    var g  = parseFloat(patGEl.value)  || 0;
    var gi = parseFloat(patGiEl.value) || 0;
    return g + gi;
  }
  function updatePatTotal() {
    patTotalEl.textContent = brl(getPatTotal());
  }
  patGEl.oninput = patGiEl.oninput = function() { updatePatTotal(); refresh(); };
  updatePatVis();

  function refresh() {
    var aporte = parseFloat(slAp.value);
    var taxa   = parseFloat(slTx.value);
    var anos   = parseInt(slAn.value, 10);
    var pv     = getPatTotal();

    document.getElementById('svAporte').textContent = brl(aporte);
    document.getElementById('svTaxa').textContent   = taxa.toFixed(2).replace('.', ',') + '%';
    document.getElementById('svAnos').textContent   = anos + ' ano' + (anos > 1 ? 's' : '');

    var rows10 = calcInvest(aporte, taxa, anos, pv);
    if (!rows10.length) return;
    var final = rows10[rows10.length - 1];
    var taxaAnual = (Math.pow(1 + taxa/100, 12) - 1) * 100;
    var totalCapital = pv + final.totalInvestido; // initial + new contributions

    // KPI cards
    var pvCard = pv > 0
      ? '<div class="inv-card hi"><div class="cl">Patrimônio Inicial</div><div class="cv">'+brl(pv)+'</div><div class="cs">Saldo já guardado incluído</div></div>'
      : '';
    document.getElementById('invKpis').innerHTML =
      '<div class="inv-card"><div class="cl">Aporte Mensal</div><div class="cv">'+brl(aporte)+'</div><div class="cs">Histórico: '+brl(mediaInvest)+'/mês</div></div>'+
      '<div class="inv-card"><div class="cl">Taxa Anual Equiv.</div><div class="cv">'+taxaAnual.toFixed(2).replace('.',',')+'% a.a.</div><div class="cs">'+taxa.toFixed(2).replace('.',',')+'% a.m.</div></div>'+
      pvCard+
      '<div class="inv-card hi"><div class="cl">Patrimônio em '+anos+' ano'+(anos>1?'s':'')+'</div><div class="cv">'+brl(final.patrimonio)+'</div><div class="cs">'+brl(totalCapital)+' aportados</div></div>'+
      '<div class="inv-card hi"><div class="cl">Juros Acumulados</div><div class="cv">'+brl(final.juros)+'</div><div class="cs">'+pct(final.juros/final.patrimonio*100,1)+' do patrimônio</div></div>'+
      '<div class="inv-card"><div class="cl">Multiplicador</div><div class="cv">'+(final.patrimonio/Math.max(totalCapital,1)).toFixed(2).replace('.',',')+'x</div><div class="cs">Retorno sobre capital total</div></div>';

    // Year table
    var tbl = '<thead><tr>'+
      '<th>Ano</th>'+(pv>0?'<th>Pat. Inicial</th>':'')+
      '<th>Aportes Acum.</th><th>Juros Acum.</th><th>Patrimônio</th><th>Rendim. Anual</th><th>% Juros</th>'+
      '</tr></thead><tbody>';
    rows10.forEach(function(r, i) {
      var prevPat = i > 0 ? rows10[i-1].patrimonio : pv;
      var rendAnual = r.patrimonio - prevPat - aporte * 12;
      var cls = r.ano % 2 === 0 ? ' yr-hi' : '';
      tbl += '<tr class="'+cls+'">'+
        '<td>Ano '+r.ano+' ('+(new Date().getFullYear()+r.ano)+')</td>'+
        (pv>0?'<td style="color:#15803D">'+brl(pv)+'</td>':'')+
        '<td>'+brl(r.totalInvestido)+'</td>'+
        '<td style="color:#15803D">'+brl(r.juros)+'</td>'+
        '<td style="font-weight:700">'+brl(r.patrimonio)+'</td>'+
        '<td style="color:#15803D">'+brl(Math.max(rendAnual,0))+'</td>'+
        '<td>'+pct(r.juros/r.patrimonio*100,1)+'</td>'+
        '</tr>';
    });
    tbl += '</tbody>';
    document.getElementById('invYrTable').innerHTML = tbl;

    // Note
    document.getElementById('invNote').innerHTML =
      '&#128161; Juros compostos: '+brl(aporte)+'/mês a '+taxa.toFixed(2).replace('.',',')+'% a.m. ('+taxaAnual.toFixed(2).replace('.',',')+'% a.a.) por '+anos+' ano'+(anos>1?'s':'')+
      (pv>0?' &bull; Patrimônio inicial de <strong>'+brl(pv)+'</strong> ('+brl(parseFloat(patGEl.value)||0)+' + '+brl(parseFloat(patGiEl.value)||0)+') incluído na simulação.':'')+
      ' &bull; Média histórica aportada: <strong>'+brl(mediaInvest)+'/mês</strong>.';

    // Chart
    if (currentTab === 'invest') {
      var allMonths = [], patData = [], invData = [], jurData = [];
      var r2 = pv;
      for (var t = 1; t <= anos * 12; t++) {
        r2 = r2 * (1 + taxa/100) + aporte;
        if (t % 3 === 0 || t === 1) {
          var lbl = 'Mês ' + t;
          if (t % 12 === 0) lbl = 'Ano ' + (t/12);
          allMonths.push(lbl);
          patData.push(parseFloat(r2.toFixed(2)));
          invData.push(pv + aporte * t);
          jurData.push(parseFloat((r2 - pv - aporte*t).toFixed(2)));
        }
      }
      makeChart('chInvest', {
        type: 'line',
        data: { labels: allMonths, datasets: [
          { label:'Patrimônio Total',  data:patData, borderColor:'#15803D', borderWidth:2.5, pointRadius:0, fill:true, backgroundColor:'rgba(21,128,61,.08)', tension:.4 },
          { label:'Capital Investido', data:invData, borderColor:'#1D4ED8', borderWidth:2,   pointRadius:0, fill:true, backgroundColor:'rgba(29,78,216,.05)', tension:.4, borderDash:[4,3] },
          { label:'Juros Acumulados',  data:jurData, borderColor:'#EF9F27', borderWidth:1.5, pointRadius:0, fill:false, tension:.4, borderDash:[2,2] }
        ]},
        options: { responsive:true, maintainAspectRatio:false,
          plugins:{ legend:{display:true,labels:{font:{family:'Inter',size:11},color:'#666',boxWidth:14}},
            tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+brl(c.parsed.y);}}} },
          scales:{ x:{grid:{display:false},ticks:{font:{family:'Inter',size:9},color:'#bbb',maxTicksLimit:12}},
            y:{grid:{color:'#f0f0f0'},ticks:{font:{family:'Inter',size:10},color:'#bbb',callback:function(v){return 'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v);}}} } }
      });
    }
  }

  slAp.oninput = slTx.oninput = slAn.oninput = refresh;
  refresh();
}

/* ─── Parse Dinheiro Guardado sheet ─── */
function parseGuardado(text) {
  if (!text) return {};
  var r = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (!r.data || !r.data.length) return {};
  var h = Object.keys(r.data[0]);
  var cResp = findCol(h, ['responsav','resp','pessoa','nome']);
  var cVal  = findCol(h, ['guardado','valor','value','saldo','total']);
  if (!cResp || !cVal) return {};
  var result = {};
  r.data.forEach(function(row) {
    var name = String(row[cResp] || '').trim();
    var val  = parseMoney(row[cVal]);
    if (name && val > 0) result[name] = val;
  });
  return result;
}

/* ─── Parse sheet ─── */
function parseSheet(text) {
  var r = Papa.parse(text, {header: true, skipEmptyLines: true});
  if (!r.data || !r.data.length) return [];
  var h = Object.keys(r.data[0]);
  var cDate  = findCol(h, ['data','date','dia']);
  var cVal   = findCol(h, ['valor','value','quantia','total','r$']);
  var cDesc  = findCol(h, ['descri','desc','nome','item','gasto']);
  var cCat   = findCol(h, ['categ','cat','grupo']);
  var cTipo  = findCol(h, ['tipo','type','natureza','forma']);
  var cResp  = findCol(h, ['responsav','resp','pessoa','quem']);
  return r.data.map(function(row) {
    return {
      rawDate: cDate ? row[cDate] : '',
      date:    cDate ? parseDate(row[cDate]) : null,
      desc:    cDesc ? (row[cDesc] || '') : '',
      cat:     cCat  ? (row[cCat]  || '') : '',
      tipo:    cTipo ? (row[cTipo] || '') : '',
      resp:    cResp ? (row[cResp] || '') : '',
      valor:   cVal  ? parseMoney(row[cVal]) : 0,
      forecast: false
    };
  }).filter(function(r){ return r.valor > 0; });
}

/* ─── State ─── */
var allGastos = [], allGanhos = [], guardadoData = {}, classifMap = {}, chartMap = {};
var currentTab = 'main';

/* ─── DOM ─── */
var statusEl = $('statusEl'), appEl = $('appEl'), btnR = $('btnR'), tsEl = $('ts');
var fMes = $('fMes'), fResp = $('fResp'), fTipo = $('fTipo'), fCat = $('fCat');

/* ─── Tabs ─── */
document.querySelectorAll('.tab').forEach(function(t) {
  t.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(x){ x.classList.remove('on'); });
    t.classList.add('on');
    currentTab = t.dataset.t;
    var panels = {main:'panelMain',gastos:'panelGastos',ganhos:'panelGanhos',cross:'panelCross',classif:'panelClassif',previsao:'panelPrevisao',invest:'panelInvest',simulacao:'panelSimulacao',lancar:'panelLancar',tabela:'panelTabela'};
    Object.keys(panels).forEach(function(k){
      var el = $(panels[k]);
      if (el) el.style.display = (k === currentTab ? 'block' : 'none');
    });
    setTimeout(renderCharts, 60);
  });
});

function setLoading(v) {
  btnR.disabled = v;
  btnR.classList.toggle('ld', v);
}

function showError(msg) {
  statusEl.textContent = msg;
  statusEl.className = 'err';
  statusEl.style.display = '';
  appEl.style.display = 'none';
  setLoading(false);
}

/* ─── Load ─── */
function loadData() {
  setLoading(true);
  statusEl.textContent = 'Carregando dados…';
  statusEl.className = '';
  statusEl.style.display = '';
  appEl.style.display = 'none';

  var cb = Date.now();
  Promise.all([
    fetch(URL_GASTOS   + '&cachebust=' + cb).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); }),
    fetch(URL_GANHOS   + '&cachebust=' + cb).then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.text(); }),
    fetch(URL_GUARDADO + '&cachebust=' + cb).then(function(r){ return r.ok ? r.text() : ''; }).catch(function(){ return ''; })
  ]).then(function(results) {
    allGastos = parseSheet(results[0]);
    allGanhos = parseSheet(results[1]);
    guardadoData = parseGuardado(results[2]);
    if (!allGastos.length && !allGanhos.length) { showError('Nenhum dado encontrado.'); return; }

    var cats = uniq(allGastos.map(function(r){ return r.cat; }).filter(Boolean));
    classifMap = loadClassif(cats);

    populateFilters();
    var now = new Date();
    tsEl.textContent = 'Atualizado \xe0s ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
    statusEl.style.display = 'none';
    appEl.style.display = 'block';
    renderAll();
    setLoading(false);
  }).catch(function(e) {
    console.error('Dashboard error:', e);
    showError('Erro ao carregar: ' + (e.message || String(e)));
  });
}

/* ─── Classification persistence ─── */
function loadClassif(cats) {
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch(e) {}
  var result = {};
  cats.forEach(function(c) { result[c] = saved[c] || DEFAULT_CLASSIF[c] || 'Necessidade'; });
  return result;
}
function saveClassif(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch(e) {}
}

/* ─── Filters ─── */
function populateFilters() {
  var sm = fMes.value, sr = fResp.value, st = fTipo.value, sc = fCat.value;
  function fill(sel, vals, blank) {
    sel.innerHTML = '<option value="">' + blank + '</option>';
    vals.forEach(function(v) { var o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  }
  fill(fMes,  uniq(allGastos.map(function(r){ return monthKey(r.date); }).filter(Boolean)), 'Todos');
  fill(fResp, uniq(allGastos.map(function(r){ return r.resp; }).filter(Boolean)), 'Todos');
  fill(fTipo, uniq(allGastos.map(function(r){ return r.tipo; }).filter(Boolean)), 'Todas');
  fill(fCat,  uniq(allGastos.map(function(r){ return r.cat; }).filter(Boolean)), 'Todas');
  function restore(sel, v) { var os = Array.prototype.slice.call(sel.options); if (os.some(function(o){ return o.value===v; })) sel.value = v; }
  restore(fMes, sm); restore(fResp, sr); restore(fTipo, st); restore(fCat, sc);
}

function filtGastos(skipMonth) {
  return allGastos.filter(function(r) {
    if (!skipMonth && fMes.value && monthKey(r.date) !== fMes.value) return false;
    if (fResp.value && r.resp !== fResp.value) return false;
    if (fTipo.value && r.tipo !== fTipo.value) return false;
    if (fCat.value  && r.cat  !== fCat.value)  return false;
    return true;
  });
}
function filtGanhos(skipMonth) {
  return allGanhos.filter(function(r) {
    if (!skipMonth && fMes.value && monthKey(r.date) !== fMes.value) return false;
    if (fResp.value && r.resp !== fResp.value) return false;
    return true;
  });
}

/* ─── Main render ─── */
function renderAll() {
  var rows  = filtGastos();
  var gRows = filtGanhos();
  var tot   = total(rows);
  var totG  = total(gRows);
  renderCards(rows, gRows, tot, totG);
  renderMainTab(filtGastos(true), filtGanhos(true));
  renderGastosTab(rows, tot);
  renderGanhosTab(gRows, totG);
  renderCrossTab(rows, gRows, tot, totG);
  renderClassifTab(rows);
  renderForecastTab(filtGastos(true));
  renderInvestTab(filtGastos(true));
  renderTable(rows, tot);
  renderCharts();
}

/* ─── Cards ─── */
function renderCards(rows, gRows, tot, totG) {
  var saldo = totG - tot;
  var rate  = totG > 0 ? saldo / totG * 100 : 0;
  var cred=0, deb=0;
  rows.forEach(function(r){ var t=lo(r.tipo); if(t.indexOf('cred')!==-1) cred+=r.valor; else if(t.indexOf('deb')!==-1) deb+=r.valor; });

  function card(lbl, val, sub, tc, tt) {
    return '<div class="card"><div class="cl">'+lbl+'</div><div class="cv">'+val+'</div>'+(sub?'<div class="cs">'+sub+'</div>':'')+(tc?'<span class="tg '+tc+'">'+tt+'</span>':'')+' </div>';
  }
  $('cardsEl').innerHTML =
    card('Total Gastos',  brl(tot),  rows.length+' lançamentos', '', '') +
    card('Total Ganhos',  brl(totG), gRows.length+' entradas',   '', '') +
    card('Saldo do Per\xedodo', brl(saldo), 'Ganhos − Gastos', saldo>=0?'tgg':'trr', saldo>=0?'▲ Positivo':'▼ Negativo') +
    card('Poupan\xe7a', pct(Math.max(rate,0)), 'do total recebido', rate>=20?'tgg':rate>=0?'tnn':'trr', rate>=20?'Saud\xe1vel ≥20%':rate>=0?'Aten\xe7\xe3o':'Negativo') +
    card('Cr\xe9dito', brl(cred), tot?pct(cred/tot*100)+' dos gastos':'', 'tbb', '') +
    card('D\xe9bito',  brl(deb),  tot?pct(deb/tot*100)+' dos gastos':'', 'tnn', '');
}

/* ─── Gastos Tab ─── */
function renderGastosTab(rows, tot) {
  renderPctBars('catPct',  sumBy(rows,'cat'),  tot, 8, catColor);
  renderPctBars('tipoPct', sumBy(rows,'tipo'), tot, 10, function(n){
    var t=lo(n); if(t.indexOf('cred')!==-1) return '#378ADD'; if(t.indexOf('deb')!==-1) return '#EF9F27'; if(t.indexOf('tick')!==-1) return '#1D9E75'; return '#888';
  });
  renderRespBar('respBar','respLeg', sumBy(rows,'resp'), tot);

  // Monthly comparison (all months, filters except month)
  var baseRows = filtGastos(true);
  renderMCmp('mcmpGastos', baseRows, '#E85D04', true);

  // Category × Month matrix with forecast
  renderCatMonthTable(baseRows);
}

/* ─── Category × Month matrix ─── */
function renderCatMonthTable(realRows, targetId) {
  targetId = targetId || 'catMonthTable';
  var FORECAST_MONTHS = 3;
  var fc      = buildForecast(realRows, FORECAST_MONTHS);
  var fcMonths = fc.months || [];
  var fcAvg    = fc.catAvg || {};

  var cats   = uniq(realRows.map(function(r){ return r.cat; }).filter(Boolean));
  var realMs = uniq(realRows.map(function(r){ return monthKey(r.date); }).filter(Boolean)).sort();
  var allMs  = realMs.concat(fcMonths);
  var fcSet  = {}; fcMonths.forEach(function(m){ fcSet[m]=true; });

  // vmap: {cat: {month: total}}
  var vmap = {};
  realRows.forEach(function(r) {
    var c=r.cat||'Outros', m=monthKey(r.date); if(!m) return;
    if(!vmap[c]) vmap[c]={};
    vmap[c][m] = (vmap[c][m]||0) + r.valor;
  });

  // descMap: {cat: {desc: {month: [rows]}}}
  var descMap = {};
  realRows.forEach(function(r) {
    var c=r.cat||'Outros', d=r.desc||'Sem descrição', m=monthKey(r.date); if(!m) return;
    if(!descMap[c]) descMap[c]={};
    if(!descMap[c][d]) descMap[c][d]={};
    if(!descMap[c][d][m]) descMap[c][d][m]=[];
    descMap[c][d][m].push(r);
  });

  var mTot = {};
  allMs.forEach(function(m){ mTot[m]=cats.reduce(function(s,c){return s+(vmap[c]&&vmap[c][m]||0);},0); });
  fcMonths.forEach(function(m){ mTot[m]=Object.keys(fcAvg).reduce(function(s,c){return s+(fcAvg[c]||0);},0); });

  // Show/update toolbar
  var ovrCount = fcOverrideCount();
  var toolbar = $('fcToolbar');
  if (toolbar) {
    toolbar.style.display = '';
    var ovrEl = $('fcOvrCount');
    if (ovrEl) ovrEl.textContent = ovrCount > 0 ? ovrCount + ' valor(es) personalizado(s)' : 'Nenhuma edição ainda';
  }

  var colSpan = allMs.length + 2;
  var html = '<thead><tr><th style="min-width:160px">Categoria / Descri\xe7\xe3o</th>';
  allMs.forEach(function(m){ html+='<th'+(fcSet[m]?' style="color:#bbb;font-style:italic"':'')+'>'+(fcSet[m]?'&#9997; ':'')+monthLabel(m)+'</th>'; });
  html += '<th>Total/M\xe9dia</th></tr></thead><tbody>';

  // hint row
  html += '<tr class="hint-row"><td colspan="'+colSpan+'">&#9654; Clique numa categoria para ver descri\xe7\xf5es &bull; &#9997; Clique em valores futuros (it\xe1lico) para editar a previs\xe3o</td></tr>';

  cats.forEach(function(cat, ci) {
    var catId = 'cat-'+ci;
    var catTot = 0;
    allMs.forEach(function(m){ if(!fcSet[m]) catTot+=(vmap[cat]&&vmap[cat][m]||0); });
    var catAvg = realMs.length ? catTot/realMs.length : 0;

    // ── Level 1: Category row ──
    html += '<tr class="cat-row" data-cat="'+catId+'">';
    html += '<td><span class="cat-arrow">&#9654;</span><strong>'+cat+'</strong></td>';
    allMs.forEach(function(m){
      if (fcSet[m]) {
        // Editable forecast cell
        var override = fcGet('cat', cat, m);
        var autoVal  = fcAvg[cat]||0;
        var dispVal  = override !== undefined ? override : autoVal;
        var isOvr    = override !== undefined;
        html += '<td class="fcast fc-edit'+(isOvr?' overridden':'')+'" '+
          'data-fc-level="cat" data-fc-name="'+cat.replace(/"/g,'&quot;')+'" data-fc-month="'+m+'" '+
          'data-fc-auto="'+autoVal.toFixed(2)+'">'+
          (dispVal>0?brl(dispVal):'—')+'</td>';
      } else {
        var v = vmap[cat]&&vmap[cat][m]||0;
        html+='<td>'+(v>0?brl(v):'—')+'</td>';
      }
    });
    html+='<td style="font-weight:600">'+(catAvg>0?brl(catAvg):'—')+'</td></tr>';

    // ── Level 2: Description group rows ──
    var descs = Object.keys(descMap[cat]||{});
    // sort descs by total value desc
    descs.sort(function(a,b){
      var ta=Object.values(descMap[cat][a]).reduce(function(s,arr){return s+arr.reduce(function(ss,r){return ss+r.valor;},0);},0);
      var tb=Object.values(descMap[cat][b]).reduce(function(s,arr){return s+arr.reduce(function(ss,r){return ss+r.valor;},0);},0);
      return tb-ta;
    });

    descs.forEach(function(desc, di) {
      var descId = catId+'-d'+di;
      var descTot = 0;
      var descCnt = 0;

      // per-month totals for this desc
      var descMonthTot = {};
      realMs.forEach(function(m){
        var entries = descMap[cat][desc][m]||[];
        var mv = entries.reduce(function(s,r){return s+r.valor;},0);
        if(mv>0){ descMonthTot[m]=mv; descTot+=mv; descCnt+=entries.length; }
      });
      if(!descTot) return;

      var descAvg = realMs.length ? descTot/realMs.length : 0;
      var pctOfCat = catTot ? (descTot/catTot*100).toFixed(0)+'%' : '';

      // desc group row
      html += '<tr class="desc-row" data-parent="'+catId+'" data-desc="'+descId+'">';
      html += '<td><span class="desc-arrow">&#9654;</span>'+desc+
              '<span class="desc-badge">'+descCnt+'×</span>'+
              '<span style="font-size:.63rem;color:#bbb;margin-left:6px">'+pctOfCat+' da cat.</span></td>';
      allMs.forEach(function(m){
        if (fcSet[m]) {
          var override = fcGet('desc', cat+'|'+desc, m);
          var autoVal  = 0; // desc-level default = 0 (manual only)
          var dispVal  = override !== undefined ? override : autoVal;
          var isOvr    = override !== undefined;
          html += '<td class="fcast fc-edit'+(isOvr?' overridden':'')+'" style="font-size:.73rem" '+
            'data-fc-level="desc" data-fc-name="'+(cat+'|'+desc).replace(/"/g,'&quot;')+'" data-fc-month="'+m+'" '+
            'data-fc-auto="0">'+
            (dispVal>0?'<span style="color:#92400E">'+brl(dispVal)+'</span>':'<span style="color:#ddd;font-size:.65rem">+ adicionar</span>')+'</td>';
        } else {
          var v = descMonthTot[m]||0;
          html+='<td style="font-size:.73rem">'+(v>0?'<span style="color:#555">'+brl(v)+'</span>':'—')+'</td>';
        }
      });
      html+='<td style="font-size:.72rem;color:#888">'+brl(descAvg)+'</td></tr>';

      // ── Level 3: Individual entries ──
      realMs.forEach(function(m){
        var entries = descMap[cat][desc][m]||[];
        if(!entries.length) return;
        var mTotal = entries.reduce(function(s,r){return s+r.valor;},0);
        var sorted = entries.slice().sort(function(a,b){return b.valor-a.valor;});

        sorted.forEach(function(r,ei){
          var entryId = descId+'-m'+m+'-e'+ei;
          var ds = r.date?r.date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}):'';
          var pv = mTotal?(r.valor/mTotal*100).toFixed(0)+'%':'';
          html+='<tr class="entry-row" data-parent="'+descId+'">';
          html+='<td>'+
            '<span style="color:#bbb;font-size:.66rem;min-width:34px;display:inline-block">'+ds+'</span>'+
            (r.resp?'<span style="font-size:.63rem;background:#f0f0f0;border-radius:8px;padding:1px 6px;margin-right:4px">'+r.resp+'</span>':'')+
            (r.desc||'—')+
            '</td>';
          allMs.forEach(function(col){
            html+=col===m?'<td style="color:#444;font-size:.71rem">'+brl(r.valor)+'<span class="esub"> '+pv+'</span></td>':'<td></td>';
          });
          html+='<td style="font-size:.68rem;color:#bbb">'+(r.tipo||'')+'</td></tr>';
        });

        // sub-total if multiple entries
        if(sorted.length>1){
          html+='<tr class="entry-row desc-tot" data-parent="'+descId+'">';
          html+='<td style="padding-left:46px;font-size:.7rem">Subtotal '+monthLabel(m)+'</td>';
          allMs.forEach(function(col){ html+=col===m?'<td>'+brl(mTotal)+'</td>':'<td></td>'; });
          html+='<td></td></tr>';
        }
      });
    });
  });

  // Total row
  html+='<tr class="tot-row"><td>Total Geral</td>';
  allMs.forEach(function(m){ html+='<td class="'+(fcSet[m]?'fcast':'')+'">'+brl(mTot[m]||0)+'</td>'; });
  var avgTot=realMs.length?total(realRows)/realMs.length:0;
  html+='<td>'+brl(avgTot)+'</td></tr></tbody>';
  if(fcMonths.length) html+='<tfoot><tr><td colspan="'+colSpan+'" style="font-size:.65rem;color:#bbb;padding:6px 8px">* Previs\xe3o baseada na m\xe9dia hist\xf3rica &bull; '+colSpan+' colunas</td></tr></tfoot>';

  var tbl = $(targetId);
  tbl.innerHTML = html;

  // ── Level 1: Category click ──
  tbl.querySelectorAll('.cat-row').forEach(function(row){
    row.addEventListener('click', function(){
      var id=row.dataset.cat, opening=!row.classList.contains('open');
      row.classList.toggle('open', opening);
      // show/hide level-2 desc rows (but NOT level-3 entries)
      tbl.querySelectorAll('.desc-row[data-parent="'+id+'"]').forEach(function(dr){
        dr.classList.toggle('vis', opening);
        if(!opening){ dr.classList.remove('open'); }
      });
      // collapse all level-3 when closing
      if(!opening){
        tbl.querySelectorAll('.entry-row').forEach(function(er){
          var pid=er.dataset.parent||'';
          if(pid.indexOf(id)===0) er.classList.remove('vis');
        });
      }
    });
  });

  // ── Level 2: Description click ──
  tbl.querySelectorAll('.desc-row').forEach(function(row){
    row.addEventListener('click', function(e){
      e.stopPropagation();
      var id=row.dataset.desc, opening=!row.classList.contains('open');
      row.classList.toggle('open', opening);
      tbl.querySelectorAll('.entry-row[data-parent="'+id+'"]').forEach(function(er){
        er.classList.toggle('vis', opening);
      });
    });
  });

  // ── Editable forecast cells ──
  tbl.querySelectorAll('.fc-edit').forEach(function(cell){
    cell.addEventListener('click', function(e){
      e.stopPropagation();
      if (cell.querySelector('.fc-inp')) return; // already editing
      var level = cell.dataset.fcLevel;
      var name  = cell.dataset.fcName;
      var month = cell.dataset.fcMonth;
      var auto  = parseFloat(cell.dataset.fcAuto)||0;
      var cur   = fcGet(level, name, month);
      var curVal= cur !== undefined ? cur : auto;

      // Replace cell content with input
      cell.innerHTML = '<div class="fc-input-wrap"><input class="fc-inp" type="number" min="0" step="10" value="'+(curVal>0?curVal.toFixed(2):'')+'"/></div>';
      var inp = cell.querySelector('.fc-inp');
      inp.focus(); inp.select();

      function commit() {
        var raw = parseFloat(inp.value);
        if (!isNaN(raw) && raw >= 0) {
          fcSet(level, name, month, raw);
        } else if (inp.value === '' || inp.value === '0') {
          fcSet(level, name, month, null); // reset to auto
        }
        // Re-render only the table (not full page)
        renderCatMonthTable(filtGastos(true));
      }
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', function(ev){
        if (ev.key==='Enter') { inp.blur(); }
        if (ev.key==='Escape') { fcSet(level, name, month, null); renderCatMonthTable(filtGastos(true)); }
      });
    });
  });
}

/* ─── Ganhos Tab ─── */
function renderGanhosTab(gRows, totG) {
  renderPctBars('gCatPct',  sumBy(gRows,'cat'),  totG, 10, catColor);
  renderRespBar('gRespBar','gRespLeg', sumBy(gRows,'resp'), totG);
  renderMCmp('mcmpGanhos', filtGanhos(true), '#1D9E75', false);
  renderGanhoMatrix();
}

function renderGanhoMatrix() {
  var FORECAST_MONTHS = 3;
  var realRows = filtGanhos(true);
  var fc = buildGanhoForecast(realRows, FORECAST_MONTHS);

  var cats   = uniq(realRows.map(function(r){ return r.cat; }).filter(Boolean));
  var realMs = uniq(realRows.map(function(r){ return monthKey(r.date); }).filter(Boolean)).sort();
  var fcMs   = fc.months || [];
  var allMs  = realMs.concat(fcMs);
  var fcSet  = {}; fcMs.forEach(function(m){ fcSet[m]=true; });

  var vmap = {};
  realRows.forEach(function(r) {
    var c = r.cat||'Outros', m = monthKey(r.date); if(!m) return;
    if(!vmap[c]) vmap[c] = {};
    vmap[c][m] = (vmap[c][m]||0) + r.valor;
  });

  var html = '<thead><tr><th>Categoria</th>';
  allMs.forEach(function(m){ html+='<th'+(fcSet[m]?' style="color:#bbb;font-style:italic"':'')+'>'+monthLabel(m)+(fcSet[m]?' *':'')+'</th>'; });
  html += '<th>Total</th></tr></thead><tbody>';

  cats.forEach(function(cat) {
    html += '<tr><td>'+cat+'</td>';
    var rowTot = 0;
    allMs.forEach(function(m) {
      var v = fcSet[m] ? (fc.avg||0) / Math.max(cats.length,1) : (vmap[cat]&&vmap[cat][m]||0);
      if (!fcSet[m]) rowTot += (vmap[cat]&&vmap[cat][m]||0);
      html += '<td class="'+(fcSet[m]?'fcast':'')+'">'+( v>0.5?brl(v):'—')+'</td>';
    });
    html += '<td style="font-weight:600">'+brl(rowTot)+'</td></tr>';
  });

  // Total row
  var mTotals = sumMonthly(realRows);
  html += '<tr class="tot-row"><td>Total</td>';
  allMs.forEach(function(m){ var v=fcSet[m]?(fc.avg||0):(mTotals[m]||0); html+='<td class="'+(fcSet[m]?'fcast':'')+'">'+brl(v)+'</td>'; });
  html += '<td>'+brl(total(realRows))+'</td></tr></tbody>';
  if(fcMs.length) html += '<tfoot><tr><td colspan="'+(allMs.length+2)+'" style="font-size:.65rem;color:#bbb;padding:6px 8px">* Previsão baseada na média histórica de ganhos</td></tr></tfoot>';

  $('ganhoMonthTable').innerHTML = html;
}

/* ─── Cross Tab ─── */
function renderCrossTab(rows, gRows, tot, totG) {
  var saldo = totG-tot, comp = totG>0?tot/totG*100:0;
  function card(l,v,s,tc,tt){return'<div class="card"><div class="cl">'+l+'</div><div class="cv sm">'+v+'</div>'+(s?'<div class="cs">'+s+'</div>':'')+(tc?'<span class="tg '+tc+'">'+tt+'</span>':'')+' </div>';}
  $('crossCards').innerHTML =
    card('Ganhos',brl(totG),'Per\xedodo','','')+
    card('Gastos',brl(tot),'Per\xedodo','','')+
    card('Saldo',brl(saldo),'',saldo>=0?'tgg':'trr',saldo>=0?'▲ Positivo':'▼ Negativo')+
    card('Comprometimento',pct(comp),'dos ganhos em gastos',comp<=70?'tgg':comp<=90?'tnn':'trr',comp<=70?'Saud\xe1vel':comp<=90?'Aten\xe7\xe3o':'Alto');

  // Savings by month
  var gMap = sumMonthly(filtGanhos(true));
  var eMap = sumMonthly(filtGastos(true));
  var allK = uniq(Object.keys(gMap).concat(Object.keys(eMap))).sort();
  var savEl = $('savingsCmp'); savEl.innerHTML = '';
  allK.forEach(function(k) {
    var g=gMap[k]||0, e=eMap[k]||0, s=g-e, sp=g>0?s/g*100:0;
    var cl=sp>=20?'tgg':sp>=0?'tnn':'trr';
    var row=document.createElement('div'); row.className='mcr';
    row.innerHTML='<span class="mcl">'+monthLabel(k)+'</span>'+
      '<div class="mct"><div class="mcf" style="width:'+Math.min(Math.max(sp,0),100).toFixed(1)+'%;background:'+(sp>=20?'#1D9E75':sp>=0?'#EF9F27':'#E85D04')+'"></div></div>'+
      '<span class="mcv">'+brl(s)+'</span><span class="mcp"><span class="tg '+cl+'">'+pct(sp)+'</span></span>';
    savEl.appendChild(row);
  });

  // Resp cross
  var respG={}, respE={};
  allGanhos.forEach(function(r){ var k=r.resp||'?'; respG[k]=(respG[k]||0)+r.valor; });
  allGastos.forEach(function(r){ var k=r.resp||'?'; respE[k]=(respE[k]||0)+r.valor; });
  var allR = uniq(Object.keys(respG).concat(Object.keys(respE)));
  var rEl = $('respCross'); rEl.innerHTML = '';
  allR.forEach(function(resp, i) {
    var g=respG[resp]||0, e=respE[resp]||0, s=g-e, rate=g>0?e/g*100:0;
    var color=RESP_COLORS[i%RESP_COLORS.length];
    var d=document.createElement('div'); d.className='pr';
    d.innerHTML='<div class="prh"><span class="prn" style="color:'+color+';font-weight:600">'+resp+'</span>'+
      '<span class="prm">'+pct(rate)+' dos ganhos gastos</span></div>'+
      '<div class="track"><div class="fill" style="width:'+Math.min(rate,100).toFixed(1)+'%;background:'+color+'"></div></div>'+
      '<div style="font-size:.69rem;color:#aaa;margin-top:2px">Ganhos: '+brl(g)+' &bull; Gastos: '+brl(e)+' &bull; Saldo: <strong style="color:'+(s>=0?'#15803D':'#B91C1C')+'">'+brl(s)+'</strong></div>';
    rEl.appendChild(d);
  });

  // Ganho detail
  var totAllG = total(allGanhos);
  var detEl = $('ganhoDetail'); detEl.innerHTML = '';
  sumBy(allGanhos,'cat').forEach(function(pair) {
    var v=pair[1], p=totAllG?v/totAllG*100:0;
    var d=document.createElement('div'); d.className='pr';
    d.innerHTML='<div class="prh"><span class="prn">'+pair[0]+'</span><span class="prm">'+brl(v)+'&nbsp;<strong>'+pct(p)+'</strong></span></div>'+
      '<div class="track"><div class="fill" style="width:'+p.toFixed(1)+'%;background:'+catColor(pair[0])+'"></div></div>';
    detEl.appendChild(d);
  });
}

/* ─── Classificação Tab ─── */
function renderClassifTab(rows) {
  var tot = total(rows);
  var buckTot = {Necessidade:0, Investimento:0, Lazer:0};
  rows.forEach(function(r){ var b=classifMap[r.cat]||'Necessidade'; buckTot[b]=(buckTot[b]||0)+r.valor; });

  // Big bucket cards
  var html='';
  [{k:'Necessidade',cls:'nec'},{k:'Investimento',cls:'inv'},{k:'Lazer',cls:'laz'}].forEach(function(b){
    var v=buckTot[b.k]||0, p=tot?v/tot*100:0;
    html+='<div class="bcard '+b.cls+'"><div class="btit">'+b.k+'</div>'+
      '<div class="bpct">'+pct(p,0)+'</div><div class="bval">'+brl(v)+'</div></div>';
  });
  $('bucksEl').innerHTML = html;

  // Matrix by month
  var allRows = filtGastos(true);
  var months = uniq(allRows.map(function(r){ return monthKey(r.date); }).filter(Boolean)).sort();
  var bm = {Necessidade:{}, Investimento:{}, Lazer:{}};
  allRows.forEach(function(r){ var b=classifMap[r.cat]||'Necessidade', m=monthKey(r.date); if(!m) return; bm[b][m]=(bm[b][m]||0)+r.valor; });
  var mTotals = {};
  months.forEach(function(m){ mTotals[m]=['Necessidade','Investimento','Lazer'].reduce(function(s,b){return s+(bm[b][m]||0);},0); });

  var tbl='<thead><tr><th>Bucket</th>';
  months.forEach(function(m){ tbl+='<th>'+monthLabel(m)+'</th>'; });
  tbl+='<th>Total</th><th>M\xe9dia/m\xeas</th></tr></thead><tbody>';
  ['Necessidade','Investimento','Lazer'].forEach(function(b){
    tbl+='<tr><td style="color:'+BUCK_COLORS[b]+';font-weight:600">'+b+'</td>';
    var rowTot=0;
    months.forEach(function(m){ var v=bm[b][m]||0; rowTot+=v; tbl+='<td>'+(v?brl(v):'—')+'</td>'; });
    tbl+='<td>'+brl(rowTot)+'</td><td style="color:#888">'+brl(months.length?rowTot/months.length:0)+'</td></tr>';
  });
  tbl+='<tr class="tot-row"><td>% por m\xeas</td>';
  months.forEach(function(m){
    var mt=mTotals[m]||0;
    if(!mt){tbl+='<td>—</td>';return;}
    tbl+='<td style="font-size:.68rem;line-height:1.4">'+ ['Necessidade','Investimento','Lazer'].map(function(b){
      return'<span style="color:'+BUCK_COLORS[b]+'">'+b[0]+': '+pct((bm[b][m]||0)/mt*100,0)+'</span>';
    }).join('<br>')+'</td>';
  });
  tbl+='<td></td><td></td></tr></tbody>';
  $('classMtx').innerHTML = tbl;

  // Category editor
  var cats = uniq(allGastos.map(function(r){ return r.cat; }).filter(Boolean));
  var edHtml='<thead><tr><th>Categoria</th><th>Gasto Total</th><th>Classifica\xe7\xe3o</th></tr></thead><tbody>';
  var catTotals = {};
  allGastos.forEach(function(r){ var c=r.cat||'Outros'; catTotals[c]=(catTotals[c]||0)+r.valor; });
  cats.forEach(function(c){
    var sel=classifMap[c]||'Necessidade';
    var cls=sel==='Necessidade'?'sel-n':sel==='Investimento'?'sel-i':'sel-l';
    edHtml+='<tr><td>'+c+'</td><td style="text-align:right;font-variant-numeric:tabular-nums;color:#888">'+brl(catTotals[c]||0)+'</td>'+
      '<td><select class="cat-sel '+cls+'" data-cat="'+c+'">'+
      ['Necessidade','Investimento','Lazer'].map(function(b){return'<option'+(b===sel?' selected':'')+'>'+b+'</option>';}).join('')+
      '</select></td></tr>';
  });
  edHtml+='</tbody>';
  $('catEditor').innerHTML = edHtml;

  document.querySelectorAll('.cat-sel').forEach(function(sel){
    sel.addEventListener('change',function(){
      classifMap[this.dataset.cat] = this.value;
      saveClassif(classifMap);
      this.className='cat-sel '+(this.value==='Necessidade'?'sel-n':this.value==='Investimento'?'sel-i':'sel-l');
      renderClassifTab(filtGastos());
      if(currentTab==='classif') setTimeout(renderCharts, 30);
    });
  });
}

/* ─── Table ─── */
function renderTable(rows, tot) {
  var tb=$('tbodyEl'), nd=$('noData');
  if(!rows.length){ nd.style.display=''; tb.innerHTML=''; return; }
  nd.style.display='none';
  var sorted = rows.slice().sort(function(a,b){ return (b.date?b.date.getTime():0)-(a.date?a.date.getTime():0); });
  var html='';
  sorted.forEach(function(r){
    var ds=r.date?r.date.toLocaleDateString('pt-BR'):(r.rawDate||'—');
    var p=tot?r.valor/tot*100:0, t=lo(r.tipo), bc='bo';
    if(t.indexOf('cred')!==-1) bc='bc'; else if(t.indexOf('deb')!==-1) bc='bd'; else if(t.indexOf('tick')!==-1) bc='bt';
    html+='<tr><td>'+ds+'</td><td>'+(r.resp||'—')+'</td><td>'+(r.desc||'—')+'</td>'+
      '<td>'+(r.cat||'—')+'</td><td><span class="bdg '+bc+'">'+(r.tipo||'—')+'</span></td>'+
      '<td class="r">'+brl(r.valor)+'</td><td class="r dm">'+pct(p)+'</td></tr>';
  });
  tb.innerHTML = html;
}

/* ─── Charts ─── */
function renderCharts() {
  if(currentTab==='main')    renderMainTab(filtGastos(true), filtGanhos(true));
  else if(currentTab==='gastos')  renderChGastos();
  else if(currentTab==='ganhos') renderChGanhos();
  else if(currentTab==='cross')  renderChCross();
  else if(currentTab==='classif')  renderChClassif();
  else if(currentTab==='previsao') renderForecastTab(filtGastos(true));
  else if(currentTab==='invest')    renderInvestTab(filtGastos(true));
  else if(currentTab==='simulacao') renderSimTab();
  else if(currentTab==='lancar')    initLancarTab();
}

function makeChart(id, cfg) {
  var el = document.getElementById(id); if(!el) return;
  if(chartMap[id]){ chartMap[id].destroy(); chartMap[id]=null; }
  chartMap[id] = new Chart(el.getContext('2d'), cfg);
}

var baseChartOpts = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend:{display:false}, tooltip:{callbacks:{label:function(c){return brl(c.parsed.y);}}} },
  scales: {
    x: {grid:{display:false}, ticks:{font:{family:'Inter',size:10},color:'#bbb'}},
    y: {grid:{color:'#f0f0f0'}, ticks:{font:{family:'Inter',size:10},color:'#bbb', callback:function(v){return 'R$'+v.toLocaleString('pt-BR');}}}
  }
};

function renderChGastos() {
  var FORECAST_MONTHS = 3;
  var realRows = filtGastos(true);
  var fc = buildForecast(realRows, FORECAST_MONTHS);
  var realMap = sumMonthly(realRows);
  var realMs  = Object.keys(realMap).sort();
  var fcMs    = fc.months || [];
  var allMs   = realMs.concat(fcMs);
  var fcTotals = {};
  if(fc.catAvg) fcMs.forEach(function(m){ fcTotals[m]=Object.values(fc.catAvg).reduce(function(s,v){return s+v;},0); });

  var labels=allMs.map(monthLabel);
  var realData=allMs.map(function(m){ return fcMs.indexOf(m)===-1?(realMap[m]||0):null; });
  var fcData=allMs.map(function(m){ return fcMs.indexOf(m)!==-1?(fcTotals[m]||0):null; });

  makeChart('chGastos',{
    type:'line', data:{labels:labels, datasets:[
      {label:'Real',data:realData,borderColor:'#E85D04',borderWidth:2,pointRadius:3,pointBackgroundColor:'#E85D04',fill:true,backgroundColor:'rgba(232,93,4,.07)',tension:.35,spanGaps:false},
      {label:'Previs\xe3o',data:fcData,borderColor:'#E85D04',borderDash:[5,4],borderWidth:2,pointRadius:3,pointBackgroundColor:'#E85D04',fill:false,tension:.35,spanGaps:false}
    ]},
    options:{...baseChartOpts, plugins:{legend:{display:true,labels:{font:{family:'Inter',size:11},color:'#888',boxWidth:12}}, tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+brl(c.parsed.y);}}}}}
  });
}

function renderChGanhos() {
  var FORECAST_MONTHS = 3;
  var realRows = filtGanhos(true);
  var fc = buildGanhoForecast(realRows, FORECAST_MONTHS);
  var realMap = sumMonthly(realRows);
  var realMs  = Object.keys(realMap).sort();
  var fcMs    = fc.months || [];
  var allMs   = realMs.concat(fcMs);

  var labels=allMs.map(monthLabel);
  var realData=allMs.map(function(m){ return fcMs.indexOf(m)===-1?(realMap[m]||0):null; });
  var fcData=allMs.map(function(m){ return fcMs.indexOf(m)!==-1?(fc.avg||0):null; });

  makeChart('chGanhos',{
    type:'line', data:{labels:labels, datasets:[
      {label:'Real',data:realData,borderColor:'#1D9E75',borderWidth:2,pointRadius:3,pointBackgroundColor:'#1D9E75',fill:true,backgroundColor:'rgba(29,158,117,.07)',tension:.35,spanGaps:false},
      {label:'Previs\xe3o',data:fcData,borderColor:'#1D9E75',borderDash:[5,4],borderWidth:2,pointRadius:3,fill:false,tension:.35,spanGaps:false}
    ]},
    options:{...baseChartOpts, plugins:{legend:{display:true,labels:{font:{family:'Inter',size:11},color:'#888',boxWidth:12}}, tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+brl(c.parsed.y);}}}}}
  });
}

function renderChCross() {
  var gMap = sumMonthly(filtGanhos(true));
  var eMap = sumMonthly(filtGastos(true));
  var allK = uniq(Object.keys(gMap).concat(Object.keys(eMap))).sort();
  makeChart('chCross',{
    type:'bar', data:{labels:allK.map(monthLabel), datasets:[
      {label:'Ganhos',data:allK.map(function(k){return gMap[k]||0;}),backgroundColor:'rgba(29,158,117,.7)',borderRadius:4,order:2},
      {label:'Gastos',data:allK.map(function(k){return eMap[k]||0;}),backgroundColor:'rgba(232,93,4,.7)',borderRadius:4,order:2},
      {label:'Saldo',data:allK.map(function(k){return(gMap[k]||0)-(eMap[k]||0);}),type:'line',borderColor:'#378ADD',borderWidth:2,pointRadius:3,pointBackgroundColor:'#378ADD',fill:false,tension:.3,order:1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{font:{family:'Inter',size:11},color:'#666',boxWidth:12}}, tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+brl(c.parsed.y);}}}},
      scales:{x:{grid:{display:false},ticks:{font:{family:'Inter',size:10},color:'#bbb'}},
        y:{grid:{color:'#f0f0f0'},ticks:{font:{family:'Inter',size:10},color:'#bbb',callback:function(v){return'R$'+v.toLocaleString('pt-BR');}}}}}
  });
}

function renderChClassif() {
  var allRows = filtGastos(true);
  var months  = uniq(allRows.map(function(r){return monthKey(r.date);}).filter(Boolean)).sort();
  var bm={Necessidade:{},Investimento:{},Lazer:{}};
  allRows.forEach(function(r){ var b=classifMap[r.cat]||'Necessidade',m=monthKey(r.date);if(!m)return;bm[b][m]=(bm[b][m]||0)+r.valor; });
  makeChart('chClassif',{
    type:'bar', data:{labels:months.map(monthLabel), datasets:[
      {label:'Necessidade',data:months.map(function(m){return bm.Necessidade[m]||0;}),backgroundColor:BUCK_ALPHA.Necessidade,borderRadius:4},
      {label:'Investimento',data:months.map(function(m){return bm.Investimento[m]||0;}),backgroundColor:BUCK_ALPHA.Investimento,borderRadius:4},
      {label:'Lazer',data:months.map(function(m){return bm.Lazer[m]||0;}),backgroundColor:BUCK_ALPHA.Lazer,borderRadius:4}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{font:{family:'Inter',size:11},color:'#666',boxWidth:12}}, tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+brl(c.parsed.y);}}}},
      scales:{x:{stacked:true,grid:{display:false},ticks:{font:{family:'Inter',size:10},color:'#bbb'}},
        y:{stacked:true,grid:{color:'#f0f0f0'},ticks:{font:{family:'Inter',size:10},color:'#bbb',callback:function(v){return'R$'+v.toLocaleString('pt-BR');}}}}}
  });
}

/* ─── Helpers ─── */
function renderPctBars(id, pairs, tot, limit, colorFn) {
  var el=$(id); if(!el) return; el.innerHTML='';
  pairs.slice(0,limit).forEach(function(pair){
    var v=pair[1], p=tot?v/tot*100:0;
    var d=document.createElement('div'); d.className='pr';
    d.innerHTML='<div class="prh"><span class="prn" title="'+pair[0]+'">'+pair[0]+'</span>'+
      '<span class="prm">'+brl(v)+'&nbsp;<strong>'+pct(p)+'</strong></span></div>'+
      '<div class="track"><div class="fill" style="width:'+p.toFixed(1)+'%;background:'+colorFn(pair[0])+'"></div></div>';
    el.appendChild(d);
  });
}

function renderRespBar(bId, lId, pairs, tot) {
  var bEl=$(bId), lEl=$(lId); if(!bEl||!lEl) return; bEl.innerHTML=''; lEl.innerHTML='';
  pairs.forEach(function(pair,i){
    var p=tot?pair[1]/tot*100:0, c=RESP_COLORS[i%RESP_COLORS.length];
    var seg=document.createElement('div'); seg.className='rseg';
    seg.style.width=p.toFixed(1)+'%'; seg.style.background=c;
    seg.title=pair[0]+': '+brl(pair[1])+' ('+pct(p)+')'; bEl.appendChild(seg);
    var item=document.createElement('div'); item.className='ri';
    item.innerHTML='<div class="rdot" style="background:'+c+'"></div><span><strong>'+pair[0]+'</strong> — '+brl(pair[1])+' ('+pct(p)+')</span>';
    lEl.appendChild(item);
  });
}

function renderMCmp(id, rows, color, invertSign) {
  var m=sumMonthly(rows), ks=Object.keys(m).sort();
  var maxV=ks.length?Math.max.apply(null,ks.map(function(k){return m[k];})):1;
  var el=$(id); if(!el) return; el.innerHTML='';
  ks.forEach(function(k,i){
    var v=m[k], p=maxV?v/maxV*100:0;
    var prev=i>0?m[ks[i-1]]:null, chg=prev?(v-prev)/prev*100:null;
    var pill=chg!=null?'<span class="tg '+(invertSign?(chg>0?'trr':'tgg'):(chg>0?'tgg':'trr'))+'">'+(chg>0?'+':'')+chg.toFixed(1)+'%</span>':'';
    var row=document.createElement('div'); row.className='mcr';
    row.innerHTML='<span class="mcl">'+monthLabel(k)+'</span>'+
      '<div class="mct"><div class="mcf" style="width:'+p.toFixed(1)+'%;background:'+color+'"></div></div>'+
      '<span class="mcv">'+brl(v)+'</span><span class="mcp">'+pill+'</span>';
    el.appendChild(row);
  });
}

/* ─── Simulação / Planejador ─── */
var SIM_KEY        = 'cf_sim_plan_v1';
var SIM_GANHO_KEY  = 'cf_sim_ganho_v1';
function simGetGanho(autoVal) {
  var s = localStorage.getItem(SIM_GANHO_KEY);
  return s !== null ? parseFloat(s) : autoVal;
}
function simSetGanho(val) {
  if (val === null || isNaN(val)) localStorage.removeItem(SIM_GANHO_KEY);
  else localStorage.setItem(SIM_GANHO_KEY, val);
}

function simGetData()   { try { return JSON.parse(localStorage.getItem(SIM_KEY)||'{}'); } catch(e){ return {}; } }
function simSaveData(d) { localStorage.setItem(SIM_KEY, JSON.stringify(d)); }
function simGetVal(cat, month) { var d=simGetData(); return (d[cat]&&d[cat][month]!=null) ? d[cat][month] : null; }
function simSetVal(cat, month, val) {
  var d=simGetData();
  if(!d[cat]) d[cat]={};
  if(val===null||val===undefined||isNaN(val)) delete d[cat][month];
  else d[cat][month]=val;
  simSaveData(d);
}

function simGetPlanMonths() {
  // Current month through end of year
  var now = new Date();
  var months = [];
  for (var m = now.getMonth()+1; m <= 12; m++) {
    months.push(now.getFullYear()+'-'+String(m).padStart(2,'0'));
  }
  return months;
}

function simGetRefMonths() {
  // The 3 calendar months immediately before the current month
  var now = new Date();
  var refs = [];
  for (var i = 3; i >= 1; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    refs.push(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'));
  }
  return refs;
}

function simFillAverages() {
  var months = simGetPlanMonths();
  var rows = allGastos.filter(function(r){ if(!r.date) return false; var mo=r.date.getMonth()+1; return mo!==1&&mo!==2; });
  var cats = uniq(allGastos.map(function(r){return r.cat;}).filter(Boolean));
  var realMonths = uniq(rows.map(function(r){return monthKey(r.date);}).filter(Boolean));
  var catAvg = {};
  cats.forEach(function(c){
    var tot=0;
    realMonths.forEach(function(m){ rows.forEach(function(r){ if(r.cat===c&&monthKey(r.date)===m) tot+=r.valor; }); });
    var mTot={}; rows.forEach(function(r){ if(r.cat===c){var mk=monthKey(r.date);if(mk)mTot[mk]=(mTot[mk]||0)+r.valor;} });
    catAvg[c] = realMonths.length ? Object.values(mTot).reduce(function(s,v){return s+v;},0)/realMonths.length : 0;
  });
  var d = simGetData();
  cats.forEach(function(c){
    if(!d[c]) d[c]={};
    months.forEach(function(m){ if(catAvg[c]>0) d[c][m]=Math.round(catAvg[c]); });
  });
  simSaveData(d);
  renderSimTab();
  showSimSaved('Médias aplicadas!');
}

function simFillLastMonth() {
  var months = simGetPlanMonths();
  var cats = uniq(allGastos.map(function(r){return r.cat;}).filter(Boolean));
  // find last real month
  var realMs = uniq(allGastos.map(function(r){return monthKey(r.date);}).filter(Boolean)).sort();
  var lastM = realMs[realMs.length-1];
  if(!lastM) return;
  var catMap = {};
  allGastos.forEach(function(r){ if(monthKey(r.date)===lastM){ catMap[r.cat]=(catMap[r.cat]||0)+r.valor; } });
  var d = simGetData();
  cats.forEach(function(c){
    if(!d[c]) d[c]={};
    months.forEach(function(m){ if(catMap[c]>0) d[c][m]=Math.round(catMap[c]); });
  });
  simSaveData(d);
  renderSimTab();
  showSimSaved('Último mês aplicado!');
}

function simClearAll() {
  localStorage.removeItem(SIM_KEY);
  localStorage.removeItem(SIM_GANHO_KEY);
  renderSimTab();
  showSimSaved('Tudo limpo.');
}

function showSimSaved(msg) {
  var el=document.getElementById('simSavedMsg'); if(!el) return;
  el.textContent='✓ '+msg;
  setTimeout(function(){ el.textContent=''; }, 2500);
}

function renderAcompanhamento() {
  var now     = new Date();
  var curMonth= now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
  var cats    = uniq(allGastos.map(function(r){return r.cat;}).filter(Boolean)).sort();

  // Real spending this month
  var realMap = {};
  allGastos.forEach(function(r){
    if(monthKey(r.date)!==curMonth) return;
    realMap[r.cat]=(realMap[r.cat]||0)+r.valor;
  });

  // Planned this month
  var planMap = {};
  var hasPlan = false;
  cats.forEach(function(c){
    var v = simGetVal(c, curMonth);
    if(v!==null && v>0){ planMap[c]=v; hasPlan=true; }
  });

  var titleEl = document.getElementById('acpTitle');
  var subEl   = document.getElementById('acpSub');
  if(titleEl) titleEl.textContent = 'Acompanhamento — ' + monthLabel(curMonth);
  if(subEl)   subEl.textContent   = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});

  if(!hasPlan){
    document.getElementById('acpResume').innerHTML='';
    document.getElementById('acpTable').innerHTML=
      '<tbody><tr><td colspan="6"><div class="acp-no-plan">'+
      '📋 Nenhum orçamento planejado para '+monthLabel(curMonth)+'. '+
      'Preencha a tabela abaixo para começar a acompanhar seus gastos.</div></td></tr></tbody>';
    return;
  }

  var totalPlan  = Object.values(planMap).reduce(function(s,v){return s+v;},0);
  var totalGasto = Object.keys(planMap).reduce(function(s,c){return s+(realMap[c]||0);},0);
  var totalRest  = totalPlan - totalGasto;
  var pctUsed    = totalPlan>0 ? totalGasto/totalPlan*100 : 0;
  var restCls    = totalRest<0?'over':pctUsed>=80?'warn':'ok';

  // Days progress this month
  var daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  var daysPassed  = now.getDate();
  var daysPct     = daysPassed/daysInMonth*100;
  var expectedSpend = totalPlan * daysPassed/daysInMonth;
  var onTrack = totalGasto <= expectedSpend * 1.05;

  document.getElementById('acpResume').innerHTML =
    '<div class="acp-card"><div class="ac-lbl">Orçamento do Mês</div><div class="ac-val">'+brl(totalPlan)+'</div><div class="ac-sub">planejado para '+monthLabel(curMonth)+'</div></div>'+
    '<div class="acp-card"><div class="ac-lbl">Gasto até agora</div><div class="ac-val">'+brl(totalGasto)+'</div><div class="ac-sub">'+daysPassed+' de '+daysInMonth+' dias ('+pct(daysPct,0)+')</div></div>'+
    '<div class="acp-card '+restCls+'"><div class="ac-lbl">Saldo Restante</div><div class="ac-val">'+brl(totalRest)+'</div><div class="ac-sub">'+(totalRest>=0?'disponível para gastar':'acima do orçamento')+'</div></div>'+
    '<div class="acp-card '+(onTrack?'ok':'warn')+'"><div class="ac-lbl">Ritmo de Gasto</div><div class="ac-val">'+pct(pctUsed,1)+'</div><div class="ac-sub">'+(onTrack?'✓ dentro do ritmo esperado':'⚠ acima do esperado para hoje')+'</div></div>'+
    '<div class="acp-card"><div class="ac-lbl">Esperado hoje</div><div class="ac-val" style="font-size:.9rem">'+brl(expectedSpend)+'</div><div class="ac-sub">com base no dia '+daysPassed+'/'+daysInMonth+'</div></div>';

  // Table
  var buckets = ['Necessidade','Investimento','Lazer'];
  var bColor  = {Necessidade:'#1D4ED8',Investimento:'#15803D',Lazer:'#C2410C'};

  var html='<thead><tr>'+
    '<th style="text-align:left">Categoria</th>'+
    '<th>Orçamento</th><th>Gasto</th><th>Restante</th>'+
    '<th class="t-bar-cell">Progresso</th><th>Status</th></tr></thead><tbody>';

  // Sort cats: over budget first, then by % used desc
  var sortedCats = Object.keys(planMap).sort(function(a,b){
    var pa=(realMap[a]||0)/planMap[a], pb=(realMap[b]||0)/planMap[b];
    return pb-pa;
  });

  // Group by bucket
  buckets.forEach(function(buck){
    var bCats = sortedCats.filter(function(c){ return (classifMap[c]||'Necessidade')===buck; });
    if(!bCats.length) return;
    html+='<tr style="background:#f7f7f7"><td colspan="6" style="font-size:.61rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:'+bColor[buck]+';padding:5px 10px">'+buck+'</td></tr>';
    bCats.forEach(function(cat){
      var plan  = planMap[cat]||0;
      var gasto = realMap[cat]||0;
      var rest  = plan - gasto;
      var used  = plan>0 ? Math.min(gasto/plan*100,100) : 0;
      var over  = plan>0 ? Math.max(0,(gasto-plan)/plan*100) : 0;
      var cls   = rest<0?'over':used>=80?'warn':'ok';
      var statusTxt = gasto===0?'Não iniciado':rest<0?'Estourou '+brl(Math.abs(rest)):used>=80?'Atenção — '+brl(rest)+' restam':'OK — '+brl(rest)+' restam';
      var statusCls = gasto===0?'ts-empty':rest<0?'ts-over':used>=80?'ts-warn':'ts-ok';

      html+='<tr>'+
        '<td>'+cat+'</td>'+
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

  // Cats without plan but with spending
  var unplanned = cats.filter(function(c){ return !planMap[c] && realMap[c]>0; });
  if(unplanned.length){
    html+='<tr style="background:#f7f7f7"><td colspan="6" style="font-size:.61rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#bbb;padding:5px 10px">Sem orçamento definido</td></tr>';
    unplanned.forEach(function(cat){
      html+='<tr><td>'+cat+'</td><td class="t-plan" style="color:#ddd">—</td>'+
        '<td class="t-gasto">'+brl(realMap[cat])+'</td>'+
        '<td style="color:#bbb">—</td>'+
        '<td></td>'+
        '<td><span class="t-status ts-empty">Sem plano</span></td></tr>';
    });
  }

  html+='</tbody><tfoot><tr><td>Total</td><td>'+brl(totalPlan)+'</td><td>'+brl(totalGasto)+'</td>'+
    '<td class="t-rest '+restCls+'">'+brl(totalRest)+'</td>'+
    '<td><div class="t-bar-wrap"><div class="t-bar-fill" style="width:'+Math.min(pctUsed,100).toFixed(1)+'%;background:#1a1a1a"></div></div>'+
    '<div style="font-size:.63rem;color:#aaa;text-align:right;margin-top:2px">'+pct(pctUsed,0)+'</div></td>'+
    '<td><span class="t-status '+(restCls==='ok'?'ts-ok':restCls==='warn'?'ts-warn':'ts-over')+'">'+(totalRest>=0?brl(totalRest)+' restam':'Estourou '+brl(Math.abs(totalRest)))+'</span></td></tr></tfoot>';

  document.getElementById('acpTable').innerHTML = html;
}

function renderSimTab() {
  renderAcompanhamento();
  var months   = simGetPlanMonths();
  var cats     = uniq(allGastos.map(function(r){return r.cat;}).filter(Boolean)).sort();
  var ganhoMs    = uniq(allGanhos.map(function(r){return monthKey(r.date);}).filter(Boolean)).sort();
  var autoGanho  = ganhoMs.length ? total(allGanhos)/ganhoMs.length : 0;
  var avgGanho   = simGetGanho(autoGanho);

  // 3 months before current month as reference (read-only)
  var refMs = simGetRefMonths();

  // Real spending map {cat:{month:total}}
  var realMap = {};
  allGastos.forEach(function(r){
    var c=r.cat||'Outros', m=monthKey(r.date); if(!m) return;
    if(!realMap[c]) realMap[c]={};
    realMap[c][m] = (realMap[c][m]||0)+r.valor;
  });
  var realColTot = {};
  refMs.forEach(function(m){
    realColTot[m]=cats.reduce(function(s,c){return s+(realMap[c]&&realMap[c][m]||0);},0);
  });

  // Buckets
  var buckets    = ['Necessidade','Investimento','Lazer'];
  var bucketCats = {Necessidade:[],Investimento:[],Lazer:[]};
  cats.forEach(function(c){ var b=classifMap[c]||'Necessidade'; bucketCats[b].push(c); });

  // Plan totals
  var colTotals = {}; months.forEach(function(m){ colTotals[m]=0; });
  var catTotals = {}; cats.forEach(function(c){ catTotals[c]=0; });
  var buckTotals = {Necessidade:0,Investimento:0,Lazer:0};
  var grandTotal = 0;
  cats.forEach(function(c){
    months.forEach(function(m){
      var v=simGetVal(c,m)||0;
      colTotals[m]+=v; catTotals[c]+=v; grandTotal+=v;
      buckTotals[classifMap[c]||'Necessidade']+=v;
    });
  });
  var avgPlanned = months.length ? grandTotal/months.length : 0;

  // ── KPI Cards ──
  var savRate = avgGanho>0 ? Math.max(0,(avgGanho-avgPlanned)/avgGanho*100) : 0;
  var kpis = [
    {lbl:'Total Planejado',val:brl(grandTotal),sub:months.length+' meses · '+brl(avgPlanned)+'/mês',cls:''},
    {lbl:'Receita Mensal',val:'__GANHO_INPUT__',sub:'Clique para editar',cls:'inv'},
    {lbl:'Necessidade',val:pct(grandTotal?buckTotals.Necessidade/grandTotal*100:0),sub:brl(buckTotals.Necessidade),cls:'nec'},
    {lbl:'Investimento',val:pct(grandTotal?buckTotals.Investimento/grandTotal*100:0),sub:brl(buckTotals.Investimento),cls:'inv'},
    {lbl:'Lazer',val:pct(grandTotal?buckTotals.Lazer/grandTotal*100:0),sub:brl(buckTotals.Lazer),cls:'laz'},
    {lbl:'Poupança Estimada',val:pct(savRate),sub:brl(avgGanho-avgPlanned)+'/mês',cls:savRate>=20?'inv':'warn'}
  ];
  var isOvr = localStorage.getItem(SIM_GANHO_KEY) !== null;
  document.getElementById('simKpis').innerHTML = kpis.map(function(k){
    if (k.val === '__GANHO_INPUT__') {
      return '<div class="sim-kpi '+k.cls+'" style="position:relative">'+
        '<div class="sk-lbl">'+k.lbl+(isOvr?' <span style="color:#EF9F27;font-size:.55rem">★ editado</span>':'')+'</div>'+
        '<div style="display:flex;align-items:center;gap:6px;margin:3px 0">'+
          '<input id="simGanhoInp" type="number" min="0" step="100" value="'+avgGanho.toFixed(2)+'" '+
          'style="width:110px;padding:4px 8px;border:1.5px solid #BBF7D0;border-radius:7px;font-family:inherit;font-size:1rem;font-weight:700;color:#15803D;background:#fff;outline:none"/>'+
        '</div>'+
        '<div class="sk-sub">Histórico: '+brl(autoGanho)+'/mês'+
          (isOvr?' &bull; <button onclick="simSetGanho(null);renderSimTab()" style="border:none;background:none;color:#bbb;cursor:pointer;font-size:.65rem;padding:0">↩ resetar</button>':'')+
        '</div>'+
      '</div>';
    }
    return '<div class="sim-kpi '+k.cls+'"><div class="sk-lbl">'+k.lbl+'</div><div class="sk-val">'+k.val+'</div><div class="sk-sub">'+k.sub+'</div></div>';
  }).join('');

  // Wire income input
  var ginp = document.getElementById('simGanhoInp');
  if (ginp) {
    ginp.addEventListener('change', function(){
      var v = parseFloat(ginp.value);
      simSetGanho(isNaN(v)||v<=0 ? null : v);
      renderSimTab();
    });
    ginp.addEventListener('focus', function(){ ginp.select(); });
  }

  var totalCols = refMs.length + months.length;

  // ── Table ──
  var html = '<thead>';
  // Group header
  html += '<tr>';
  html += '<th colspan="2" style="text-align:left;border-right:2px solid #e0e0e0"></th>';
  if(refMs.length) html += '<th colspan="'+refMs.length+'" style="text-align:center;color:#bbb;font-size:.6rem;background:#f9f9f9;border-right:2px dashed #ddd">&#128197; REALIZADO</th>';
  html += '<th colspan="'+months.length+'" style="text-align:center;color:#1D4ED8;font-size:.6rem;background:#F0F4FF">&#9997; PLANEJADO</th>';
  html += '<th colspan="3"></th></tr>';
  // Column headers
  html += '<tr><th style="text-align:left">Categoria</th><th style="text-align:center">Bucket</th>';
  refMs.forEach(function(m){
    html += '<th style="color:#bbb;background:#f9f9f9;font-style:italic">'+monthLabel(m)+'</th>';
  });
  if(refMs.length) html += '';
  months.forEach(function(m){ html+='<th style="color:#1D4ED8;background:#F0F4FF">'+monthLabel(m)+'</th>'; });
  html += '<th>Total Plan.</th><th>% Total</th><th>M\xe9dia/m\xeas</th></tr></thead><tbody>';

  buckets.forEach(function(buck){
    var bCats = bucketCats[buck]; if(!bCats.length) return;
    var bColor  = {Necessidade:'#1D4ED8',Investimento:'#15803D',Lazer:'#C2410C'}[buck];
    var pillCls = {Necessidade:'nec',Investimento:'inv',Lazer:'laz'}[buck];

    html += '<tr class="bucket-sep"><td colspan="'+(totalCols+5)+'">'+buck+'</td></tr>';

    bCats.forEach(function(cat){
      var cTot       = catTotals[cat];
      var pctOfTotal = grandTotal ? cTot/grandTotal*100 : 0;
      var cAvg       = months.length ? cTot/months.length : 0;
      var inpCls     = 'p-inp '+pillCls+'-inp';

      html += '<tr>';
      html += '<td>'+cat+'</td>';
      html += '<td style="text-align:center"><span class="pct-pill '+pillCls+'">'+buck.charAt(0)+'</span></td>';

      // Reference columns (read-only)
      refMs.forEach(function(m){
        var rv = realMap[cat]&&realMap[cat][m]||0;
        var isLast = m===refMs[refMs.length-1];
        html += '<td style="color:#999;font-size:.75rem;font-variant-numeric:tabular-nums;background:#f9f9f9'+(isLast?';border-right:2px dashed #ddd':'')+'">'+(rv>0?brl(rv):'—')+'</td>';
      });

      // Editable plan columns
      months.forEach(function(m){
        var v    = simGetVal(cat,m);
        var refV = realMap[cat]&&realMap[cat][refMs[refMs.length-1]]||0; // last real as hint
        var dispV= v!==null ? v : '';
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

  // Footer
  html += '</tbody><tfoot><tr><td colspan="2">Total</td>';
  refMs.forEach(function(m){
    var isLast=m===refMs[refMs.length-1];
    html+='<td style="background:#f9f9f9;color:#888'+(isLast?';border-right:2px dashed #ddd':'')+'">'+(realColTot[m]>0?brl(realColTot[m]):'—')+'</td>';
  });
  months.forEach(function(m){
    html+='<td style="background:#F0F4FF;color:#1D4ED8">'+(colTotals[m]>0?brl(colTotals[m]):'—')+'</td>';
  });
  html+='<td>'+brl(grandTotal)+'</td><td>100%</td><td>'+brl(avgPlanned)+'</td></tr>';

  // Receita row
  html+='<tr style="background:#F0FDF4"><td colspan="2" style="color:#15803D;font-weight:600">Receita Estimada</td>';
  refMs.forEach(function(){html+='<td style="background:#f9f9f9"></td>';});
  months.forEach(function(){html+='<td style="color:#15803D;background:#F0FDF4">'+brl(avgGanho)+'</td>';});
  html += '<td style="color:#15803D">'+brl(avgGanho*months.length)+'</td><td></td><td style="color:#15803D">'+brl(avgGanho)+'</td></tr>';

  // Saldo row
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

  // Wire up inputs
  tbl.querySelectorAll('.p-inp').forEach(function(inp){
    inp.addEventListener('input', function(){
      inp.classList.toggle('has-val', inp.value !== '');
    });
    inp.addEventListener('change', function(){
      var cat   = inp.dataset.simCat;
      var month = inp.dataset.simMonth;
      var val   = inp.value==='' ? null : parseFloat(inp.value);
      simSetVal(cat, month, isNaN(val)?null:val);
      renderSimTab(); // recalculate totals + KPIs
    });
  });

  // ── Progress bars vs ideal ──
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
      (grandTotal?'<span style="color:'+(ok?'#15803D':'#D97706')+'">'+( ok?'✓':'!')+'</span>':'')+'</span>'+
      '</div>';
  }
  document.getElementById('simProgress').innerHTML =
    progRow('Necessidade',actNec,50,'rgba(29,78,216,.6)','nec')+
    progRow('Investimento',actInv,20,'rgba(21,128,61,.7)','inv')+
    progRow('Lazer',actLaz,30,'rgba(194,65,12,.7)','laz')+
    '<p style="font-size:.67rem;color:#bbb;margin-top:8px">Meta sugerida: Necessidade ≤50% · Investimento ≥20% · Lazer ≤30% (regra 50/20/30)</p>';

  // Reference table below
  renderCatMonthTable(allGastos, 'catMonthTable2');
}

/* ─── Lançar Tab ─── */
var lcType = 'gasto';
var LC_HIST_KEY = 'cf_lancamentos_hist';
var LC_URL_KEY  = 'cf_script_url';
var LC_URL_DEFAULT = 'https://script.google.com/macros/s/AKfycbyQL_psrtlo2ktvmIaWenNhWbNP_m1aJNUqB-LFozlALCJkgN8BknipUlWCs1dhMEED/exec';

var GASTOS_CATS  = ['Alimentação','Assinatura','Casa','Compras','Doação','Educação','Investimento','Lazer','Moradia','Outros','Saúde / Bem estar','Transporte','Viagem'];
var GANHOS_CATS  = ['Salário','PPR','Ticket Alimentação','Auxílio','Freelance','Outros'];
var FORMAS_PGTO  = ['Crédito','Débito','Pix','Dinheiro','Boleto','Ticket'];

var APPS_SCRIPT_CODE = [
'// Controle Financeiro — Apps Script',
'// Cole este código em Extensões > Apps Script da sua planilha',
'',
'var SHEET_GASTOS = "Gastos Detalhados";',
'var SHEET_GANHOS = "Ganhos Detalhados";',
'',
'function doGet(e) {',
'  var p = e.parameter;',
'  try {',
'    var ss = SpreadsheetApp.getActiveSpreadsheet();',
'    var sheetName = p.tipo === "ganho" ? SHEET_GANHOS : SHEET_GASTOS;',
'    var sheet = ss.getSheetByName(sheetName);',
'    if (!sheet) return ok("Aba não encontrada: " + sheetName);',
'',
'    if (p.tipo === "ganho") {',
'      sheet.appendRow([p.data, p.resp, p.desc, p.cat, p.forma, parseFloat(p.valor), p.obs||"" ]);',
'    } else {',
'      sheet.appendRow([p.data, p.resp, p.desc, p.cat, p.forma, parseFloat(p.valor), p.obs||"" ]);',
'    }',
'    return ok("ok");',
'  } catch(err) {',
'    return err_(err.toString());',
'  }',
'}',
'',
'function ok(msg)  { return ContentService.createTextOutput(JSON.stringify({status:"ok",msg:msg})).setMimeType(ContentService.MimeType.JSON); }',
'function err_(m)  { return ContentService.createTextOutput(JSON.stringify({status:"error",msg:m})).setMimeType(ContentService.MimeType.JSON); }'
].join('\n');

function initLancarTab() {
  // Set today's date
  var today = new Date();
  var iso = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
  var lcData = document.getElementById('lcData');
  if (lcData && !lcData.value) lcData.value = iso;

  // Populate responsáveis from real data
  var lcResp = document.getElementById('lcResp');
  if (lcResp && !lcResp.dataset.init) {
    var resps = uniq(allGastos.concat(allGanhos).map(function(r){ return r.resp; }).filter(Boolean));
    if (!resps.length) resps = ['Gui','Giulia'];
    lcResp.innerHTML = resps.map(function(r){ return '<option>'+r+'</option>'; }).join('');
    lcResp.dataset.init = '1';
  }

  // Categories & tipo
  populateLcCat();

  var lcTipo = document.getElementById('lcTipo');
  if (lcTipo && !lcTipo.dataset.init) {
    lcTipo.innerHTML = FORMAS_PGTO.map(function(f){ return '<option>'+f+'</option>'; }).join('');
    lcTipo.dataset.init = '1';
  }

  // Descriptions datalist
  renderDescDatalist();
  renderSugList();

  // Script URL status
  var url = localStorage.getItem(LC_URL_KEY) || LC_URL_DEFAULT;
  var el = document.getElementById('lcScriptUrl');
  if (el) el.value = url;
  updateCfgStatus(url);

  // Script code display
  var codeEl = document.getElementById('lcScriptCode');
  if (codeEl) codeEl.textContent = APPS_SCRIPT_CODE;

  renderLcHist();
}

function populateLcCat() {
  var lcCat = document.getElementById('lcCat');
  if (!lcCat) return;
  var cats = lcType === 'gasto'
    ? uniq(GASTOS_CATS.concat(allGastos.map(function(r){ return r.cat; }).filter(Boolean)))
    : uniq(GANHOS_CATS.concat(allGanhos.map(function(r){ return r.cat; }).filter(Boolean)));
  lcCat.innerHTML = cats.map(function(c){ return '<option>'+c+'</option>'; }).join('');
}

function setLcType(t) {
  lcType = t;
  document.getElementById('lcBtnGasto').className = 'on g' + (t==='gasto'?' on g':'');
  document.getElementById('lcBtnGanho').className = (t==='ganho'?'on r':'');
  document.getElementById('lcBtnGasto').classList.toggle('on', t==='gasto');
  document.getElementById('lcBtnGanho').classList.toggle('on', t==='ganho');
  document.getElementById('lcTipoWrap').style.display = t==='gasto' ? '' : 'none';
  populateLcCat();
}

function saveScriptUrl() {
  var url = (document.getElementById('lcScriptUrl').value || '').trim();
  localStorage.setItem(LC_URL_KEY, url);
  updateCfgStatus(url);
  if (url) document.getElementById('lcConfigBox').removeAttribute('open');
}

function updateCfgStatus(url) {
  var el = document.getElementById('lcCfgStatus');
  if (!el) return;
  var effective = url || LC_URL_DEFAULT;
  if (effective && effective.indexOf('script.google.com') !== -1) {
    el.textContent = '✓ Configurado'; el.className = 'lc-cfg-status lc-cfg-ok';
  } else {
    el.textContent = 'Não configurado'; el.className = 'lc-cfg-status lc-cfg-no';
  }
}

function submitLancar() {
  var btn      = document.getElementById('lcSubmit');
  var fb       = document.getElementById('lcFeedback');
  var data     = document.getElementById('lcData').value;
  var resp     = document.getElementById('lcResp').value;
  var desc     = document.getElementById('lcDesc').value.trim();
  var cat      = document.getElementById('lcCat').value;
  var tipo     = lcType === 'gasto' ? (document.getElementById('lcTipo').value) : '';
  var obs      = (document.getElementById('lcObs') ? document.getElementById('lcObs').value.trim() : '');
  var valorRaw = parseFloat(document.getElementById('lcValor').value);

  if (!data || !resp || !desc || !cat || !valorRaw || valorRaw <= 0) {
    fb.textContent = '⚠ Preencha: Data, Responsável, Descrição, Categoria e Valor.';
    fb.className = 'lc-feedback err'; return;
  }

  var dp = data.split('-');
  var dataFmt = dp[2]+'/'+dp[1]+'/'+dp[0];
  var scriptUrl = (localStorage.getItem(LC_URL_KEY) || LC_URL_DEFAULT).trim();

  btn.disabled = true;
  btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:rot .7s linear infinite"></span>&nbsp;Enviando...';
  fb.textContent = '';

  var params = [
    'tipo='  + encodeURIComponent(lcType),
    'data='  + encodeURIComponent(dataFmt),
    'resp='  + encodeURIComponent(resp),
    'desc='  + encodeURIComponent(desc),
    'cat='   + encodeURIComponent(cat),
    'forma=' + encodeURIComponent(tipo),
    'valor=' + encodeURIComponent(valorRaw.toFixed(2)),
    'obs='   + encodeURIComponent(obs)
  ].join('&');

  fetch(scriptUrl + '?' + params, { method:'GET', mode:'no-cors' })
    .then(function() {
      saveLcHist({ data:dataFmt, desc:desc, cat:cat, valor:valorRaw, tipo:lcType, resp:resp, obs:obs });
      // save desc as suggestion
      addDescSuggestion(desc);
      btn.innerHTML = '&#10003; Lançado com sucesso!';
      btn.className = 'lc-submit ok';
      fb.textContent = desc + ' — ' + brl(valorRaw) + ' enviado para a planilha ✓';
      fb.className = 'lc-feedback ok';
      document.getElementById('lcDesc').value = '';
      document.getElementById('lcValor').value = '';
      document.getElementById('lcObs').value = '';
      renderLcHist();
      setTimeout(function() {
        btn.innerHTML = '&#10003; Lançar na Planilha';
        btn.className = 'lc-submit';
        btn.disabled = false;
        fb.textContent = '';
      }, 3500);
    })
    .catch(function(e) {
      btn.innerHTML = '&#10003; Lançar na Planilha';
      btn.className = 'lc-submit'; btn.disabled = false;
      fb.textContent = '✗ Erro: ' + e.message;
      fb.className = 'lc-feedback err';
    });
}

/* ─── Description suggestions ─── */
var LC_SUG_KEY = 'cf_desc_sugs';

function loadDescSuggestions() {
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem(LC_SUG_KEY) || '[]'); } catch(e) {}
  // merge with real data
  var fromData = uniq(
    allGastos.concat(allGanhos).map(function(r){ return r.desc; }).filter(function(d){ return d && d.length > 1; })
  ).slice(0, 80);
  // saved ones first (user-added), then from data
  var merged = uniq(saved.concat(fromData));
  return merged;
}

function addDescSuggestion(desc) {
  if (!desc || desc.length < 2) return;
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem(LC_SUG_KEY) || '[]'); } catch(e) {}
  if (saved.indexOf(desc) === -1) { saved.unshift(desc); if(saved.length>100) saved=saved.slice(0,100); }
  localStorage.setItem(LC_SUG_KEY, JSON.stringify(saved));
}

function renderDescDatalist() {
  var dl = document.getElementById('lcDescList'); if (!dl) return;
  var sugs = loadDescSuggestions();
  dl.innerHTML = sugs.map(function(s){ return '<option value="'+s.replace(/"/g,'&quot;')+'">'; }).join('');
}

function addLcSug() {
  var inp = document.getElementById('lcSugInput');
  var val = (inp ? inp.value.trim() : '');
  if (!val) return;
  addDescSuggestion(val);
  if (inp) inp.value = '';
  renderDescDatalist();
  renderSugList();
}

function renderSugList() {
  var el = document.getElementById('lcSugList'); if (!el) return;
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem(LC_SUG_KEY) || '[]'); } catch(e) {}
  if (!saved.length) { el.innerHTML = '<span style="font-size:.7rem;color:#ccc">Nenhuma sugestão salva ainda. As sugestões automáticas vêm dos seus lançamentos.</span>'; return; }
  el.innerHTML = saved.map(function(s, i) {
    return '<span style="display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:3px 10px;font-size:.74rem;color:#333">'+
      s+'<button onclick="removeLcSug('+i+')" style="border:none;background:none;color:#ccc;cursor:pointer;font-size:.8rem;padding:0;line-height:1">×</button></span>';
  }).join('');
}

function removeLcSug(i) {
  var saved = [];
  try { saved = JSON.parse(localStorage.getItem(LC_SUG_KEY) || '[]'); } catch(e) {}
  saved.splice(i, 1);
  localStorage.setItem(LC_SUG_KEY, JSON.stringify(saved));
  renderDescDatalist(); renderSugList();
}

function saveLcHist(entry) {
  var hist = [];
  try { hist = JSON.parse(localStorage.getItem(LC_HIST_KEY) || '[]'); } catch(e) {}
  hist.unshift(entry);
  if (hist.length > 30) hist = hist.slice(0, 30);
  localStorage.setItem(LC_HIST_KEY, JSON.stringify(hist));
}

function renderLcHist() {
  var el = document.getElementById('lcHistList'); if (!el) return;
  var hist = [];
  try { hist = JSON.parse(localStorage.getItem(LC_HIST_KEY) || '[]'); } catch(e) {}
  if (!hist.length) { el.innerHTML = '<div style="font-size:.75rem;color:#ddd;padding:6px 0">Nenhum lançamento ainda.</div>'; return; }
  el.innerHTML = hist.slice(0,8).map(function(h, i) {
    return '<div class="lc-hist-row">'+
      '<span class="lc-hr-date">'+h.data+'</span>'+
      '<span class="lc-hr-desc" title="'+h.desc+'">'+h.desc+'</span>'+
      '<span class="lc-hr-cat">'+h.cat+'</span>'+
      '<span class="lc-hr-val '+(h.tipo==='gasto'?'g':'r')+'">'+
        (h.tipo==='gasto'?'−':'+') + brl(h.valor)+'</span>'+
      '<button class="lc-hr-del" onclick="delLcHist('+i+')" title="Remover">×</button>'+
      '</div>';
  }).join('');
}

function delLcHist(i) {
  var hist = [];
  try { hist = JSON.parse(localStorage.getItem(LC_HIST_KEY) || '[]'); } catch(e) {}
  hist.splice(i, 1);
  localStorage.setItem(LC_HIST_KEY, JSON.stringify(hist));
  renderLcHist();
}

/* ─── Events ─── */
$('btnR').addEventListener('click', loadData);
[$('fMes'),$('fResp'),$('fTipo'),$('fCat')].forEach(function(s){
  s.addEventListener('change', function(){ renderAll(); });
});
$('btnClr').addEventListener('click', function(){
  $('fMes').value=''; $('fResp').value=''; $('fTipo').value=''; $('fCat').value='';
  renderAll();
});

loadData();
}());
