(function(){
'use strict';

/* ── Areas config ── */
var AREAS = [
  { id:'fin', label:'Financeiro',      color:'#15803D', bg:'#F0FDF4' },
  { id:'sau', label:'Saúde',           color:'#E11D48', bg:'#FFF1F2' },
  { id:'apr', label:'Aprendizado',     color:'#1D4ED8', bg:'#EFF6FF' },
  { id:'rel', label:'Relacionamentos', color:'#9333EA', bg:'#FDF4FF' },
  { id:'pes', label:'Pessoal',         color:'#EA580C', bg:'#FFF7ED' },
  { id:'pro', label:'Projetos',        color:'#0891B2', bg:'#F0FDFA' }
];

var HORIZONS = [
  { id:'decada', icon:'🔭', label:'10 Anos',  title:'Visão de 10 Anos',   desc:'Onde você quer estar daqui a 10 anos?'  },
  { id:'anual',  icon:'📅', label:'Anual',    title:'Metas Anuais',       desc:'O que você vai conquistar este ano?'    },
  { id:'mensal', icon:'🗓', label:'Mensal',   title:'Compromissos do Mês',desc:'Foco e prioridades deste mês'           },
  { id:'semanal',icon:'📋', label:'Semanal',  title:'Semana em Foco',     desc:'Suas prioridades desta semana'         },
  { id:'diario', icon:'✅', label:'Hoje',     title:'Plano do Dia',       desc:'O que você vai fazer hoje?'            }
];

/* ── State ── */
var currentHz = 'decada';
var editingId = null;
var allGoals  = [];   // cache
var allTasks  = [];   // daily tasks cache
var todayChecks = {}; // {task_id: true/false}

function todayKey(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }
function uid()     { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function areaInfo(id){ return AREAS.find(function(a){return a.id===id;})||AREAS[4]; }
function hzInfo(id)  { return HORIZONS.find(function(h){return h.id===id;})||HORIZONS[0]; }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function brl(v){ return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function formatToday(){ return new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}); }

/* ── Loading state ── */
function setLoading(msg) {
  document.getElementById('mainPanel').innerHTML =
    '<div style="text-align:center;padding:40px;color:#bbb;font-size:.82rem">'+
    '<div style="font-size:1.4rem;margin-bottom:10px">⏳</div>'+(msg||'Carregando...')+'</div>';
}
function showError(msg) {
  document.getElementById('mainPanel').innerHTML =
    '<div style="text-align:center;padding:40px;color:#B91C1C;font-size:.82rem">'+
    '<div style="font-size:1.4rem;margin-bottom:10px">⚠️</div>'+msg+'</div>';
}

/* ── Data loading ── */
function loadAll() {
  setLoading('Carregando metas...');
  return Promise.all([
    db.from('goals').order('created_at',{ascending:true}).select('*'),
    db.from('daily_tasks').eq('active','true').order('sort_order',{ascending:true}).select('*'),
    db.from('daily_checks').eq('date', todayKey()).select('*')
  ]).then(function(results){
    allGoals = results[0] || [];
    allTasks = results[1] || [];
    var checks = results[2] || [];
    todayChecks = {};
    checks.forEach(function(c){ if(c.done) todayChecks[c.task_id]=true; });
    render();
  }).catch(function(e){
    showError('Erro ao conectar com Supabase:<br>'+e.message);
  });
}

/* ── Financial connection ── */
function readFinancialData() {
  var ganhoOvr = parseFloat(localStorage.getItem('cf_sim_ganho_v1')||'0')||0;
  return { ganho: ganhoOvr };
}

/* ── Render ── */
function render() {
  renderHorizonTabs();
  renderConnectionBar();
  renderOverview();
  renderCascade();
  if (currentHz === 'diario') renderDailyPanel();
  else renderGoalsPanel();
}

function renderHorizonTabs() {
  document.getElementById('horizonTabs').innerHTML = HORIZONS.map(function(h){
    return '<button class="hz-btn'+(h.id===currentHz?' on':'')+'" onclick="setHz(\''+h.id+'\')">'+
      '<span class="hz-icon">'+h.icon+'</span><span class="hz-label">'+h.label+'</span></button>';
  }).join('');
}

function renderConnectionBar() {
  var fin   = readFinancialData();
  var cur   = allGoals.filter(function(g){ return g.hz===currentHz; });
  var done  = cur.filter(function(g){ return g.progress>=100; }).length;
  var annual= allGoals.filter(function(g){ return g.hz==='anual'; });
  var annDone=annual.filter(function(g){ return g.progress>=100; }).length;

  document.getElementById('connBar').innerHTML =
    conn('💰','Financeiro',fin.ganho>0?brl(fin.ganho)+'/mês':'—',fin.ganho>0?'Receita planejada':'Configure no módulo financeiro','#15803D')+
    conn('🎯','Metas Ativas',cur.length,'no horizonte atual','#1D4ED8')+
    conn('✅','Concluídas',done+' / '+cur.length,'horizonte atual','#9333EA')+
    conn('📅','Metas Anuais',annual.length,annDone+' concluídas','#EA580C');
}
function conn(icon,lbl,val,sub,color){
  return '<div class="conn-card"><div class="conn-dot" style="background:'+color+'"></div>'+
    '<div><div class="conn-lbl">'+icon+' '+lbl+'</div><div class="conn-val">'+val+'</div><div class="conn-sub">'+sub+'</div></div></div>';
}

function renderOverview(){
  document.getElementById('overviewGrid').innerHTML = HORIZONS.map(function(h){
    var t=allGoals.filter(function(g){return g.hz===h.id;}).length;
    var d=allGoals.filter(function(g){return g.hz===h.id&&g.progress>=100;}).length;
    var p=t>0?Math.round(d/t*100):0;
    return '<div class="ov-card"><div class="ov-num">'+t+'</div><div class="ov-lbl">'+h.icon+' '+h.label+'</div>'+
      '<div class="ov-bar"><div class="ov-bar-fill" style="width:'+p+'%"></div></div></div>';
  }).join('');
}

function renderCascade(){
  document.getElementById('cascade').innerHTML =
    '<div class="cascade-title">Hierarquia de metas — do macro ao micro</div>'+
    '<div class="cascade-row">'+HORIZONS.map(function(h,i){
      return (i>0?'<span class="cascade-arrow">→</span>':'')+
        '<span class="cascade-step'+(h.id===currentHz?' cur':'')+'" onclick="setHz(\''+h.id+'\')">'+h.icon+' '+h.label+'</span>';
    }).join('')+'</div>';
}

function renderGoalsPanel() {
  var hz    = hzInfo(currentHz);
  var goals = allGoals.filter(function(g){ return g.hz===currentHz; });
  var parentHzIdx = HORIZONS.findIndex(function(h){return h.id===currentHz;});
  var parentHz    = parentHzIdx>0?HORIZONS[parentHzIdx-1]:null;

  var header = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">'+
    '<div><div style="font-size:1rem;font-weight:700">'+hz.icon+' '+hz.title+'</div>'+
    '<div style="font-size:.73rem;color:#aaa;margin-top:2px">'+hz.desc+'</div></div>'+
    '<button class="add-goal-btn" style="width:auto;padding:8px 16px" onclick="openModal(null)">+ Adicionar meta</button></div>';

  var cards = goals.length === 0
    ? '<div class="no-goals">'+hz.icon+'<br><br>Nenhuma meta em <strong>'+hz.title+'</strong>.<br>'+
      '<button class="add-goal-btn" style="max-width:300px;margin:14px auto 0" onclick="openModal(null)">+ Criar primeira meta</button></div>'
    : '<div class="goals-grid">'+goals.slice().sort(function(a,b){
        if(a.progress>=100&&b.progress<100) return 1;
        if(b.progress>=100&&a.progress<100) return -1;
        return 0;
      }).map(function(g){ return goalCard(g); }).join('')+'</div>';

  document.getElementById('mainPanel').innerHTML = header + cards;
}

function goalCard(g) {
  var area  = areaInfo(g.area||'pes');
  var pct   = Math.min(g.progress||0,100);
  var done  = pct>=100;
  var parent= g.parent_id ? allGoals.find(function(x){return x.id===g.parent_id;}) : null;
  var children=allGoals.filter(function(x){return x.parent_id===g.id;});
  var statusCls = done?'status-done':pct>=80?'status-close':pct>0?'status-active':'status-pending';

  return '<div class="goal-card '+statusCls+(done?' done':'')+'" id="gc-'+g.id+'">'+
    '<div class="gc-area">'+
      '<div class="gc-area-dot" style="background:'+area.color+'"></div>'+
      '<span class="gc-area-name" style="color:'+area.color+'">'+area.label+'</span>'+
      (done?'<span style="margin-left:auto;font-size:.65rem;font-weight:700;color:#15803D">✓ Concluída</span>':'')+
    '</div>'+
    '<div class="gc-title">'+esc(g.title)+'</div>'+
    (g.description?'<div class="gc-desc">'+esc(g.description)+'</div>':'')+
    '<div class="gc-progress">'+
      '<div class="gc-prog-header"><span style="font-size:.7rem;color:#888">Progresso</span>'+
      '<span class="gc-prog-pct" style="color:'+area.color+'">'+pct+'%</span></div>'+
      '<div class="gc-prog-track"><div class="gc-prog-fill" style="width:'+pct+'%;background:'+area.color+'"></div></div>'+
    '</div>'+
    '<div class="gc-meta">'+
      (g.target?'<span class="gc-tag">🎯 '+esc(g.target)+'</span>':'')+
      (g.deadline?'<span class="gc-date">📅 '+esc(g.deadline)+'</span>':'')+
      (children.length?'<span class="gc-tag linked">'+children.length+' sub-meta'+(children.length>1?'s':'')+'</span>':'')+
    '</div>'+
    (parent?'<div class="gc-linked-badge">↗ '+esc(parent.title)+'</div>':'')+
    '<div class="gc-actions">'+
      '<button class="gc-btn" onclick="openModal(\''+g.id+'\')">✏ Editar</button>'+
      (pct<100?'<button class="gc-btn done-btn" onclick="markDone(\''+g.id+'\')">✓ Concluir</button>':'')+
      '<button class="gc-btn del-btn" onclick="deleteGoal(\''+g.id+'\')">🗑</button>'+
    '</div>'+
  '</div>';
}

/* ── Daily panel ── */
function renderDailyPanel() {
  var weeklyGoals = allGoals.filter(function(g){return g.hz==='semanal'&&g.progress<100;});
  var done   = allTasks.filter(function(t){return todayChecks[t.id];}).length;
  var total  = allTasks.length;
  var pct    = total>0?Math.round(done/total*100):0;

  var header = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">'+
    '<div><div style="font-size:1rem;font-weight:700">✅ Plano do Dia</div>'+
    '<div style="font-size:.73rem;color:#aaa;margin-top:2px">'+formatToday()+'</div></div>'+
    '<button class="add-goal-btn" style="width:auto;padding:8px 16px" onclick="openDailyModal()">+ Adicionar tarefa</button></div>';

  var progress = total>0?'<div style="background:#fff;border:1px solid #eaeaea;border-radius:10px;padding:14px;margin-bottom:14px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
      '<span style="font-size:.78rem;font-weight:600;color:#555">Progresso de hoje</span>'+
      '<span style="font-size:.88rem;font-weight:800;color:'+(pct>=100?'#15803D':pct>=50?'#EF9F27':'#1D4ED8')+'">'+done+'/'+total+' — '+pct+'%</span></div>'+
    '<div style="background:#f0f0f0;border-radius:5px;height:10px;overflow:hidden">'+
      '<div style="height:100%;border-radius:5px;background:'+(pct>=100?'#15803D':pct>=50?'#EF9F27':'#1D4ED8')+';width:'+pct+'%;transition:width .5s"></div></div>'+
    (pct>=100?'<div style="text-align:center;margin-top:8px;font-size:.75rem;font-weight:600;color:#15803D">🎉 Missão cumprida hoje!</div>':'')+
  '</div>':'';

  var tasksHtml='<div class="today-section"><div class="ts-header">Tarefas do dia <span style="font-size:.7rem;font-weight:600;color:#1D4ED8">'+done+'/'+total+'</span></div>';
  if(!allTasks.length){
    tasksHtml+='<div class="no-goals" style="padding:12px">Nenhuma tarefa. Clique em + para adicionar.</div>';
  } else {
    allTasks.forEach(function(t){
      var isDone=!!todayChecks[t.id];
      var area=areaInfo(t.area||'pes');
      tasksHtml+='<div class="task-item">'+
        '<div class="task-check'+(isDone?' checked':'')+'" onclick="toggleDaily(\''+t.id+'\')">'+( isDone?'✓':'')+'</div>'+
        '<div style="flex:1"><div class="task-text'+(isDone?' checked':'')+'">'+esc(t.title)+'</div>'+
        (t.note?'<div style="font-size:.67rem;color:#bbb;margin-top:2px">'+esc(t.note)+'</div>':'')+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:5px">'+
          '<span class="task-area" style="background:'+area.bg+';color:'+area.color+'">'+area.label+'</span>'+
          '<button onclick="deleteTask(\''+t.id+'\')" style="border:none;background:none;color:#ddd;cursor:pointer;font-size:.8rem;padding:2px">×</button>'+
        '</div></div>';
    });
  }
  tasksHtml+='</div>';

  var weekHtml='<div class="today-section"><div class="ts-header">Metas da semana</div>';
  if(!weeklyGoals.length){
    weekHtml+='<div class="no-goals" style="padding:12px">Nenhuma meta semanal ativa.<br><a href="#" onclick="setHz(\'semanal\');return false" style="color:#1D4ED8;font-size:.75rem">Definir metas →</a></div>';
  } else {
    weeklyGoals.slice(0,5).forEach(function(g){
      var area=areaInfo(g.area||'fin');
      weekHtml+='<div class="task-item">'+
        '<div style="flex:1">'+
          '<div style="font-size:.78rem;font-weight:600;color:#333">'+esc(g.title)+'</div>'+
          '<div style="margin-top:5px;background:#f0f0f0;border-radius:4px;height:5px;overflow:hidden">'+
            '<div style="height:100%;border-radius:4px;background:'+area.color+';width:'+(g.progress||0)+'%"></div></div>'+
        '</div>'+
        '<span style="font-size:.72rem;font-weight:700;color:'+area.color+';min-width:32px;text-align:right">'+(g.progress||0)+'%</span>'+
        '<button onclick="quickProgress(\''+g.id+'\')" style="padding:3px 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;font-size:.65rem;cursor:pointer;color:#555;font-family:inherit">+10%</button>'+
      '</div>';
    });
  }
  weekHtml+='</div>';

  document.getElementById('mainPanel').innerHTML = header+progress+'<div class="today-grid">'+tasksHtml+weekHtml+'</div>';
}

/* ── Modal ── */
function openModal(id) {
  editingId = id;
  var g = id ? allGoals.find(function(x){return x.id===id;}) : null;
  var hz = hzInfo(currentHz);
  var parentHzIdx = HORIZONS.findIndex(function(h){return h.id===currentHz;});
  var parentHz    = parentHzIdx>0?HORIZONS[parentHzIdx-1]:null;
  var parentGoals = parentHz?allGoals.filter(function(x){return x.hz===parentHz.id;}):[];

  var parentSelect = parentGoals.length?
    '<div class="mf-field"><label>Vinculada a ('+parentHz.label+')</label>'+
    '<select id="mf-parent"><option value="">— Não vinculada —</option>'+
    parentGoals.map(function(p){return'<option value="'+p.id+'"'+(g&&g.parent_id===p.id?' selected':'')+'>'+esc(p.title)+'</option>';}).join('')+
    '</select></div>':'';

  document.getElementById('modalTitle').textContent=(id?'Editar':'Nova')+' meta — '+hz.icon+' '+hz.label;
  document.getElementById('modalForm').innerHTML=
    '<div class="mf">'+
      '<div class="mf-field"><label>Título *</label><input id="mf-title" type="text" placeholder="O que você quer alcançar?" value="'+esc(g?g.title:'')+'"/></div>'+
      '<div class="mf-field"><label>Descrição</label><textarea id="mf-desc" placeholder="Detalhes, motivação...">'+esc(g?g.description:'')+'</textarea></div>'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>Área</label><select id="mf-area">'+
          AREAS.map(function(a){return'<option value="'+a.id+'"'+(g&&g.area===a.id?' selected':'')+'>'+a.label+'</option>';}).join('')+
        '</select></div>'+
        '<div class="mf-field"><label>Prazo</label><input id="mf-deadline" type="text" placeholder="Ex: Dez/2026" value="'+esc(g?g.deadline:'')+'"/></div>'+
      '</div>'+
      '<div class="mf-field"><label>Meta quantitativa</label><input id="mf-target" type="text" placeholder="Ex: R$ 50.000, 10kg, 12 livros" value="'+esc(g?g.target:'')+'"/></div>'+
      parentSelect+
      '<div class="mf-field"><label>Progresso: <span id="mf-pct-val" style="color:#1D4ED8;font-weight:700">'+(g?g.progress:0)+'%</span></label>'+
        '<input type="range" id="mf-progress" min="0" max="100" step="5" value="'+(g?g.progress:0)+'" oninput="document.getElementById(\'mf-pct-val\').textContent=this.value+\'%\'"/></div>'+
      '<div class="mf-field"><label>Notas</label><textarea id="mf-notes" placeholder="Observações, próximos passos...">'+esc(g?g.notes:'')+'</textarea></div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="saveGoal()">'+(id?'Salvar alterações':'Criar meta')+'</button>'+
      '</div>'+
    '</div>';

  document.getElementById('modalBg').classList.remove('hidden');
  document.getElementById('mf-title').focus();
}

function openDailyModal() {
  editingId='__daily__';
  document.getElementById('modalTitle').textContent='➕ Nova tarefa recorrente';
  document.getElementById('modalForm').innerHTML=
    '<div class="mf">'+
      '<div class="mf-field"><label>Tarefa *</label><input id="mf-title" type="text" placeholder="O que você faz todo dia?"/></div>'+
      '<div class="mf-field"><label>Área</label><select id="mf-area">'+
        AREAS.map(function(a){return'<option value="'+a.id+'">'+a.label+'</option>';}).join('')+
      '</select></div>'+
      '<div class="mf-field"><label>Nota</label><input id="mf-note" type="text" placeholder="Contexto opcional"/></div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="saveDailyTask()">Adicionar</button>'+
      '</div></div>';
  document.getElementById('modalBg').classList.remove('hidden');
  document.getElementById('mf-title').focus();
}

function closeModal(){ document.getElementById('modalBg').classList.add('hidden'); editingId=null; }

/* ── CRUD with Supabase ── */
function saveGoal() {
  var title=(document.getElementById('mf-title').value||'').trim();
  if(!title){alert('Digite um título.');return;}
  var pe=document.getElementById('mf-parent');
  var data={
    hz:currentHz, title:title,
    description:(document.getElementById('mf-desc').value||'').trim(),
    area:document.getElementById('mf-area').value,
    deadline:(document.getElementById('mf-deadline').value||'').trim(),
    target:(document.getElementById('mf-target').value||'').trim(),
    progress:parseInt(document.getElementById('mf-progress').value)||0,
    notes:document.getElementById('mf-notes')?(document.getElementById('mf-notes').value||'').trim():'',
    parent_id:pe?(pe.value||null):null
  };

  var op;
  if(editingId){
    op = db.from('goals').eq('id',editingId).update(data);
  } else {
    data.id = uid();
    op = db.from('goals').insert(data);
  }

  document.querySelector('.btn-save').textContent='Salvando...';
  op.then(function(res){
    // update cache
    if(editingId){
      var idx=allGoals.findIndex(function(g){return g.id===editingId;});
      if(idx!==-1) allGoals[idx]=Object.assign(allGoals[idx],data);
    } else {
      allGoals.push(Array.isArray(res)?res[0]:data);
    }
    closeModal(); render();
  }).catch(function(e){ alert('Erro ao salvar: '+e.message); document.querySelector('.btn-save').textContent='Salvar'; });
}

function saveDailyTask() {
  var title=(document.getElementById('mf-title').value||'').trim();
  if(!title){alert('Digite uma tarefa.');return;}
  var data={id:uid(),title:title,area:document.getElementById('mf-area').value,note:(document.getElementById('mf-note').value||'').trim(),active:true,sort_order:allTasks.length};
  db.from('daily_tasks').insert(data).then(function(res){
    allTasks.push(Array.isArray(res)?res[0]:data);
    closeModal(); renderDailyPanel();
  }).catch(function(e){alert('Erro: '+e.message);});
}

function deleteGoal(id){
  if(!confirm('Remover esta meta?'))return;
  db.from('goals').eq('id',id).delete().then(function(){
    allGoals=allGoals.filter(function(g){return g.id!==id;});
    render();
  }).catch(function(e){alert('Erro: '+e.message);});
}

function deleteTask(id){
  if(!confirm('Remover esta tarefa?'))return;
  db.from('daily_tasks').eq('id',id).delete().then(function(){
    allTasks=allTasks.filter(function(t){return t.id!==id;});
    renderDailyPanel();
  }).catch(function(e){alert('Erro: '+e.message);});
}

function markDone(id){
  db.from('goals').eq('id',id).update({progress:100}).then(function(){
    var g=allGoals.find(function(x){return x.id===id;});
    if(g) g.progress=100;
    render();
  }).catch(function(e){alert('Erro: '+e.message);});
}

function toggleDaily(taskId){
  var today=todayKey();
  var isDone=!!todayChecks[taskId];
  var newDone=!isDone;
  // Upsert daily_check
  db.from('daily_checks').upsert({id:uid(),task_id:taskId,date:today,done:newDone})
    .then(function(){
      todayChecks[taskId]=newDone;
      renderDailyPanel();
    }).catch(function(e){alert('Erro: '+e.message);});
}

function quickProgress(id){
  var g=allGoals.find(function(x){return x.id===id;});
  if(!g)return;
  var newPct=Math.min(100,(g.progress||0)+10);
  db.from('goals').eq('id',id).update({progress:newPct}).then(function(){
    g.progress=newPct; renderDailyPanel(); renderOverview();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Globals ── */
window.setHz=setHz;
window.openModal=openModal;
window.openDailyModal=openDailyModal;
window.closeModal=closeModal;
window.saveGoal=saveGoal;
window.saveDailyTask=saveDailyTask;
window.deleteGoal=deleteGoal;
window.deleteTask=deleteTask;
window.markDone=markDone;
window.toggleDaily=toggleDaily;
window.quickProgress=quickProgress;

function setHz(id){ currentHz=id; render(); }

document.getElementById('modalBg').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});

/* ── Init ── */
loadAll();

}());
