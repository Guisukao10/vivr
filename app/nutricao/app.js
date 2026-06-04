(function(){
'use strict';

/* ── Config ── */
var MEALS = [
  { id:'cafe',   icon:'☀️', label:'Café da Manhã' },
  { id:'almoco', icon:'🍽',  label:'Almoço'        },
  { id:'jantar', icon:'🌙',  label:'Jantar'         },
  { id:'lanche', icon:'🍎',  label:'Lanches'        }
];
var MACRO_COLORS = { cal:'#EA580C', pro:'#15803D', car:'#1D4ED8', fat:'#9333EA', water:'#1D4ED8' };

/* ── State ── */
var currentTab  = 'hoje';
var currentDate = todayStr();
var nutGoals    = { calories:2000, protein_g:150, carbs_g:200, fat_g:65, water_ml:2500 };
var dayLogs     = [];   // nutrition_logs for currentDate
var waterLogs   = [];   // water_logs for currentDate
var savedFoods  = [];   // saved_foods cache
var metaGoals   = [];   // nutrition goals from goals table
var openMeals   = { cafe:true, almoco:true, jantar:true, lanche:true };
var addingMeal  = null;

/* ── Date helpers ── */
function todayStr(){ var n=new Date(); return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate()); }
function pad(n){ return String(n).padStart(2,'0'); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function fmtDate(str){
  var p=str.split('-'); var d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  return d.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
}
function isToday(str){ return str===todayStr(); }
function shiftDate(str,days){
  var p=str.split('-'); var d=new Date(parseInt(p[0]),parseInt(p[1])-1,parseInt(p[2]));
  d.setDate(d.getDate()+days);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ── Totals ── */
function dayTotals(){
  var t={calories:0,protein_g:0,carbs_g:0,fat_g:0};
  dayLogs.forEach(function(l){
    t.calories  +=(l.calories||0);
    t.protein_g +=(parseFloat(l.protein_g)||0);
    t.carbs_g   +=(parseFloat(l.carbs_g)||0);
    t.fat_g     +=(parseFloat(l.fat_g)||0);
  });
  return t;
}
function waterTotal(){
  return waterLogs.reduce(function(s,w){ return s+(w.amount_ml||0); },0);
}
function mealTotals(mealId){
  var t={calories:0,protein_g:0,carbs_g:0,fat_g:0};
  dayLogs.filter(function(l){return l.meal_type===mealId;}).forEach(function(l){
    t.calories +=(l.calories||0); t.protein_g+=(parseFloat(l.protein_g)||0);
    t.carbs_g  +=(parseFloat(l.carbs_g)||0); t.fat_g+=(parseFloat(l.fat_g)||0);
  });
  return t;
}

/* ── Load data ── */
function loadDay(){
  document.getElementById('dayPanel').innerHTML='<div class="loading">⏳ Carregando...</div>';
  Promise.all([
    db.from('nutrition_goals').eq('id','default').select('*'),
    db.from('nutrition_logs').eq('date',currentDate).order('created_at',{ascending:true}).select('*'),
    db.from('water_logs').eq('date',currentDate).select('*'),
    db.from('saved_foods').order('use_count',{ascending:false}).limit(20).select('*'),
    db.from('goals').eq('area','sau').select('*')
  ]).then(function(res){
    if(res[0]&&res[0][0]) nutGoals=res[0][0];
    dayLogs    = res[1]||[];
    waterLogs  = res[2]||[];
    savedFoods = res[3]||[];
    metaGoals  = (res[4]||[]).filter(function(g){return g.hz!=='diario';});
    renderDay();
  }).catch(function(e){
    document.getElementById('dayPanel').innerHTML='<div class="loading" style="color:#B91C1C">⚠️ Erro: '+e.message+'</div>';
  });
}

function loadHistory(){
  document.getElementById('dayPanel').innerHTML='<div class="loading">⏳ Carregando histórico...</div>';
  // Last 14 days
  var days=[], d=new Date(); for(var i=13;i>=0;i--){var x=new Date(d);x.setDate(d.getDate()-i);days.push(x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()));}
  db.from('nutrition_logs').select('date,calories').then(function(rows){
    var byDay={};
    (rows||[]).forEach(function(r){ byDay[r.date]=(byDay[r.date]||0)+(r.calories||0); });
    var html='<div class="hist-grid">';
    days.forEach(function(day){
      var cal=byDay[day]||0;
      var p=nutGoals.calories>0?Math.min(cal/nutGoals.calories*100,100):0;
      var color=cal===0?'#e0e0e0':p>=90?'#15803D':p>=60?'#EA580C':'#1D4ED8';
      var dp=day.split('-');
      var dlbl=new Date(parseInt(dp[0]),parseInt(dp[1])-1,parseInt(dp[2])).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
      html+='<div class="hist-day" onclick="goDate(\''+day+'\')">'+
        '<div class="hd-date">'+dlbl+'</div>'+
        '<div class="hd-cal" style="color:'+color+'">'+cal+'</div>'+
        '<div class="hd-bar"><div class="hd-fill" style="width:'+p.toFixed(0)+'%;background:'+color+'"></div></div>'+
        '<div class="hd-status" style="color:'+color+'">'+(cal===0?'—':p>=90?'✓ Meta':p>=60?'Parcial':'Baixo')+'</div>'+
      '</div>';
    });
    html+='</div>';
    document.getElementById('dayPanel').innerHTML=html;
  });
}

/* ── Render ── */
function renderDay(){
  var tot   = dayTotals();
  var water = waterTotal();
  var html  = '';

  /* Date nav */
  html += renderDateNav();

  /* Macro overview */
  var calPct = nutGoals.calories>0?Math.min(tot.calories/nutGoals.calories*100,100):0;
  var circum  = 2*Math.PI*42; // r=42
  var dash    = circum*(1-calPct/100);
  html += '<div class="macro-overview">'+
    '<div class="calorie-ring">'+
      '<svg width="100" height="100" viewBox="0 0 100 100">'+
        '<circle class="ring-bg" cx="50" cy="50" r="42"/>'+
        '<circle class="ring-fill" cx="50" cy="50" r="42" stroke-dasharray="'+circum.toFixed(1)+'" stroke-dashoffset="'+dash.toFixed(1)+'" stroke="'+MACRO_COLORS.cal+'"/>'+
      '</svg>'+
      '<div class="ring-label">'+
        '<div class="ring-cal">'+tot.calories+'</div>'+
        '<div class="ring-sub">/ '+nutGoals.calories+'<br>kcal</div>'+
      '</div>'+
    '</div>'+
    '<div class="macro-bars">'+
      macroBar('🥩 Proteína', tot.protein_g, nutGoals.protein_g, 'g', MACRO_COLORS.pro)+
      macroBar('🍞 Carboidratos', tot.carbs_g, nutGoals.carbs_g, 'g', MACRO_COLORS.car)+
      macroBar('🥑 Gorduras', tot.fat_g, nutGoals.fat_g, 'g', MACRO_COLORS.fat)+
    '</div>'+
  '</div>';

  /* Water */
  var wPct = nutGoals.water_ml>0?Math.min(water/nutGoals.water_ml*100,100):0;
  html += '<div class="water-bar">'+
    '<div class="water-icon">💧</div>'+
    '<div class="water-info">'+
      '<div class="water-lbl">Hidratação</div>'+
      '<div class="water-track"><div class="water-fill" style="width:'+wPct.toFixed(0)+'%"></div></div>'+
      '<div class="water-nums">'+water+'ml / '+nutGoals.water_ml+'ml ('+wPct.toFixed(0)+'%)</div>'+
    '</div>'+
    '<div class="water-btns">'+
      '<button class="water-btn" onclick="addWater(200)">+200ml</button>'+
      '<button class="water-btn" onclick="addWater(300)">+300ml</button>'+
      '<button class="water-btn" onclick="addWater(500)">+500ml</button>'+
      (waterLogs.length?'<button class="water-btn remove" onclick="removeWater()">-último</button>':'')+
    '</div>'+
  '</div>';

  /* Meals */
  MEALS.forEach(function(m){
    var mt   = mealTotals(m.id);
    var items= dayLogs.filter(function(l){return l.meal_type===m.id;});
    var isOpen=openMeals[m.id];
    html += '<div class="meal-section'+(isOpen?' open':'')+'" id="ms-'+m.id+'">'+
      '<div class="meal-header" onclick="toggleMeal(\''+m.id+'\')">'+
        '<span class="meal-icon">'+m.icon+'</span>'+
        '<span class="meal-name">'+m.label+'</span>'+
        (mt.calories>0?'<span class="meal-cals">'+mt.calories+' kcal · '+mt.protein_g.toFixed(0)+'g prot</span>':'<span class="meal-cals" style="color:#e0e0e0">vazio</span>')+
        '<span class="meal-toggle">▼</span>'+
      '</div>'+
      '<div class="meal-body">'+
        items.map(function(l){ return foodItem(l); }).join('')+
        '<button class="meal-add-btn" onclick="openAddFood(\''+m.id+'\')">+ Adicionar alimento</button>'+
      '</div>'+
    '</div>';
  });

  /* Meta goals connection */
  if(metaGoals.length){
    html += '<div class="meta-conn">'+
      '<div class="mc-title">🎯 Metas de Saúde conectadas</div>'+
      metaGoals.slice(0,4).map(function(g){
        return '<div class="mc-goal">'+
          '<span class="mc-gname">'+esc(g.title)+'</span>'+
          '<div class="mc-bar"><div class="mc-bar-fill" style="width:'+(g.progress||0)+'%"></div></div>'+
          '<span class="mc-pct">'+(g.progress||0)+'%</span>'+
          '<button onclick="quickProg(\''+g.id+'\')" style="padding:2px 7px;border:1px solid #FED7AA;border-radius:5px;background:#FFF7ED;font-size:.65rem;cursor:pointer;font-family:inherit;color:#EA580C;font-weight:600">+10%</button>'+
        '</div>';
      }).join('')+
      '<a href="../metas/" style="font-size:.7rem;color:#EA580C;font-weight:600;text-decoration:none;display:block;margin-top:8px">Ver todas as metas de saúde →</a>'+
    '</div>';
  }

  document.getElementById('dayPanel').innerHTML=html;
}

function renderDateNav(){
  return '<div class="date-nav">'+
    '<button onclick="changeDate(-1)">◀</button>'+
    '<div><div class="dn-date">'+fmtDate(currentDate)+'</div>'+
      '<div class="dn-sub">'+(isToday(currentDate)?'Hoje':'')+'</div></div>'+
    (isToday(currentDate)?'':'<button class="date-today-btn" onclick="goToday()">Hoje</button>')+
    '<button onclick="changeDate(1)"'+(isToday(currentDate)?' disabled style="opacity:.3"':'')+'>▶</button>'+
  '</div>';
}

function macroBar(lbl,val,goal,unit,color){
  var pct=goal>0?Math.min(val/goal*100,100):0;
  var over=val>goal;
  return '<div class="mb-row">'+
    '<span class="mb-lbl">'+lbl+'</span>'+
    '<div class="mb-track"><div class="mb-fill" style="width:'+pct.toFixed(0)+'%;background:'+color+'"></div></div>'+
    '<span class="mb-val'+(over?' mb-over':'')+'">'+val.toFixed(0)+' / '+goal+unit+(over?' ⚠':'')+'</span>'+
  '</div>';
}

function foodItem(l){
  return '<div class="food-item">'+
    '<div style="flex:1">'+
      '<div class="fi-name">'+esc(l.food_name)+'<span class="fi-qty"> · '+l.quantity+' '+esc(l.unit)+'</span></div>'+
    '</div>'+
    '<div class="fi-macros">'+
      '<span class="fi-macro fi-cal">'+l.calories+' kcal</span>'+
      (l.protein_g>0?'<span class="fi-macro fi-pro">'+parseFloat(l.protein_g).toFixed(0)+'g P</span>':'')+
      (l.carbs_g>0?'<span class="fi-macro fi-car">'+parseFloat(l.carbs_g).toFixed(0)+'g C</span>':'')+
      (l.fat_g>0?'<span class="fi-macro fi-fat">'+parseFloat(l.fat_g).toFixed(0)+'g G</span>':'')+
    '</div>'+
    '<button class="fi-del" onclick="deleteFood(\''+l.id+'\')">×</button>'+
  '</div>';
}

function renderGoalsPanel(){
  var metaNut=metaGoals.filter(function(g){return g.hz==='anual'||g.hz==='mensal';});
  document.getElementById('dayPanel').innerHTML=
    '<div class="goals-form">'+
      '<div class="gf-title">⚙️ Metas Diárias de Nutrição</div>'+
      '<div class="gf-grid">'+
        gfField('calories','🔥 Calorias (kcal)',nutGoals.calories)+
        gfField('protein_g','🥩 Proteína (g)',nutGoals.protein_g)+
        gfField('carbs_g','🍞 Carboidratos (g)',nutGoals.carbs_g)+
        gfField('fat_g','🥑 Gorduras (g)',nutGoals.fat_g)+
        gfField('water_ml','💧 Água (ml)',nutGoals.water_ml)+
      '</div>'+
      '<button class="gf-save" onclick="saveGoals()">💾 Salvar metas</button>'+
    '</div>'+
    (metaNut.length?
    '<div class="meta-conn" style="margin-top:14px">'+
      '<div class="mc-title">🎯 Metas de saúde do módulo Metas</div>'+
      metaNut.map(function(g){
        return '<div class="mc-goal">'+
          '<span class="mc-gname">'+esc(g.title)+(g.target?' <span style="font-size:.65rem;color:#aaa">— '+esc(g.target)+'</span>':'')+'</span>'+
          '<div class="mc-bar"><div class="mc-bar-fill" style="width:'+(g.progress||0)+'%"></div></div>'+
          '<span class="mc-pct">'+(g.progress||0)+'%</span>'+
        '</div>';
      }).join('')+
      '<p style="font-size:.67rem;color:#aaa;margin-top:8px">Defina metas de saúde no módulo Metas (área: Saúde) para elas aparecerem aqui.</p>'+
    '</div>':''+
    '<div class="meta-conn" style="margin-top:14px;background:#f9f9f9;border-color:#eee">'+
      '<div class="mc-title" style="color:#bbb">🎯 Nenhuma meta de saúde encontrada</div>'+
      '<p style="font-size:.75rem;color:#aaa">Crie metas com área "Saúde" no <a href="../metas/" style="color:#EA580C;font-weight:600">módulo Metas</a> e elas aparecerão aqui automaticamente.</p>'+
    '</div>');
}

function gfField(id,lbl,val){
  return '<div class="gf-field"><label>'+lbl+'</label>'+
    '<input type="number" id="gf-'+id+'" value="'+val+'" min="0"/></div>';
}

/* ── Add food modal ── */
function openAddFood(mealId){
  addingMeal=mealId;
  var meal=MEALS.find(function(m){return m.id===mealId;});

  var savedHtml='';
  if(savedFoods.length){
    savedHtml='<div class="mf-field"><label>Alimentos salvos (toque para preencher)</label>'+
      '<div class="saved-foods">'+
      savedFoods.map(function(f){
        return '<div class="sf-item" onclick="fillFood(\''+f.id+'\')">'+
          '<div><div class="sf-name">'+esc(f.name)+'</div>'+
          '<div class="sf-macros">'+f.calories+' kcal · '+parseFloat(f.protein_g).toFixed(0)+'g P · '+parseFloat(f.carbs_g).toFixed(0)+'g C · '+parseFloat(f.fat_g).toFixed(0)+'g G</div></div>'+
          '<span class="sf-cals">'+f.default_qty+' '+esc(f.unit)+'</span>'+
        '</div>';
      }).join('')+
      '</div></div>';
  }

  document.getElementById('modalTitle').textContent=meal.icon+' Adicionar a '+meal.label;
  document.getElementById('modalForm').innerHTML=
    '<div class="mf">'+
      savedHtml+
      '<div class="mf-field"><label>Alimento *</label><input id="mf-food" type="text" placeholder="Ex: Frango grelhado, Arroz, Whey..."/></div>'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>Quantidade</label><input id="mf-qty" type="number" value="1" min="0" step="0.1"/></div>'+
        '<div class="mf-field"><label>Unidade</label><select id="mf-unit">'+
          ['porção','g','ml','unidade','colher','xícara','fatia'].map(function(u){return'<option>'+u+'</option>';}).join('')+
        '</select></div>'+
      '</div>'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>🔥 Calorias</label><input id="mf-cal" type="number" value="0" min="0"/></div>'+
        '<div class="mf-field"><label>🥩 Proteína (g)</label><input id="mf-pro" type="number" value="0" min="0" step="0.1"/></div>'+
      '</div>'+
      '<div class="mf-row">'+
        '<div class="mf-field"><label>🍞 Carb (g)</label><input id="mf-car" type="number" value="0" min="0" step="0.1"/></div>'+
        '<div class="mf-field"><label>🥑 Gordura (g)</label><input id="mf-fat" type="number" value="0" min="0" step="0.1"/></div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<input type="checkbox" id="mf-save" style="width:14px;height:14px;accent-color:#EA580C"/>'+
        '<label for="mf-save" style="font-size:.75rem;color:#888;cursor:pointer">Salvar este alimento para usar novamente</label>'+
      '</div>'+
      '<div class="modal-actions">'+
        '<button class="btn-cancel" onclick="closeModal()">Cancelar</button>'+
        '<button class="btn-save" onclick="addFood()">Adicionar</button>'+
      '</div>'+
    '</div>';

  document.getElementById('modalBg').classList.remove('hidden');
  document.getElementById('mf-food').focus();
}

function fillFood(sfId){
  var f=savedFoods.find(function(x){return x.id===sfId;});
  if(!f)return;
  document.getElementById('mf-food').value=f.name;
  document.getElementById('mf-qty').value=f.default_qty;
  document.getElementById('mf-unit').value=f.unit;
  document.getElementById('mf-cal').value=f.calories;
  document.getElementById('mf-pro').value=f.protein_g;
  document.getElementById('mf-car').value=f.carbs_g;
  document.getElementById('mf-fat').value=f.fat_g;
}

function addFood(){
  var name=(document.getElementById('mf-food').value||'').trim();
  if(!name){alert('Digite o nome do alimento.');return;}
  var data={
    id:uid(), date:currentDate, meal_type:addingMeal,
    food_name:name,
    quantity:parseFloat(document.getElementById('mf-qty').value)||1,
    unit:document.getElementById('mf-unit').value,
    calories:parseInt(document.getElementById('mf-cal').value)||0,
    protein_g:parseFloat(document.getElementById('mf-pro').value)||0,
    carbs_g:parseFloat(document.getElementById('mf-car').value)||0,
    fat_g:parseFloat(document.getElementById('mf-fat').value)||0
  };
  var ops=[db.from('nutrition_logs').insert(data)];
  if(document.getElementById('mf-save').checked){
    ops.push(db.from('saved_foods').insert({
      id:uid(),name:name,calories:data.calories,protein_g:data.protein_g,
      carbs_g:data.carbs_g,fat_g:data.fat_g,default_qty:data.quantity,unit:data.unit,meal_type:addingMeal
    }));
  }
  document.querySelector('.btn-save').textContent='Salvando...';
  Promise.all(ops).then(function(res){
    dayLogs.push(Array.isArray(res[0])?res[0][0]:data);
    if(res[1]) savedFoods.unshift(Array.isArray(res[1])?res[1][0]:{id:uid(),name:name,calories:data.calories,protein_g:data.protein_g,carbs_g:data.carbs_g,fat_g:data.fat_g,default_qty:data.quantity,unit:data.unit});
    closeModal(); renderDay();
  }).catch(function(e){alert('Erro: '+e.message);document.querySelector('.btn-save').textContent='Adicionar';});
}

function deleteFood(id){
  db.from('nutrition_logs').eq('id',id).delete().then(function(){
    dayLogs=dayLogs.filter(function(l){return l.id!==id;});
    renderDay();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Water ── */
function addWater(ml){
  var data={id:uid(),date:currentDate,amount_ml:ml};
  db.from('water_logs').insert(data).then(function(res){
    waterLogs.push(Array.isArray(res)?res[0]:data);
    renderDay();
  }).catch(function(e){alert('Erro: '+e.message);});
}
function removeWater(){
  if(!waterLogs.length)return;
  var last=waterLogs[waterLogs.length-1];
  db.from('water_logs').eq('id',last.id).delete().then(function(){
    waterLogs.pop(); renderDay();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Goals ── */
function saveGoals(){
  var data={
    calories:parseInt(document.getElementById('gf-calories').value)||2000,
    protein_g:parseInt(document.getElementById('gf-protein_g').value)||150,
    carbs_g:parseInt(document.getElementById('gf-carbs_g').value)||200,
    fat_g:parseInt(document.getElementById('gf-fat_g').value)||65,
    water_ml:parseInt(document.getElementById('gf-water_ml').value)||2500
  };
  db.from('nutrition_goals').eq('id','default').update(data).then(function(){
    Object.assign(nutGoals,data);
    document.querySelector('.gf-save').textContent='✓ Salvo!';
    setTimeout(function(){document.querySelector('.gf-save').textContent='💾 Salvar metas';},2000);
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Metas connection ── */
function quickProg(id){
  var g=metaGoals.find(function(x){return x.id===id;});
  if(!g)return;
  var newPct=Math.min(100,(g.progress||0)+10);
  db.from('goals').eq('id',id).update({progress:newPct}).then(function(){
    g.progress=newPct; renderDay();
  }).catch(function(e){alert('Erro: '+e.message);});
}

/* ── Navigation ── */
function toggleMeal(id){ openMeals[id]=!openMeals[id]; renderDay(); }
function changeDate(d){ currentDate=shiftDate(currentDate,d); loadDay(); }
function goToday(){ currentDate=todayStr(); loadDay(); }
function goDate(d){ currentDate=d; currentTab='hoje'; renderTabs(); loadDay(); }
function closeModal(){ document.getElementById('modalBg').classList.add('hidden'); addingMeal=null; }

function setTab(t){
  currentTab=t; renderTabs();
  if(t==='hoje')      loadDay();
  else if(t==='metas') renderGoalsPanel();
  else if(t==='hist')  loadHistory();
}

function renderTabs(){
  var tabs=[{id:'hoje',icon:'☀️',lbl:'Hoje'},{id:'metas',icon:'⚙️',lbl:'Metas'},{id:'hist',icon:'📊',lbl:'Histórico'}];
  document.getElementById('nutTabs').innerHTML=tabs.map(function(t){
    return '<button class="nut-tab'+(t.id===currentTab?' on':'')+'" onclick="setTab(\''+t.id+'\')">'+t.icon+' '+t.lbl+'</button>';
  }).join('');
}

/* ── Globals ── */
window.setTab=setTab; window.changeDate=changeDate; window.goToday=goToday;
window.goDate=goDate; window.toggleMeal=toggleMeal; window.openAddFood=openAddFood;
window.fillFood=fillFood; window.addFood=addFood; window.deleteFood=deleteFood;
window.addWater=addWater; window.removeWater=removeWater; window.saveGoals=saveGoals;
window.quickProg=quickProg; window.closeModal=closeModal;

document.getElementById('modalBg').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeModal();});

/* ── Init ── */
renderTabs(); loadDay();

}());
