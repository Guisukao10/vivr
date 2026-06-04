(function(){
'use strict';

/* ── Config ── */
var AREAS = [
  {id:'fin',label:'Financeiro',color:'#15803D',bg:'#F0FDF4'},
  {id:'sau',label:'Saúde',color:'#E11D48',bg:'#FFF1F2'},
  {id:'apr',label:'Aprendizado',color:'#1D4ED8',bg:'#EFF6FF'},
  {id:'rel',label:'Relacionamentos',color:'#9333EA',bg:'#FDF4FF'},
  {id:'pes',label:'Pessoal',color:'#EA580C',bg:'#FFF7ED'},
  {id:'pro',label:'Projetos',color:'#0891B2',bg:'#F0FDFA'}
];
var ICONS = ['✅','💪','📚','🧘','🏃','💧','🥗','😴','✍️','🎯','🧹','💊','🚴','🧠','❤️','🌿','🎸','💻','🙏','⭐'];
var COLORS = ['#9333EA','#1D4ED8','#15803D','#EA580C','#E11D48','#0891B2','#D97706','#059669','#DC2626','#7C3AED'];
var DAYS_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
var FREQ_LABELS = {daily:'Todo dia',weekdays:'Seg–Sex',weekend:'Fim de semana',custom:'Dias específicos'};

/* ── State ── */
var currentTab  = 'hoje';
var currentDate = todayStr();
var habits      = [];
var logsCache   = {};  // {date: [{habit_id, done, id}]}
var allGoals    = [];
var editingId   = null;
var selectedIcon  = '✅';
var selectedColor = '#9333EA';
var selectedDays  = [0,1,2,3,4,5,6];

/* ── Helpers ── */
function todayStr(){ var n=new Date(); return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate()); }
function pad(n){ return String(n).padStart(2,'0'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function areaInfo(id){ return AREAS.find(function(a){return a.id===id;})||AREAS[4]; }
function fmtDate(str){
  var p=str.split('-'); var d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  return d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
}
function shiftDate(str,days){
  var p=str.split('-'); var d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  d.setDate(d.getDate()+days);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function dayOfWeek(str){
  var p=str.split('-'); return new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2])).getDay();
}
function habitDueToday(h, dateStr){
  var dow = dayOfWeek(dateStr);
  if(h.frequency==='daily') return true;
  if(h.frequency==='weekdays') return dow>=1&&dow<=5;
  if(h.frequency==='weekend') return dow===0||dow===6;
  if(h.frequency==='custom') return (h.days_of_week||[]).indexOf(dow)!==-1;
  return true;
}

/* ── Load ── */
function loadData(){
  setLoading('Carregando hábitos...');
  Promise.all([
    db.from('habits').eq('active','true').order('sort_order',{ascending:true}).select('*'),
    db.from('habit_logs').eq('date',currentDate).select('*'),
    db.from('goals').eq('area','sau').select('id,title,progress,hz')
  ]).then(function(res){
    habits    = res[0]||[];
    var logs  = res[1]||[];
    allGoals  = res[2]||[];
    logsCache[currentDate]=logs;
    renderCurrent();
  }).catch(function(e){ setLoading('⚠️ Erro: '+e.message,'err'); });
}

function ensureDateLogs(dateStr){
  if(logsCache[dateStr]) return Promise.resolve();
  return db.from('habit_logs').eq('date',dateStr).select('*').then(function(rows){
    logsCache[dateStr]=rows||[];
  });
}

function setLoading(msg,cls){
  document.getElementById('mainPanel').innerHTML=
    '<div class="loading" style="'+(cls?'color:#B91C1C':'')+'">'+msg+'</div>';
}

/* ── Streak calc ── */
function calcStreak(habitId){
  var streak=0, d=todayStr();
  // Walk backwards from today
  for(var i=0;i<365;i++){
    var dateToCheck = shiftDate(d,-i);
    var h = habits.find(function(x){return x.id===habitId;});
    if(h && !habitDueToday(h,dateToCheck)){ continue; }
    var dayLogs = logsCache[dateToCheck];
    if(!dayLogs) break;
    var entry = dayLogs.find(function(l){return l.habit_id===habitId&&l.done;});
    if(entry){ streak++; } else { break; }
  }
  return streak;
}

function calcCompletionRate(habitId, days){
  days = days||30;
  var done=0, due=0;
  var h=habits.find(function(x){return x.id===habitId;});
  if(!h) return 0;
  for(var i=0;i<days;i++){
    var dateStr=shiftDate(todayStr(),-i);
    if(!habitDueToday(h,dateStr)) continue;
    due++;
    var dayLogs=logsCache[dateStr];
    if(dayLogs&&dayLogs.find(function(l){return l.habit_id===habitId&&l.done;})) done++;
  }
  return due>0?Math.round(done/due*100):0;
}

/* ── Render ── */
function renderCurrent(){
  if(currentTab==='hoje')     renderToday();
  else if(currentTab==='gerenciar') renderManage();
  else if(currentTab==='stats')     renderStats();
}

function renderTabs(){
  var tabs=[
    {id:'hoje',icon:'☀️',lbl:'Hoje'},
    {id:'gerenciar',icon:'⚙️',lbl:'Hábitos'},
    {id:'stats',icon:'📊',lbl:'Estatísticas'}
  ];
  document.getElementById('habTabs').innerHTML=tabs.map(function(t){
    return '<button class="hab-tab'+(t.id===currentTab?' on':'')+'" onclick="setTab(\''+t.id+'\')">'+t.icon+' '+t.lbl+'</button>';
  }).join('');
}

function renderToday(){
  var todayLogs = logsCache[currentDate]||[];
  var due = habits.filter(function(h){return habitDueToday(h,currentDate);});
  var done= due.filter(function(h){ return todayLogs.find(function(l){return l.habit_id===h.id&&l.done;}); });
  var pct = due.length>0?Math.round(done.length/due.length*100):0;
  var color = pct>=100?'#15803D':pct>=60?'#9333EA':'#bbb';

  var circum=2*Math.PI*35, dash=circum*(1-pct/100);

  var html='<div class="date-nav">'+
    '<button onclick="changeDate(-1)">◀</button>'+
    '<div class="dn-center"><div class="dn-date">'+fmtDate(currentDate)+'</div>'+
    '<div class="dn-sub">'+(currentDate===todayStr()?'Hoje':'')+'</div></div>'+
    (currentDate!==todayStr()?'<button class="today-pill" onclick="goToday()">Hoje</button>':'')+
    '<button onclick="changeDate(1)"'+(currentDate===todayStr()?' disabled style="opacity:.3"':'')+'>▶</button>'+
  '</div>';

  html+='<div class="day-progress">'+
    '<div class="dp-ring">'+
      '<svg width="80" height="80" viewBox="0 0 80 80">'+
        '<circle class="ring-bg" cx="40" cy="40" r="35"/>'+
        '<circle class="ring-fill" cx="40" cy="40" r="35" stroke="'+color+'" stroke-dasharray="'+circum.toFixed(1)+'" stroke-dashoffset="'+dash.toFixed(1)+'"/>'+
      '</svg>'+
      '<div class="dp-label"><div class="dp-pct" style="color:'+color+'">'+pct+'%</div>'+
      '<div class="dp-sub">'+done.length+'/'+due.length+'</div></div>'+
    '</div>'+
    '<div class="dp-info">'+
      '<div class="dp-title">'+(pct>=100?'🎉 Dia perfeito!':pct>=60?'💪 Quase lá!':'Vamos começar!')+'</div>'+
      '<div style="font-size:.74rem;color:#888;margin-top:3px">'+done.length+' de '+due.length+' hábitos concluídos</div>'+
      '<div class="dp-streak-row">'+
        due.filter(function(h){
          var s=calcStreak(h.id); return s>=2;
        }).slice(0,4).map(function(h){
          return '<div class="streak-chip">'+h.icon+' '+calcStreak(h.id)+'🔥</div>';
        }).join('')+
      '</div>'+
    '</div>'+
  '</div>';

  if(!due.length){
    html+='<div class="no-habits"><div class="nh-icon">✨</div>'+
      '<p>Nenhum hábito para hoje.<br>Vá em ⚙️ Hábitos para criar os seus.</p>'+
      '<button class="add-first-btn" onclick="setTab(\'gerenciar\')">Criar hábitos</button></div>';
  } else {
    html+='<div class="habit-list">'+due.map(function(h){
      var isDone=!!todayLogs.find(function(l){return l.habit_id===h.id&&l.done;});
      var area=areaInfo(h.area||'pes');
      var streak=calcStreak(h.id);
      var linked=allGoals.find(function(g){return g.id===h.goal_id;});
      return '<div class="habit-card'+(isDone?' checked':'')+'" style="border-left-color:'+h.color+'">'+
        '<div class="hc-check'+(isDone?' done':'')+'" style="'+(isDone?'background:'+h.color+';':'border-color:'+h.color)+'" onclick="toggleHabit(\''+h.id+'\')">'+
          (isDone?'✓':'')+'</div>'+
        '<div class="hc-icon">'+h.icon+'</div>'+
        '<div class="hc-body">'+
          '<div class="hc-title">'+esc(h.title)+'</div>'+
          '<div class="hc-meta">'+
            '<span class="hc-area" style="background:'+area.bg+';color:'+area.color+'">'+area.label+'</span>'+
            (streak>=2?'<span class="hc-streak">🔥 '+streak+' dias</span>':'')+
            (linked?'<span class="hc-linked">↗ '+esc(linked.title)+'</span>':'')+
            '<span class="hc-freq">'+FREQ_LABELS[h.frequency||'daily']+'</span>'+
          '</div>'+
        '</div>'+
      '</div>';
    }).join('')+'</div>';
  }

  document.getElementById('mainPanel').innerHTML=html;
}

function renderManage(){
  var html='<div class="manage-grid">'+habits.map(function(h){
    var area=areaInfo(h.area||'pes');
    var linked=allGoals.find(function(g){return g.id===h.goal_id;});
    return '<div class="manage-card" style="border-left:3px solid '+h.color+'">'+
      '<div class="mc-icon-box" style="background:'+h.color+'22">'+h.icon+'</div>'+
      '<div class="mc-body">'+
        '<div class="mc-title">'+esc(h.title)+'</div>'+
        '<div class="mc-sub">'+
          '<span style="color:'+area.color+'">'+area.label+'</span>'+
          ' · '+FREQ_LABELS[h.frequency||'daily']+
          (linked?' · <span style="color:#9333EA">↗ '+esc(linked.title)+'</span>':'')+
        '</div>'+
      '</div>'+
      '<div class="mc-actions">'+
        '<button class="hc-btn" onclick="openModal(\''+h.id+'\')">✏</button>'+
        '<button class="hc-btn del" onclick="deleteHabit(\''+h.id+'\')">🗑</button>'+
      '</div>'+
    '</div>';
  }).join('')+'</div>'+
  '<button class="add-habit-btn" onclick="openModal(null)">+ Criar novo hábito</button>';
  document.getElementById('mainPanel').innerHTML=html;
}

function renderStats(){
  // Load last 12 weeks of logs
  var endDate=todayStr(), startDate=shiftDate(endDate,-83);
  var allDates=[], d=startDate;
  while(d<=endDate){ allDates.push(d); d=shiftDate(d,1); }

  // Fetch all logs in range
  db.from('habit_logs').select('habit_id,date,done').then(function(rows){
    var logsByDate={};
    (rows||[]).forEach(function(r){
      if(!logsByDate[r.date]) logsByDate[r.date]=[];
      logsByDate[r.date].push(r);
      // update cache
      if(!logsCache[r.date]) logsCache[r.date]=[];
    });

    // Overall stats
    var totalDays=0, completedDays=0;
    allDates.forEach(function(date){
      var due=habits.filter(function(h){return habitDueToday(h,date);});
      if(!due.length) return;
      totalDays++;
      var dLogs=logsByDate[date]||[];
      var allDone=due.every(function(h){return dLogs.find(function(l){return l.habit_id===h.id&&l.done;});});
      if(allDone&&due.length>0) completedDays++;
    });

    // Best streak per habit
    var bestStreaks={};
    habits.forEach(function(h){
      var cur=0, best=0;
      allDates.forEach(function(date){
        if(!habitDueToday(h,date)) return;
        var dLogs=logsByDate[date]||[];
        if(dLogs.find(function(l){return l.habit_id===h.id&&l.done;})){ cur++; best=Math.max(best,cur); }
        else cur=0;
      });
      bestStreaks[h.id]=best;
    });

    // This week
    var weekDates=allDates.slice(-7);
    var weekDue=0, weekDone=0;
    weekDates.forEach(function(date){
      habits.forEach(function(h){
        if(!habitDueToday(h,date)) return;
        weekDue++;
        var dLogs=logsByDate[date]||[];
        if(dLogs.find(function(l){return l.habit_id===h.id&&l.done;})) weekDone++;
      });
    });
    var weekRate=weekDue>0?Math.round(weekDone/weekDue*100):0;

    var html='<div class="stats-grid">'+
      statCard(habits.length,'Hábitos ativos','')+
      statCard(completedDays+'','Dias perfeitos','últimas 12 semanas')+
      statCard(weekRate+'%','Taxa semanal','esta semana')+
      statCard(Math.max.apply(null,Object.values(bestStreaks).concat([0]))+'','Maior streak','em dias')+
    '</div>';

    // Heatmap (12 weeks × 7 days)
    html+='<div class="heatmap-wrap"><div class="hm-title">Heatmap de conclusão — últimas 12 semanas</div>'+
      '<div style="display:flex">'+
      '<div class="hm-day-labels">'+['D','S','T','Q','Q','S','S'].map(function(d){ return '<div class="hm-day-lbl">'+d+'</div>'; }).join('')+'</div>'+
      '<div style="overflow-x:auto"><div class="hm-grid">'+
      buildHeatmapCols(allDates,logsByDate)+
      '</div></div></div></div>';

    // Per-habit breakdown
    html+='<div style="background:#fff;border:1px solid #eaeaea;border-radius:12px;padding:16px">'+
      '<div style="font-size:.63rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#bbb;margin-bottom:12px">Por hábito</div>'+
      habits.map(function(h){
        var rate=weekRate;
        var due=0,done=0;
        allDates.slice(-30).forEach(function(date){
          if(!habitDueToday(h,date)) return;
          due++;
          var dLogs=logsByDate[date]||[];
          if(dLogs.find(function(l){return l.habit_id===h.id&&l.done;})) done++;
        });
        rate=due>0?Math.round(done/due*100):0;
        var streak=bestStreaks[h.id]||0;
        return '<div class="habit-stat-row">'+
          '<span class="hsr-icon">'+h.icon+'</span>'+
          '<span class="hsr-name" style="color:'+h.color+'">'+esc(h.title)+'</span>'+
          '<div class="hsr-bar"><div style="background:#f0f0f0;border-radius:4px;height:7px;overflow:hidden">'+
            '<div style="height:100%;border-radius:4px;background:'+h.color+';width:'+rate+'%"></div></div></div>'+
          '<span class="hsr-rate">'+rate+'%</span>'+
          '<span class="hsr-streak">'+streak+'🔥</span>'+
        '</div>';
      }).join('')+
    '</div>';

    document.getElementById('mainPanel').innerHTML=html;
  }).catch(function(e){ setLoading('⚠️ Erro: '+e.message); });
}

function statCard(val,lbl,sub){
  return '<div class="stat-card"><div class="sc-val">'+val+'</div><div class="sc-lbl">'+lbl+'</div>'+(sub?'<div class="sc-sub">'+sub+'</div>':'')+' </div>';
}

function buildHeatmapCols(allDates,logsByDate){
  // Group by week (Sun start)
  var weeks=[], week=[];
  allDates.forEach(function(date){
    var dow=dayOfWeek(date);
    if(dow===0&&week.length>0){ weeks.push(week); week=[]; }
    week.push(date);
  });
  if(week.length) weeks.push(week);

  return weeks.map(function(wk){
    var col='<div class="hm-col">';
    // Pad start of first week
    if(wk===weeks[0]&&wk.length<7){
      var start=dayOfWeek(wk[0]);
      for(var i=0;i<start;i++) col+='<div class="hm-cell" style="background:transparent"></div>';
    }
    wk.forEach(function(date){
      var due=habits.filter(function(h){return habitDueToday(h,date);}).length;
      var dLogs=logsByDate[date]||[];
      var done=dLogs.filter(function(l){return l.done;}).length;
      var pct=due>0?done/due:0;
      var bg=pct===0?'#f0f0f0':pct<0.5?'#DDD6FE':pct<1?'#A78BFA':'#9333EA';
      col+='<div class="hm-cell" style="background:'+bg+'" title="'+date+': '+done+'/'+due+'"></div>';
    });
    return col+'</div>';
  }).join('');
}

/* ── Toggle habit ── */
function toggleHabit(habitId){
  var todayLogs=logsCache[currentDate]||[];
  var existing=todayLogs.find(function(l){return l.habit_id===habitId;});
  var newDone=existing?!existing.done:true;

  var op;
  if(existing){
    op=db.from('habit_logs').eq('id',existing.id).update({done:newDone});
  } else {
    var row={id:uid(),habit_id:habitId,date:currentDate,done:true};
    op=db.from('habit_logs').upsert(row);
  }

  op.then(function(){
    if(existing){ existing.done=newDone; }
    else { if(!logsCache[currentDate]) logsCache[currentDate]=[]; logsCache[currentDate].push({id:uid(),habit_id:habitId,date:currentDate,done:true}); }
    renderToday();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Modal ── */
function openModal(id){
  editingId=id;
  var h=id?habits.find(function(x){return x.id===id;}):null;
  selectedIcon  = h?h.icon:'✅';
  selectedColor = h?h.color:'#9333EA';
  selectedDays  = h?(h.days_of_week||[0,1,2,3,4,5,6]):[0,1,2,3,4,5,6];

  var freq=h?h.frequency:'daily';

  document.getElementById('modalTitle').textContent=(id?'Editar':'Novo')+' Hábito';
  document.getElementById('modalForm').innerHTML=
    '<div class="mf">'+
      '<div class="mf-field"><label>Nome *</label><input id="mf-title" type="text" placeholder="Ex: Meditar, Ler, Exercitar..." value="'+esc(h?h.title:'')+'"/></div>'+
      '<div class="mf-field"><label>Ícone</label>'+
        '<div class="icon-picker" id="iconPicker">'+
          ICONS.map(function(ic){return'<span class="icon-opt'+(ic===selectedIcon?' sel':'')+'" onclick="pickIcon(\''+ic+'\')">'+ic+'</span>';}).join('')+
        '</div>'+
      '</div>'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>Cor</label>'+
          '<div class="color-picker" id="colorPicker">'+
            COLORS.map(function(c){return'<div class="color-opt'+(c===selectedColor?' sel':'')+'" style="background:'+c+'" onclick="pickColor(\''+c+'\')"></div>';}).join('')+
          '</div>'+
        '</div>'+
        '<div class="mf-field"><label>Área</label><select id="mf-area">'+
          AREAS.map(function(a){return'<option value="'+a.id+'"'+(h&&h.area===a.id?' selected':'')+'>'+a.label+'</option>';}).join('')+
        '</select></div>'+
      '</div>'+
      '<div class="mf-field"><label>Frequência</label>'+
        '<select id="mf-freq" onchange="toggleDaysPicker()">'+
          Object.entries(FREQ_LABELS).map(function(e){return'<option value="'+e[0]+'"'+(freq===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+
        '</select>'+
      '</div>'+
      '<div class="mf-field" id="daysPicker" style="'+(freq!=='custom'?'display:none':'')+'"><label>Dias da semana</label>'+
        '<div class="days-picker">'+
          DAYS_LABELS.map(function(d,i){return'<button type="button" class="day-opt'+(selectedDays.indexOf(i)!==-1?' sel':'')+'" onclick="toggleDay('+i+')">'+d+'</button>';}).join('')+
        '</div>'+
      '</div>'+
      '<div class="mf-field"><label>Meta vinculada (opcional)</label><select id="mf-goal">'+
        '<option value="">— Nenhuma —</option>'+
        allGoals.filter(function(g){return g.hz!=='diario';}).map(function(g){return'<option value="'+g.id+'"'+(h&&h.goal_id===g.id?' selected':'')+'>'+esc(g.title)+'</option>';}).join('')+
      '</select></div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="saveHabit()">'+(id?'Salvar':'Criar hábito')+'</button>'+
      '</div>'+
    '</div>';

  document.getElementById('modalBg').classList.remove('hidden');
  document.getElementById('mf-title').focus();
}

function pickIcon(ic){
  selectedIcon=ic;
  document.querySelectorAll('.icon-opt').forEach(function(el){ el.classList.toggle('sel',el.textContent===ic); });
}
function pickColor(c){
  selectedColor=c;
  document.querySelectorAll('.color-opt').forEach(function(el){ el.classList.toggle('sel',el.style.background===c||el.style.background.replace(/\s/g,'')===c); });
}
function toggleDay(i){
  var idx=selectedDays.indexOf(i);
  if(idx!==-1) selectedDays.splice(idx,1); else selectedDays.push(i);
  document.querySelectorAll('.day-opt').forEach(function(el,j){ el.classList.toggle('sel',selectedDays.indexOf(j)!==-1); });
}
function toggleDaysPicker(){
  var f=document.getElementById('mf-freq').value;
  document.getElementById('daysPicker').style.display=f==='custom'?'':'none';
}
function closeModal(){ document.getElementById('modalBg').classList.add('hidden'); editingId=null; }

function saveHabit(){
  var title=(document.getElementById('mf-title').value||'').trim();
  if(!title){alert('Digite o nome do hábito.');return;}
  var freq=document.getElementById('mf-freq').value;
  var data={
    title:title, icon:selectedIcon, color:selectedColor,
    area:document.getElementById('mf-area').value,
    frequency:freq,
    days_of_week:selectedDays.slice().sort(),
    goal_id:document.getElementById('mf-goal').value||null,
    active:true
  };
  var op;
  if(editingId){
    op=db.from('habits').eq('id',editingId).update(data);
  } else {
    data.id=uid(); data.sort_order=habits.length;
    op=db.from('habits').insert(data);
  }
  document.querySelector('.btn-save').textContent='Salvando...';
  op.then(function(res){
    if(editingId){
      var idx=habits.findIndex(function(h){return h.id===editingId;});
      if(idx!==-1) habits[idx]=Object.assign(habits[idx],data);
    } else {
      habits.push(Array.isArray(res)?res[0]:data);
    }
    closeModal(); renderCurrent();
  }).catch(function(e){alert('Erro: '+e.message);document.querySelector('.btn-save').textContent='Criar hábito';});
}

function deleteHabit(id){
  if(!confirm('Remover este hábito? O histórico também será apagado.'))return;
  db.from('habits').eq('id',id).delete().then(function(){
    habits=habits.filter(function(h){return h.id!==id;});
    renderCurrent();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Navigation ── */
function setTab(t){ currentTab=t; renderTabs(); renderCurrent(); }
function changeDate(d){
  currentDate=shiftDate(currentDate,d);
  ensureDateLogs(currentDate).then(function(){ renderToday(); });
}
function goToday(){ currentDate=todayStr(); renderToday(); }

/* ── Globals ── */
window.setTab=setTab; window.changeDate=changeDate; window.goToday=goToday;
window.toggleHabit=toggleHabit; window.openModal=openModal; window.closeModal=closeModal;
window.saveHabit=saveHabit; window.deleteHabit=deleteHabit;
window.pickIcon=pickIcon; window.pickColor=pickColor; window.toggleDay=toggleDay;
window.toggleDaysPicker=toggleDaysPicker;

document.getElementById('modalBg').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});

/* ── Init ── */
renderTabs(); loadData();

}());
