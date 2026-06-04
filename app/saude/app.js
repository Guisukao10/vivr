(function(){
'use strict';

/* ── Config ── */
var WORKOUT_TYPES = ['Musculação','Corrida','Ciclismo','Natação','HIIT','Yoga','Caminhada','Futebol','Boxe','Pilates','Outro'];
var INT_LABELS  = {1:'Leve',2:'Moderado',3:'Médio',4:'Intenso',5:'Máximo'};
var MOOD_EMOJI  = {1:'😞',2:'😕',3:'😐',4:'🙂',5:'😄'};
var ENERGY_EMOJI= {1:'😴',2:'🥱',3:'⚡',4:'🔋',5:'🚀'};
var STRESS_EMOJI= {1:'😤',2:'😰',3:'😐',4:'😌',5:'🧘'};
var STRESS_LABELS={1:'Muito alto',2:'Alto',3:'Médio',4:'Baixo',5:'Relaxado'};

/* ── State ── */
var currentSection = 'hoje';
var currentDate    = todayStr();
var dayWorkouts    = [];
var daySleep       = null;
var dayMood        = null;
var dayMetrics     = null;
var healthGoals    = [];
var modalType      = null;
var wkTypeSelected = 'Musculação';
var ratings        = {intensity:3, mood:3, energy:3, stress:3, quality:3};

/* ── Helpers ── */
function todayStr(){ var n=new Date(); return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate()); }
function pad(n){ return String(n).padStart(2,'0'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtDate(str){
  var p=str.split('-'), d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  return d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
}
function shiftDate(str,days){
  var p=str.split('-'), d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  d.setDate(d.getDate()+days);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function stars(n,total){ total=total||5; var s=''; for(var i=1;i<=total;i++) s+='<span class="star '+(i<=n?'on':'off')+'">★</span>'; return '<div class="stars">'+s+'</div>'; }

/* ── Load ── */
function loadDay(){
  document.getElementById('mainPanel').innerHTML='<div class="loading">⏳ Carregando...</div>';
  Promise.all([
    db.from('workouts').eq('date',currentDate).order('created_at',{ascending:true}).select('*'),
    db.from('sleep_logs').eq('date',currentDate).select('*'),
    db.from('body_metrics').eq('date',currentDate).select('*'),
    db.from('mood_logs').eq('date',currentDate).select('*'),
    db.from('goals').eq('area','sau').select('id,title,progress,hz,target')
  ]).then(function(res){
    dayWorkouts = res[0]||[];
    daySleep    = (res[1]||[])[0]||null;
    dayMetrics  = (res[2]||[])[0]||null;
    dayMood     = (res[3]||[])[0]||null;
    healthGoals = (res[4]||[]).filter(function(g){return g.hz!=='diario';});
    renderSection();
  }).catch(function(e){
    document.getElementById('mainPanel').innerHTML='<div class="loading" style="color:#B91C1C">⚠️ '+e.message+'</div>';
  });
}

/* ── Render tabs ── */
function renderTabs(){
  var tabs=[
    {id:'hoje',icon:'📋',lbl:'Hoje'},
    {id:'treino',icon:'💪',lbl:'Treinos'},
    {id:'sono',icon:'😴',lbl:'Sono'},
    {id:'metricas',icon:'📏',lbl:'Métricas'},
    {id:'humor',icon:'😊',lbl:'Humor'}
  ];
  document.getElementById('secTabs').innerHTML=tabs.map(function(t){
    return '<button class="sec-tab'+(t.id===currentSection?' on':'')+'" onclick="setSection(\''+t.id+'\')">'+t.icon+' '+t.lbl+'</button>';
  }).join('');
}

function setSection(s){ currentSection=s; renderTabs(); renderSection(); }

function renderSection(){
  if(currentSection==='hoje')     renderHoje();
  else if(currentSection==='treino')   renderTreino();
  else if(currentSection==='sono')     renderSono();
  else if(currentSection==='metricas') renderMetricas();
  else if(currentSection==='humor')    renderHumor();
}

/* ── Date nav ── */
function renderDateNav(){
  return '<div class="date-nav">'+
    '<button onclick="changeDate(-1)">◀</button>'+
    '<div class="dn-center"><div class="dn-date">'+fmtDate(currentDate)+'</div>'+
    '<div class="dn-sub">'+(currentDate===todayStr()?'Hoje':'')+'</div></div>'+
    (currentDate!==todayStr()?'<button class="today-pill" onclick="goToday()">Hoje</button>':'')+
    '<button onclick="changeDate(1)"'+(currentDate===todayStr()?' disabled style="opacity:.3"':'')+'>▶</button>'+
  '</div>';
}

/* ── HOJE ── */
function renderHoje(){
  var html = renderDateNav();

  /* Overview cards */
  html += '<div class="day-overview">';

  // Treino
  var wkDone = dayWorkouts.length>0;
  html += doCard('💪','Treino',
    wkDone ? dayWorkouts.map(function(w){return w.type;}).join(', ') : null,
    wkDone ? dayWorkouts.reduce(function(s,w){return s+w.duration_min;},0)+'min total' : null,
    '#E11D48','treino');

  // Sono
  html += doCard('😴','Sono',
    daySleep ? daySleep.hours+'h' : null,
    daySleep ? 'Qualidade: '+stars(daySleep.quality) : null,
    '#9333EA','sono');

  // Peso
  html += doCard('📏','Peso',
    dayMetrics && dayMetrics.weight_kg ? dayMetrics.weight_kg+'kg' : null,
    dayMetrics ? 'Medido hoje' : null,
    '#1D4ED8','metricas');

  // Humor
  html += doCard('😊','Humor',
    dayMood ? MOOD_EMOJI[dayMood.mood]+' '+ENERGY_EMOJI[dayMood.energy] : null,
    dayMood ? 'Estresse: '+STRESS_LABELS[dayMood.stress] : null,
    '#15803D','humor');

  html += '</div>';

  /* Health goals */
  if(healthGoals.length){
    html += '<div class="health-goals">'+
      '<div class="hg-title">❤️ Metas de Saúde</div>'+
      healthGoals.slice(0,5).map(function(g){
        return '<div class="hg-row">'+
          '<span class="hg-name">'+esc(g.title)+(g.target?' <span style="font-size:.63rem;color:#aaa">'+esc(g.target)+'</span>':'')+'</span>'+
          '<div class="hg-bar-wrap"><div class="hg-bar-fill" style="width:'+(g.progress||0)+'%"></div></div>'+
          '<span class="hg-pct">'+(g.progress||0)+'%</span>'+
          '<button class="hg-inc" onclick="incGoal(\''+g.id+'\')">+10%</button>'+
        '</div>';
      }).join('')+
      '<a href="../metas/" style="font-size:.7rem;color:#E11D48;font-weight:600;text-decoration:none;display:block;margin-top:8px">Ver todas as metas de saúde →</a>'+
    '</div>';
  } else {
    html += '<div style="background:#FFF1F2;border:1px solid #FECDD3;border-radius:10px;padding:14px;margin-bottom:14px;font-size:.78rem;color:#888">'+
      '❤️ Crie metas com área <strong>Saúde</strong> no <a href="../metas/" style="color:#E11D48;font-weight:600">módulo Metas</a> para acompanhar aqui.</div>';
  }

  /* Today summary */
  html += '<div class="section-panel">'+
    '<div class="sp-header"><span class="sp-title">📋 Resumo do dia</span></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
      wkSummary()+sleepSummary()+moodSummary()+metricsSummary()+
    '</div></div>';

  document.getElementById('mainPanel').innerHTML = html;
}

function doCard(icon,lbl,val,sub,color,section){
  return '<div class="do-card'+(val?' filled':'')+'" style="--accent:'+color+'" onclick="setSection(\''+section+'\')">'+
    '<div class="do-icon">'+icon+'</div>'+
    '<div class="do-lbl">'+lbl+'</div>'+
    (val?'<div class="do-val">'+val+'</div><div class="do-sub">'+sub+'</div>':
         '<div class="do-empty">Não registrado</div>'+
         '<div style="font-size:.65rem;color:'+color+';font-weight:600;margin-top:2px">+ Adicionar</div>')+
  '</div>';
}
function wkSummary(){
  if(!dayWorkouts.length) return '<div style="color:#ccc;font-size:.75rem;padding:8px">💪 Nenhum treino registrado</div>';
  return '<div style="font-size:.78rem">'+dayWorkouts.map(function(w){
    return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">'+
      '<span style="font-size:.8rem">💪</span>'+
      '<strong>'+esc(w.type)+'</strong> · '+w.duration_min+'min · '+stars(w.intensity)+
    '</div>';
  }).join('')+'</div>';
}
function sleepSummary(){
  if(!daySleep) return '<div style="color:#ccc;font-size:.75rem;padding:8px">😴 Sono não registrado</div>';
  return '<div style="font-size:.78rem;padding:4px 0">'+
    '<div>😴 <strong>'+daySleep.hours+'h</strong> de sono</div>'+
    '<div style="margin-top:3px;color:#888">'+daySleep.bedtime+' → '+daySleep.wake_time+'</div>'+
    '<div style="margin-top:3px">Qualidade: '+stars(daySleep.quality)+'</div></div>';
}
function moodSummary(){
  if(!dayMood) return '<div style="color:#ccc;font-size:.75rem;padding:8px">😊 Humor não registrado</div>';
  return '<div style="font-size:.88rem;padding:4px 0">'+
    MOOD_EMOJI[dayMood.mood]+' Humor · '+ENERGY_EMOJI[dayMood.energy]+' Energia · '+STRESS_EMOJI[dayMood.stress]+' Estresse';
}
function metricsSummary(){
  if(!dayMetrics) return '<div style="color:#ccc;font-size:.75rem;padding:8px">📏 Métricas não registradas</div>';
  var parts=[];
  if(dayMetrics.weight_kg) parts.push('⚖️ '+dayMetrics.weight_kg+'kg');
  if(dayMetrics.waist_cm)  parts.push('Cintura: '+dayMetrics.waist_cm+'cm');
  if(dayMetrics.fat_pct)   parts.push('Gordura: '+dayMetrics.fat_pct+'%');
  return '<div style="font-size:.78rem;padding:4px 0">'+parts.join(' · ')+'</div>';
}

/* ── TREINO ── */
function renderTreino(){
  var html = renderDateNav();

  // Load 14-day history for mini chart
  html += '<div class="section-panel">'+
    '<div class="sp-header">'+
      '<span class="sp-title">💪 Treinos</span>'+
      '<button class="sp-add" onclick="openModal(\'workout\')">+ Registrar treino</button>'+
    '</div>';

  if(!dayWorkouts.length){
    html += '<div class="no-data">Nenhum treino registrado hoje.<br>Clique em + para adicionar.</div>';
  } else {
    html += '<div class="workout-list">'+dayWorkouts.map(function(w){
      var linked = healthGoals.find(function(g){return g.id===w.goal_id;});
      return '<div class="wk-item">'+
        '<div style="flex:1">'+
          '<div class="wk-type">'+esc(w.type)+'</div>'+
          (linked?'<div style="font-size:.65rem;color:#E11D48;margin-top:2px">↗ '+esc(linked.title)+'</div>':'')+
          (w.notes?'<div style="font-size:.67rem;color:#aaa;margin-top:2px">'+esc(w.notes)+'</div>':'')+
        '</div>'+
        '<div class="wk-meta">'+
          '<span class="wk-chip wk-dur">⏱ '+w.duration_min+'min</span>'+
          '<span class="wk-chip wk-int">'+INT_LABELS[w.intensity]+'</span>'+
          (w.calories_burned?'<span class="wk-chip wk-cal">🔥 '+w.calories_burned+' kcal</span>':'')+
        '</div>'+
        '<button class="wk-del" onclick="deleteWorkout(\''+w.id+'\')">×</button>'+
      '</div>';
    }).join('')+'</div>';
  }
  html += '</div>';
  renderWithHistory(html,'workouts','duration_min','min','#E11D48',14);
}

function renderWithHistory(baseHtml, table, col, unit, color, days){
  var end=currentDate, start=shiftDate(end,-days+1);
  db.from(table).select('date,'+col).then(function(rows){
    var byDate={};
    (rows||[]).forEach(function(r){ byDate[r.date]=(byDate[r.date]||0)+(parseFloat(r[col])||0); });
    var dates=[]; for(var i=days-1;i>=0;i--) dates.push(shiftDate(currentDate,-i));
    var vals=dates.map(function(d){return byDate[d]||0;});
    var maxV=Math.max.apply(null,vals.concat([1]));
    var bars=dates.map(function(d,i){
      var v=vals[i], h=v>0?Math.max(v/maxV*100,8):3;
      var p=d.split('-'), dl=p[2]+'/'+p[1];
      return '<div class="mc-col">'+
        '<div class="mc-bar" style="height:'+h+'%;background:'+(v>0?color:'#e0e0e0')+'" title="'+d+': '+v+' '+unit+'"></div>'+
        '<div class="mc-lbl">'+(i%3===0?dl:'')+'</div></div>';
    }).join('');
    document.getElementById('mainPanel').innerHTML=baseHtml+
      '<div class="section-panel chart-wrap">'+
      '<div class="chart-title">Últimos '+days+' dias</div>'+
      '<div class="mini-chart">'+bars+'</div></div>';
  }).catch(function(){ document.getElementById('mainPanel').innerHTML=baseHtml; });
}

/* ── SONO ── */
function renderSono(){
  var html = renderDateNav();
  html += '<div class="section-panel">'+
    '<div class="sp-header">'+
      '<span class="sp-title">😴 Sono</span>'+
      '<button class="sp-add" onclick="openModal(\'sleep\')">'+( daySleep?'✏ Editar':'+ Registrar')+'</button>'+
    '</div>';
  if(!daySleep){
    html += '<div class="no-data">Sono não registrado hoje.</div>';
  } else {
    html += '<div class="sleep-display">'+
      sdCard(daySleep.hours+'h','Horas')+
      sdCard(daySleep.bedtime||'—','Dormiu')+
      sdCard(daySleep.wake_time||'—','Acordou')+
      sdCard('★'.repeat(daySleep.quality)+'☆'.repeat(5-daySleep.quality),'Qualidade')+
    '</div>';
    if(daySleep.notes) html += '<div style="font-size:.75rem;color:#888;margin-top:10px;background:#f9f9f9;border-radius:7px;padding:8px">📝 '+esc(daySleep.notes)+'</div>';
  }
  html += '</div>';
  renderWithHistory(html,'sleep_logs','hours','h','#9333EA',14);
}
function sdCard(val,lbl){
  return '<div class="sd-card"><div class="sd-val">'+val+'</div><div class="sd-lbl">'+lbl+'</div></div>';
}

/* ── MÉTRICAS ── */
function renderMetricas(){
  var html = renderDateNav();
  html += '<div class="section-panel">'+
    '<div class="sp-header">'+
      '<span class="sp-title">📏 Métricas Corporais</span>'+
      '<button class="sp-add" onclick="openModal(\'metrics\')">'+( dayMetrics?'✏ Editar':'+ Registrar')+'</button>'+
    '</div>';
  if(!dayMetrics){
    html += '<div class="no-data">Nenhuma métrica registrada hoje.</div>';
  } else {
    var fields=[
      {k:'weight_kg',l:'Peso',s:'kg'},
      {k:'waist_cm',l:'Cintura',s:'cm'},
      {k:'hip_cm',l:'Quadril',s:'cm'},
      {k:'chest_cm',l:'Peito',s:'cm'},
      {k:'arm_cm',l:'Braço',s:'cm'},
      {k:'fat_pct',l:'% Gordura',s:'%'}
    ];
    html += '<div class="metrics-grid">'+fields.filter(function(f){return dayMetrics[f.k];}).map(function(f){
      return '<div class="bm-card"><div class="bm-val">'+dayMetrics[f.k]+f.s+'</div><div class="bm-lbl">'+f.l+'</div></div>';
    }).join('')+'</div>';
  }
  html += '</div>';
  renderWithHistory(html,'body_metrics','weight_kg','kg','#1D4ED8',30);
}

/* ── HUMOR ── */
function renderHumor(){
  var html = renderDateNav();
  html += '<div class="section-panel">'+
    '<div class="sp-header">'+
      '<span class="sp-title">😊 Humor &amp; Energia</span>'+
      '<button class="sp-add" onclick="openModal(\'mood\')">'+( dayMood?'✏ Editar':'+ Registrar')+'</button>'+
    '</div>';
  if(!dayMood){
    html += '<div class="no-data">Check-in de humor não feito hoje.</div>';
  } else {
    html += '<div class="mood-display">'+
      '<div class="md-card mood-c"><div class="md-emoji">'+MOOD_EMOJI[dayMood.mood]+'</div>'+
        '<div class="md-val">'+MOOD_EMOJI[dayMood.mood]+'</div><div class="md-lbl">Humor</div>'+stars(dayMood.mood)+
      '</div>'+
      '<div class="md-card energy-c"><div class="md-emoji">'+ENERGY_EMOJI[dayMood.energy]+'</div>'+
        '<div class="md-val">'+ENERGY_EMOJI[dayMood.energy]+'</div><div class="md-lbl">Energia</div>'+stars(dayMood.energy)+
      '</div>'+
      '<div class="md-card stress-c"><div class="md-emoji">'+STRESS_EMOJI[dayMood.stress]+'</div>'+
        '<div class="md-val">'+STRESS_LABELS[dayMood.stress]+'</div><div class="md-lbl">Estresse</div>'+stars(dayMood.stress)+
      '</div>'+
    '</div>';
    if(dayMood.notes) html+='<div style="font-size:.75rem;color:#888;margin-top:10px;background:#f9f9f9;border-radius:7px;padding:8px">📝 '+esc(dayMood.notes)+'</div>';
  }
  html += '</div>';
  // Mood history chart
  db.from('mood_logs').select('date,mood,energy,stress').then(function(rows){
    var byDate={};
    (rows||[]).forEach(function(r){ byDate[r.date]=r; });
    var dates=[]; for(var i=13;i>=0;i--) dates.push(shiftDate(currentDate,-i));
    var bars=dates.map(function(d,i){
      var r=byDate[d];
      var p=d.split('-'),dl=p[2]+'/'+p[1];
      if(!r) return '<div class="mc-col"><div class="mc-bar" style="height:3%;background:#e0e0e0"></div><div class="mc-lbl">'+(i%3===0?dl:'')+'</div></div>';
      var moodH=r.mood/5*100, enerH=r.energy/5*100;
      return '<div class="mc-col">'+
        '<div class="mc-bar" style="height:'+moodH+'%;background:#FDE68A" title="Humor '+r.mood+'"></div>'+
        '<div class="mc-lbl">'+(i%3===0?dl:'')+'</div></div>';
    }).join('');
    document.getElementById('mainPanel').innerHTML=html+
      '<div class="section-panel chart-wrap">'+
      '<div class="chart-title">Humor últimos 14 dias</div>'+
      '<div class="mini-chart">'+bars+'</div></div>';
  }).catch(function(){ document.getElementById('mainPanel').innerHTML=html; });
}

/* ── Modals ── */
function openModal(type){
  modalType=type;
  var titles={workout:'💪 Registrar Treino',sleep:'😴 Registrar Sono',metrics:'📏 Métricas Corporais',mood:'😊 Humor & Energia'};
  document.getElementById('modalTitle').textContent=titles[type]||'Registrar';
  document.getElementById('modalForm').innerHTML=buildForm(type);
  document.getElementById('modalBg').classList.remove('hidden');
  // Focus first input
  setTimeout(function(){ var f=document.querySelector('#modalForm input, #modalForm select'); if(f) f.focus(); },50);
}

function buildForm(type){
  if(type==='workout'){
    ratings.intensity=3;
    return '<div class="mf">'+
      '<div class="mf-field"><label>Tipo de treino</label>'+
        '<div class="workout-types">'+WORKOUT_TYPES.map(function(t){
          return '<button type="button" class="wt-opt'+(t===wkTypeSelected?' sel':'')+'" onclick="pickWkType(\''+t+'\')">'+t+'</button>';
        }).join('')+'</div></div>'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>Duração (min)</label><input id="mf-dur" type="number" min="0" placeholder="45"/></div>'+
        '<div class="mf-field"><label>Calorias gastas</label><input id="mf-cals" type="number" min="0" placeholder="300"/></div>'+
      '</div>'+
      '<div class="mf-field"><label>Intensidade</label>'+
        '<div class="rating-btns" id="intBtns">'+[1,2,3,4,5].map(function(i){
          return '<button type="button" class="rb'+(i===3?' sel':'')+'" onclick="setRating(\'intensity\','+i+',\'intBtns\')">'+i+'</button>';
        }).join('')+'</div>'+
        '<div style="font-size:.68rem;color:#888;margin-top:4px" id="intLbl">'+INT_LABELS[3]+'</div>'+
      '</div>'+
      '<div class="mf-field"><label>Vincular meta</label><select id="mf-goal">'+
        '<option value="">— Nenhuma —</option>'+
        healthGoals.map(function(g){return'<option value="'+g.id+'">'+esc(g.title)+'</option>';}).join('')+
      '</select></div>'+
      '<div class="mf-field"><label>Notas</label><input id="mf-notes" type="text" placeholder="Como foi o treino?"/></div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="saveWorkout()">Salvar</button>'+
      '</div></div>';
  }
  if(type==='sleep'){
    return '<div class="mf">'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>Dormiu às</label><input id="mf-bed" type="time" value="'+(daySleep?daySleep.bedtime:'23:00')+'"/></div>'+
        '<div class="mf-field"><label>Acordou às</label><input id="mf-wake" type="time" value="'+(daySleep?daySleep.wake_time:'07:00')+'"/></div>'+
      '</div>'+
      '<div class="mf-field"><label>Qualidade do sono</label>'+
        '<div class="rating-btns" id="qualBtns">'+[1,2,3,4,5].map(function(i){
          return '<button type="button" class="rb'+(i===(daySleep?daySleep.quality:3)?' sel':'')+'" onclick="setRating(\'quality\','+i+',\'qualBtns\')">'+i+'</button>';
        }).join('')+'</div>'+
      '</div>'+
      '<div class="mf-field"><label>Notas</label><input id="mf-notes" type="text" placeholder="Dormiu bem? Sonhos?"/></div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="saveSleep()">Salvar</button>'+
      '</div></div>';
  }
  if(type==='metrics'){
    return '<div class="mf">'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>Peso (kg)</label><input id="mf-wt" type="number" step="0.1" value="'+(dayMetrics&&dayMetrics.weight_kg||'')+'"/></div>'+
        '<div class="mf-field"><label>% Gordura</label><input id="mf-fat" type="number" step="0.1" value="'+(dayMetrics&&dayMetrics.fat_pct||'')+'"/></div>'+
      '</div>'+
      '<div class="mf-row3">'+
        '<div class="mf-field"><label>Cintura (cm)</label><input id="mf-waist" type="number" step="0.1" value="'+(dayMetrics&&dayMetrics.waist_cm||'')+'"/></div>'+
        '<div class="mf-field"><label>Quadril (cm)</label><input id="mf-hip" type="number" step="0.1" value="'+(dayMetrics&&dayMetrics.hip_cm||'')+'"/></div>'+
        '<div class="mf-field"><label>Peito (cm)</label><input id="mf-chest" type="number" step="0.1" value="'+(dayMetrics&&dayMetrics.chest_cm||'')+'"/></div>'+
      '</div>'+
      '<div class="mf-field"><label>Notas</label><input id="mf-notes" type="text" placeholder="Observações..."/></div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="saveMetrics()">Salvar</button>'+
      '</div></div>';
  }
  if(type==='mood'){
    ratings.mood=dayMood?dayMood.mood:3;
    ratings.energy=dayMood?dayMood.energy:3;
    ratings.stress=dayMood?dayMood.stress:3;
    return '<div class="mf">'+
      ratingField('Humor 😊',ratings.mood,'moodBtns','mood',MOOD_EMOJI)+
      ratingField('Energia ⚡',ratings.energy,'energyBtns','energy',ENERGY_EMOJI)+
      ratingField('Estresse 😤 (5=relaxado)',ratings.stress,'stressBtns','stress',STRESS_EMOJI)+
      '<div class="mf-field"><label>Notas</label><input id="mf-notes" type="text" placeholder="Como você está se sentindo?"/></div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="saveMood()">Salvar</button>'+
      '</div></div>';
  }
  return '';
}

function ratingField(lbl,cur,btnId,key,emojiMap){
  return '<div class="mf-field"><label>'+lbl+'</label>'+
    '<div class="rating-btns" id="'+btnId+'">'+[1,2,3,4,5].map(function(i){
      return '<button type="button" class="rb'+(i===cur?' sel':'')+'" style="font-size:1rem" onclick="setRating(\''+key+'\','+i+',\''+btnId+'\')">'+emojiMap[i]+'</button>';
    }).join('')+'</div></div>';
}

function pickWkType(t){
  wkTypeSelected=t;
  document.querySelectorAll('.wt-opt').forEach(function(el){el.classList.toggle('sel',el.textContent===t);});
}

function setRating(key,val,btnId){
  ratings[key]=val;
  document.querySelectorAll('#'+btnId+' .rb').forEach(function(el,i){el.classList.toggle('sel',i+1===val);});
  if(key==='intensity'){ var l=document.getElementById('intLbl'); if(l) l.textContent=INT_LABELS[val]; }
}

/* ── Save functions ── */
function saveWorkout(){
  var dur=parseInt(document.getElementById('mf-dur').value)||0;
  if(!dur){alert('Informe a duração.');return;}
  var calsBurned=parseInt(document.getElementById('mf-cals').value)||0;
  var data={
    id:uid(), date:currentDate, type:wkTypeSelected,
    duration_min:dur, intensity:ratings.intensity,
    calories_burned:calsBurned,
    goal_id:document.getElementById('mf-goal').value||null,
    notes:(document.getElementById('mf-notes').value||'').trim()
  };
  document.querySelector('.btn-save').textContent='Salvando...';
  db.from('workouts').insert(data).then(function(res){
    dayWorkouts.push(Array.isArray(res)?res[0]:data);
    closeModal(); renderSection();
    // Update goal progress if linked
    if(data.goal_id) incGoal(data.goal_id);
  }).catch(function(e){alert('Erro: '+e.message);document.querySelector('.btn-save').textContent='Salvar';});
}

function saveSleep(){
  var bed=document.getElementById('mf-bed').value;
  var wake=document.getElementById('mf-wake').value;
  if(!bed||!wake){alert('Informe horário de dormir e acordar.');return;}
  // Calc hours
  var bParts=bed.split(':'), wParts=wake.split(':');
  var bMin=parseInt(bParts[0])*60+parseInt(bParts[1]);
  var wMin=parseInt(wParts[0])*60+parseInt(wParts[1]);
  var diff=wMin-bMin; if(diff<0) diff+=1440;
  var hours=parseFloat((diff/60).toFixed(1));
  var data={id:uid(),date:currentDate,bedtime:bed,wake_time:wake,hours:hours,
    quality:ratings.quality,notes:(document.getElementById('mf-notes').value||'').trim()};
  var op=daySleep?db.from('sleep_logs').eq('id',daySleep.id).update(data):db.from('sleep_logs').insert(data);
  document.querySelector('.btn-save').textContent='Salvando...';
  op.then(function(res){ daySleep=Array.isArray(res)?res[0]:data; closeModal(); renderSection(); })
    .catch(function(e){alert('Erro: '+e.message);document.querySelector('.btn-save').textContent='Salvar';});
}

function saveMetrics(){
  var data={id:uid(),date:currentDate,
    weight_kg:parseFloat(document.getElementById('mf-wt').value)||null,
    fat_pct:parseFloat(document.getElementById('mf-fat').value)||null,
    waist_cm:parseFloat(document.getElementById('mf-waist').value)||null,
    hip_cm:parseFloat(document.getElementById('mf-hip').value)||null,
    chest_cm:parseFloat(document.getElementById('mf-chest').value)||null,
    notes:(document.getElementById('mf-notes').value||'').trim()
  };
  var op=dayMetrics?db.from('body_metrics').eq('id',dayMetrics.id).update(data):db.from('body_metrics').insert(data);
  document.querySelector('.btn-save').textContent='Salvando...';
  op.then(function(res){ dayMetrics=Array.isArray(res)?res[0]:data; closeModal(); renderSection(); })
    .catch(function(e){alert('Erro: '+e.message);document.querySelector('.btn-save').textContent='Salvar';});
}

function saveMood(){
  var data={id:uid(),date:currentDate,mood:ratings.mood,energy:ratings.energy,stress:ratings.stress,
    notes:(document.getElementById('mf-notes').value||'').trim()};
  var op=dayMood?db.from('mood_logs').eq('id',dayMood.id).update(data):db.from('mood_logs').insert(data);
  document.querySelector('.btn-save').textContent='Salvando...';
  op.then(function(res){ dayMood=Array.isArray(res)?res[0]:data; closeModal(); renderSection(); })
    .catch(function(e){alert('Erro: '+e.message);document.querySelector('.btn-save').textContent='Salvar';});
}

function deleteWorkout(id){
  if(!confirm('Remover este treino?'))return;
  db.from('workouts').eq('id',id).delete().then(function(){
    dayWorkouts=dayWorkouts.filter(function(w){return w.id!==id;}); renderSection();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Goal progress ── */
function incGoal(id){
  var g=healthGoals.find(function(x){return x.id===id;});
  if(!g)return;
  var newPct=Math.min(100,(g.progress||0)+10);
  db.from('goals').eq('id',id).update({progress:newPct}).then(function(){
    g.progress=newPct; renderSection();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Navigation ── */
function closeModal(){ document.getElementById('modalBg').classList.add('hidden'); modalType=null; }
function changeDate(d){ currentDate=shiftDate(currentDate,d); loadDay(); }
function goToday(){ currentDate=todayStr(); loadDay(); }

/* ── Globals ── */
window.setSection=setSection; window.changeDate=changeDate; window.goToday=goToday;
window.openModal=openModal; window.closeModal=closeModal;
window.saveWorkout=saveWorkout; window.saveSleep=saveSleep;
window.saveMetrics=saveMetrics; window.saveMood=saveMood;
window.deleteWorkout=deleteWorkout; window.incGoal=incGoal;
window.pickWkType=pickWkType; window.setRating=setRating;

document.getElementById('modalBg').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});

/* ── Init ── */
renderTabs(); loadDay();

}());
